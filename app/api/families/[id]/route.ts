import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/server-auth";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const me = await prisma.familyMember.findUnique({
    where: { userId_familyId: { userId: user.userId, familyId: id } },
  });
  if (!me) return NextResponse.json({ error: "not found" }, { status: 404 });

  const family = await prisma.family.findUnique({
    where: { id },
    include: {
      members: {
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
        },
        orderBy: { joinedAt: "asc" },
      },
    },
  });
  if (!family) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({
    id: family.id,
    name: family.name,
    myRole: me.role,
    members: family.members.map((m) => ({
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      image: m.user.image,
      role: m.role,
      joinedAt: m.joinedAt.getTime(),
      isMe: m.user.id === user.userId,
    })),
  });
}

// Owner can delete. Anyone can leave (DELETE /members/me).
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const me = await prisma.familyMember.findUnique({
    where: { userId_familyId: { userId: user.userId, familyId: id } },
  });
  if (!me || me.role !== "OWNER") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  await prisma.family.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
