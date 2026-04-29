import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/server-auth";
import { loadPlanIfOwned } from "@/app/lib/plan-auth";
import { rebuildGroceryForPlan } from "@/app/lib/grocery-rollup";
import { recordPlanEvent } from "@/app/lib/planner/events";

export const runtime = "nodejs";

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; mealId: string }> }
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id: planId, mealId } = await ctx.params;

  const plan = await loadPlanIfOwned(user.userId, planId);
  if (!plan) return NextResponse.json({ error: "not found" }, { status: 404 });

  const meal = await prisma.plannedMeal.findFirst({
    where: { id: mealId, planId },
  });
  if (!meal) return NextResponse.json({ ok: true });

  await prisma.plannedMeal.delete({ where: { id: mealId } });
  await rebuildGroceryForPlan(planId);

  await recordPlanEvent(
    planId,
    "meal.uncommitted",
    {
      mealId,
      candidateId: meal.chosenCandidateId,
      slot: meal.slot,
      eaters: meal.eaters,
    },
    user.userId,
  );

  return NextResponse.json({ ok: true });
}
