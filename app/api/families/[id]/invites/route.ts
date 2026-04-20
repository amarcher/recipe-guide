import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/server-auth";

export const runtime = "nodejs";

const INVITE_TTL_DAYS = 14;

function generateCode(): string {
  // URL-safe, ~16 chars, ~96 bits of entropy.
  return randomBytes(12)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

// List active invites for a family (admin/owner only).
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
  if (!me || (me.role !== "OWNER" && me.role !== "ADMIN"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const invites = await prisma.familyInvite.findMany({
    where: { familyId: id, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({
    invites: invites.map((i) => ({
      code: i.code,
      expiresAt: i.expiresAt.getTime(),
      createdAt: i.createdAt.getTime(),
    })),
  });
}

// Create a new invite (admin/owner only).
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const me = await prisma.familyMember.findUnique({
    where: { userId_familyId: { userId: user.userId, familyId: id } },
  });
  if (!me || (me.role !== "OWNER" && me.role !== "ADMIN"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const code = generateCode();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
  const invite = await prisma.familyInvite.create({
    data: {
      familyId: id,
      code,
      createdById: user.userId,
      expiresAt,
    },
  });
  return NextResponse.json({
    code: invite.code,
    expiresAt: invite.expiresAt.getTime(),
  });
}
