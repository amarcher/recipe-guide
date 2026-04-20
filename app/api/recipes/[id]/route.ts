import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/server-auth";
import type { CookCard } from "@/app/types";

export const runtime = "nodejs";

async function loadOwned(userId: string, id: string) {
  const familyIds = (
    await prisma.familyMember.findMany({
      where: { userId },
      select: { familyId: true },
    })
  ).map((m) => m.familyId);
  return prisma.savedRecipe.findFirst({
    where: {
      id,
      OR: [
        { userId, familyId: null },
        ...(familyIds.length ? [{ familyId: { in: familyIds } }] : []),
      ],
    },
    include: {
      parsedRecipe: true,
      family: { select: { id: true, name: true } },
    },
  });
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const r = await loadOwned(user.userId, id);
  if (!r) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Cook history within the same scope. For a family-scoped recipe, that's
  // every member who has saved + cooked it. For a personal-scoped recipe,
  // it's just self. Includes everyone who has a SavedRecipe row, even if
  // they've cooked 0 times — useful to see "Tabitha saved this too".
  const siblings = await prisma.savedRecipe.findMany({
    where: {
      parsedRecipeId: r.parsedRecipeId,
      familyId: r.familyId,
    },
    include: {
      user: { select: { id: true, name: true, image: true } },
    },
  });
  const cookHistory = siblings
    .map((s) => ({
      userId: s.user.id,
      name: s.user.name,
      image: s.user.image,
      cookCount: s.cookCount,
      lastCookedAt: s.lastCookedAt?.getTime() ?? null,
      isMe: s.user.id === user.userId,
    }))
    // Most cooks first; then most recent; then self last (so we tend to be the
    // anchor on the right edge).
    .sort((a, b) => {
      if (b.cookCount !== a.cookCount) return b.cookCount - a.cookCount;
      return (b.lastCookedAt ?? 0) - (a.lastCookedAt ?? 0);
    });

  return NextResponse.json({
    id: r.id,
    sourceUrl: r.parsedRecipe.sourceUrl,
    title: r.parsedRecipe.title,
    card: r.parsedRecipe.cardJson as unknown as CookCard,
    family: r.family,
    savedAt: r.savedAt.getTime(),
    lastCookedAt: r.lastCookedAt?.getTime() ?? null,
    cookCount: r.cookCount,
    cookHistory,
  });
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  // Only the saver (or family admin) can delete. Keep it simple: only saver.
  const row = await prisma.savedRecipe.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ ok: true });
  if (row.userId !== user.userId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  await prisma.savedRecipe.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
