import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/server-auth";

export const runtime = "nodejs";

// List the user's families.
export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const memberships = await prisma.familyMember.findMany({
    where: { userId: user.userId },
    include: {
      family: {
        include: {
          _count: { select: { members: true, recipes: true } },
        },
      },
    },
    orderBy: { joinedAt: "asc" },
  });

  return NextResponse.json({
    families: memberships.map((m) => ({
      id: m.family.id,
      name: m.family.name,
      role: m.role,
      memberCount: m.family._count.members,
      recipeCount: m.family._count.recipes,
      joinedAt: m.joinedAt.getTime(),
    })),
  });
}

// Create a new family. The creator becomes OWNER.
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let name: string;
  try {
    const body = await req.json();
    name = String(body?.name ?? "").trim();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (!name || name.length > 60) {
    return NextResponse.json(
      { error: "name required (1–60 chars)" },
      { status: 400 }
    );
  }

  const family = await prisma.family.create({
    data: {
      name,
      members: {
        create: { userId: user.userId, role: "OWNER" },
      },
    },
  });
  return NextResponse.json({ id: family.id, name: family.name });
}
