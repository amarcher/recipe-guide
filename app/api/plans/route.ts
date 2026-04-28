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

  // Distinguish "client didn't say" (auto-attach to primary family) from
  // "client explicitly said null" (deliberate personal scope). NewPlanButton
  // sends no body today, so the JSON parse yields {} and we auto-attach.
  let familyId: string | null = null;
  let familyIdProvided = false;
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (body && typeof body === "object" && "familyId" in body) {
      familyIdProvided = true;
      const v = body.familyId;
      familyId = typeof v === "string" ? v : null;
    }
  } catch {
    familyIdProvided = false;
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
  } else if (!familyIdProvided) {
    // Default: attach to the user's earliest-joined family. Meal planning is
    // collaborative within a family — partners should see each other's plans
    // by default. A client that wants a strictly-personal plan can opt out
    // by sending { familyId: null } explicitly.
    const primary = await prisma.familyMember.findFirst({
      where: { userId: user.userId },
      orderBy: { joinedAt: "asc" },
      select: { familyId: true },
    });
    familyId = primary?.familyId ?? null;
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
