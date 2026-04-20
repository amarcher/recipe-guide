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
  return NextResponse.json({
    id: r.id,
    sourceUrl: r.parsedRecipe.sourceUrl,
    title: r.parsedRecipe.title,
    card: r.parsedRecipe.cardJson as unknown as CookCard,
    family: r.family,
    savedAt: r.savedAt.getTime(),
    lastCookedAt: r.lastCookedAt?.getTime() ?? null,
    cookCount: r.cookCount,
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
