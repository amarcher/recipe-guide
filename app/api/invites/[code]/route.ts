import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/server-auth";

export const runtime = "nodejs";

// Look up an invite for previewing before accepting (no auth required so the
// /invite/[code] page can render the family name even when signed-out).
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ code: string }> }
) {
  const { code } = await ctx.params;
  const inv = await prisma.familyInvite.findUnique({
    where: { code },
    include: { family: { select: { id: true, name: true } } },
  });
  if (!inv) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (inv.usedAt) return NextResponse.json({ error: "used" }, { status: 410 });
  if (inv.expiresAt < new Date())
    return NextResponse.json({ error: "expired" }, { status: 410 });
  return NextResponse.json({
    family: inv.family,
    expiresAt: inv.expiresAt.getTime(),
  });
}

// Accept the invite. Requires sign-in.
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ code: string }> }
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { code } = await ctx.params;

  const inv = await prisma.familyInvite.findUnique({ where: { code } });
  if (!inv) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (inv.usedAt) return NextResponse.json({ error: "used" }, { status: 410 });
  if (inv.expiresAt < new Date())
    return NextResponse.json({ error: "expired" }, { status: 410 });

  // Already a member? Idempotent — just return the family.
  const existing = await prisma.familyMember.findUnique({
    where: {
      userId_familyId: { userId: user.userId, familyId: inv.familyId },
    },
  });
  if (existing) {
    return NextResponse.json({ familyId: inv.familyId, alreadyMember: true });
  }

  await prisma.$transaction([
    prisma.familyMember.create({
      data: {
        userId: user.userId,
        familyId: inv.familyId,
        role: "MEMBER",
      },
    }),
    prisma.familyInvite.update({
      where: { code },
      data: { usedAt: new Date(), usedById: user.userId },
    }),
  ]);

  return NextResponse.json({ familyId: inv.familyId });
}
