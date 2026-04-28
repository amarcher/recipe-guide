import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/server-auth";
import { overrideScopeFor } from "@/app/lib/card-resolver";

export const runtime = "nodejs";

async function canEdit(
  userId: string,
  saved: { userId: string; familyId: string | null }
): Promise<boolean> {
  if (saved.familyId === null) return saved.userId === userId;
  const member = await prisma.familyMember.findUnique({
    where: { userId_familyId: { userId, familyId: saved.familyId } },
  });
  return !!member;
}

// Reset the recipe to its canonical (parsed) form by deleting the
// scope's override row. Idempotent: returns ok even when no override exists.
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const row = await prisma.savedRecipe.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(await canEdit(user.userId, row))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const scope = overrideScopeFor(row);
  await prisma.recipeOverride.deleteMany({
    where: {
      parsedRecipeId: row.parsedRecipeId,
      userId: scope.userId,
      familyId: scope.familyId,
    },
  });
  return NextResponse.json({ ok: true });
}
