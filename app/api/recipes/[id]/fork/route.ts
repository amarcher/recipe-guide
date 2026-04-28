import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/server-auth";
import { resolveCard } from "@/app/lib/card-resolver";

export const runtime = "nodejs";

// "Save a copy to my library." Creates a personal-scope SavedRecipe for the
// viewer pointing at the same ParsedRecipe, plus a personal RecipeOverride
// seeded with the source recipe's resolved (override-applied) card so the
// fork lands looking exactly like what the visitor was viewing. Idempotent:
// if the visitor already has a personal-scope save of this ParsedRecipe,
// returns that existing id without overwriting their override.
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const source = await prisma.savedRecipe.findUnique({
    where: { id },
    include: { parsedRecipe: true },
  });
  if (!source) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Match the existing personal-scope save dedupe pattern (Postgres NULL-distinct
  // means we hand-roll findFirst → create instead of trusting @@unique).
  const existingSaved = await prisma.savedRecipe.findFirst({
    where: {
      userId: user.userId,
      parsedRecipeId: source.parsedRecipeId,
      familyId: null,
    },
  });
  if (existingSaved) {
    return NextResponse.json({ id: existingSaved.id, alreadyExisted: true });
  }

  const resolved = await resolveCard(source);

  const created = await prisma.$transaction(async (tx) => {
    const saved = await tx.savedRecipe.create({
      data: {
        userId: user.userId,
        parsedRecipeId: source.parsedRecipeId,
        familyId: null,
      },
    });
    // Only seed an override if the source had non-canonical content. If the
    // source was already showing the parsed card, the fork starts canonical
    // too — clean state, easy reset.
    if (resolved.overrideUpdatedAt) {
      await tx.recipeOverride.create({
        data: {
          parsedRecipeId: source.parsedRecipeId,
          userId: user.userId,
          familyId: null,
          cardJson: resolved.card as unknown as object,
          forkedFromUserId: source.userId,
          updatedById: user.userId,
        },
      });
    }
    return saved;
  });

  return NextResponse.json({ id: created.id, alreadyExisted: false });
}
