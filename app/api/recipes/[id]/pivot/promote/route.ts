import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/server-auth";
import { overrideScopeFor } from "@/app/lib/card-scope";
import { validateCardPayload } from "@/app/lib/card-validate";
import { applyCanonicalFallback } from "@/app/lib/card-fallback";
import type { PivotMeta } from "@/app/lib/pivot/meta";
import type { CookCard } from "@/app/types";

export const runtime = "nodejs";

// "Replace original." Promotes a pivot fork's revised card onto the parent
// recipe's RecipeOverride — at the PARENT's scope, so a fix made on a family
// recipe lands for the whole family — then folds the pivot row back into the
// parent: cook logs move over, cook counts merge, mise checks copy across
// (the parent now renders the revised card, so the pivot's entry keys are
// the live ones), and the pivot SavedRecipe is deleted. The library goes
// from two tiles back to one, and the one is fixed.
//
// Undo path: the promotion is an ordinary RecipeOverride write, so "Reset
// to original" on the parent restores the canonical parsed card.
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const row = await prisma.savedRecipe.findUnique({ where: { id } });
  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (row.userId !== user.userId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const meta = row.pivotMeta as unknown as Partial<PivotMeta> | null;
  if (!meta) {
    return NextResponse.json({ error: "not a pivot fork" }, { status: 404 });
  }
  const revised = meta.revisedCard as CookCard | undefined;
  if (!revised) {
    return NextResponse.json(
      { error: "this pivot has no revised card to promote" },
      { status: 422 }
    );
  }

  const parent = row.pivotedFromSavedRecipeId
    ? await prisma.savedRecipe.findUnique({
        where: { id: row.pivotedFromSavedRecipeId },
        include: { parsedRecipe: { select: { sourceUrl: true, cardJson: true } } },
      })
    : null;
  if (!parent || parent.parsedRecipeId !== row.parsedRecipeId) {
    return NextResponse.json(
      { error: "the original recipe is gone — keep this as its own recipe instead" },
      { status: 409 }
    );
  }

  // Edit permission on the PARENT, mirroring PATCH /api/recipes/[id]:
  // personal scope → only the saver; family scope → any current member.
  if (parent.familyId === null) {
    if (parent.userId !== user.userId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  } else {
    const member = await prisma.familyMember.findUnique({
      where: {
        userId_familyId: { userId: user.userId, familyId: parent.familyId },
      },
    });
    if (!member) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const validated = validateCardPayload(revised, parent.parsedRecipe.sourceUrl);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 422 });
  }

  // The revised card was frozen at pivot time — pull any canonical
  // enrichment it predates (dish photo, tagline) before it becomes the
  // parent's override, so the promotion doesn't itself create a stale copy.
  const promotedCard = applyCanonicalFallback(
    validated.card,
    parent.parsedRecipe.cardJson as unknown as CookCard
  );

  const scope = overrideScopeFor(parent);
  await prisma.$transaction(async (tx) => {
    // Hand-rolled upsert: @@unique([parsedRecipeId, userId, familyId]) is
    // Postgres-NULL-distinct, so findFirst → update | create.
    const existing = await tx.recipeOverride.findFirst({
      where: {
        parsedRecipeId: parent.parsedRecipeId,
        userId: scope.userId,
        familyId: scope.familyId,
      },
    });
    if (existing) {
      await tx.recipeOverride.update({
        where: { id: existing.id },
        data: {
          cardJson: promotedCard as unknown as object,
          updatedById: user.userId,
        },
      });
    } else {
      await tx.recipeOverride.create({
        data: {
          parsedRecipeId: parent.parsedRecipeId,
          userId: scope.userId,
          familyId: scope.familyId,
          cardJson: promotedCard as unknown as object,
          updatedById: user.userId,
        },
      });
    }

    const checks = await tx.miseCheck.findMany({
      where: { savedRecipeId: row.id },
    });
    if (checks.length > 0) {
      await tx.miseCheck.createMany({
        data: checks.map((c) => ({
          savedRecipeId: parent.id,
          userId: c.userId,
          entryKey: c.entryKey,
        })),
        skipDuplicates: true,
      });
    }

    // Cook history earned on the pivot belongs to the recipe the cook keeps.
    await tx.cookLog.updateMany({
      where: { savedRecipeId: row.id },
      data: { savedRecipeId: parent.id },
    });
    const pivotLastCooked = row.lastCookedAt?.getTime() ?? 0;
    const parentLastCooked = parent.lastCookedAt?.getTime() ?? 0;
    if (row.cookCount > 0 || pivotLastCooked > parentLastCooked) {
      await tx.savedRecipe.update({
        where: { id: parent.id },
        data: {
          ...(row.cookCount > 0 ? { cookCount: { increment: row.cookCount } } : {}),
          ...(pivotLastCooked > parentLastCooked
            ? { lastCookedAt: row.lastCookedAt }
            : {}),
        },
      });
    }

    await tx.savedRecipe.delete({ where: { id: row.id } });
  });

  return NextResponse.json({
    ok: true,
    parentSavedRecipeId: parent.id,
    scope: parent.familyId === null ? "personal" : "family",
  });
}
