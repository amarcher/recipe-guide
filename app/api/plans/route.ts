import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/server-auth";

export const runtime = "nodejs";

function nextMonday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const offset = day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + offset);
  return d;
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let familyId: string | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    familyId = body?.familyId ?? null;
  } catch {
    familyId = null;
  }

  if (familyId) {
    const m = await prisma.familyMember.findUnique({
      where: { userId_familyId: { userId: user.userId, familyId } },
    });
    if (!m) {
      return NextResponse.json(
        { error: "not a member of that family" },
        { status: 403 }
      );
    }
  }

  const plan = await prisma.weeklyPlan.create({
    data: {
      createdById: user.userId,
      familyId,
      weekOf: nextMonday(),
      status: "DRAFT",
    },
  });

  return NextResponse.json({ id: plan.id });
}
