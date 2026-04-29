import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/server-auth";
import { loadPlanIfOwned } from "@/app/lib/plan-auth";
import { rebuildGroceryForPlan } from "@/app/lib/grocery-rollup";
import { recordPlanEvent } from "@/app/lib/planner/events";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id: planId } = await ctx.params;

  const plan = await loadPlanIfOwned(user.userId, planId);
  if (!plan) return NextResponse.json({ error: "not found" }, { status: 404 });

  let candidateId: string | null = null;
  try {
    const body = await req.json();
    candidateId = body?.candidateId ?? null;
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (!candidateId) {
    return NextResponse.json({ error: "missing candidateId" }, { status: 400 });
  }

  const candidate = await prisma.mealCandidate.findFirst({
    where: { id: candidateId, planId },
  });
  if (!candidate) {
    return NextResponse.json({ error: "candidate not in this plan" }, { status: 404 });
  }

  const existing = await prisma.plannedMeal.findFirst({
    where: { planId, chosenCandidateId: candidateId, status: "QUEUED" },
  });
  if (existing) return NextResponse.json({ id: existing.id, alreadyCommitted: true });

  const meal = await prisma.plannedMeal.create({
    data: {
      planId,
      chosenCandidateId: candidateId,
      slot: candidate.slot,
      eaters: candidate.eaters,
      status: "QUEUED",
    },
  });

  await rebuildGroceryForPlan(planId);

  await recordPlanEvent(
    planId,
    "meal.committed",
    {
      mealId: meal.id,
      candidateId,
      slot: candidate.slot,
      eaters: candidate.eaters,
      title: candidate.title,
    },
    user.userId,
  );

  return NextResponse.json({ id: meal.id });
}
