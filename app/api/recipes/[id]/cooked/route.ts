import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/server-auth";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const familyIds = (
    await prisma.familyMember.findMany({
      where: { userId: user.userId },
      select: { familyId: true },
    })
  ).map((m) => m.familyId);

  const row = await prisma.savedRecipe.findFirst({
    where: {
      id,
      OR: [
        { userId: user.userId, familyId: null },
        ...(familyIds.length ? [{ familyId: { in: familyIds } }] : []),
      ],
    },
  });
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  const updated = await prisma.savedRecipe.update({
    where: { id: row.id },
    data: {
      lastCookedAt: new Date(),
      cookCount: { increment: 1 },
    },
  });

  // Reset mise checks when marking cooked, mirroring local behavior.
  await prisma.miseCheck.deleteMany({
    where: { savedRecipeId: row.id, userId: user.userId },
  });

  return NextResponse.json({
    cookCount: updated.cookCount,
    lastCookedAt: updated.lastCookedAt?.getTime() ?? null,
  });
}
