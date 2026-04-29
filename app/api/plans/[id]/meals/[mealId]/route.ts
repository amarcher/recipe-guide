import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/server-auth";
import { loadPlanIfOwned } from "@/app/lib/plan-auth";
import { rebuildGroceryForPlan } from "@/app/lib/grocery-rollup";
import { recordPlanEvent } from "@/app/lib/planner/events";
import { recordFamilyEventForPlan } from "@/app/lib/family-events";
import type { PlannedMealStatus } from "@/app/generated/prisma/client";

export const runtime = "nodejs";

// Roadmap item 2.16 — mid-week pivot affordances. PATCH accepts:
//   { status: "SKIPPED" | "COOKED_FROM_LEFTOVERS", notes?: string }
//   { swapToCandidateId: string }
// Skip → status flip, grocery rebuild (drops items only this meal needed).
// Leftovers → status flip, grocery rebuild, no cookCount change.
// Swap → re-point to a sibling candidate in the same (slot, eaters);
//        triggers grocery rebuild.
const VALID_STATUSES: ReadonlySet<PlannedMealStatus> = new Set([
  "QUEUED",
  "COOKED",
  "SKIPPED",
  "COOKED_FROM_LEFTOVERS",
]);

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; mealId: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id: planId, mealId } = await ctx.params;

  const plan = await loadPlanIfOwned(user.userId, planId);
  if (!plan) return NextResponse.json({ error: "not found" }, { status: 404 });

  let body: {
    status?: string;
    notes?: string;
    swapToCandidateId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const meal = await prisma.plannedMeal.findFirst({
    where: { id: mealId, planId },
  });
  if (!meal) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Swap branch — re-point to a different candidate in the same (slot,
  // eaters). Status returns to QUEUED.
  if (body.swapToCandidateId) {
    const target = await prisma.mealCandidate.findFirst({
      where: { id: body.swapToCandidateId, planId },
    });
    if (!target) {
      return NextResponse.json({ error: "swap target not found" }, { status: 404 });
    }
    if (target.slot !== meal.slot) {
      return NextResponse.json(
        { error: "swap must stay in the same slot" },
        { status: 400 },
      );
    }
    const updated = await prisma.plannedMeal.update({
      where: { id: mealId },
      data: {
        chosenCandidateId: target.id,
        eaters: target.eaters,
        status: "QUEUED",
        cookedAt: null,
        skippedAt: null,
        notes: typeof body.notes === "string" ? body.notes : null,
      },
    });
    await rebuildGroceryForPlan(planId);
    await recordPlanEvent(
      planId,
      "meal.uncommitted",
      {
        action: "swap",
        mealId,
        from: meal.chosenCandidateId,
        to: target.id,
      },
      user.userId,
    );
    await recordFamilyEventForPlan(planId, {
      kind: "meal.swapped",
      payload: {
        mealId,
        from: meal.chosenCandidateId,
        to: target.id,
        title: target.title,
      },
      actorId: user.userId,
    });
    return NextResponse.json({ ok: true, mealId: updated.id });
  }

  // Status branch.
  if (!body.status) {
    return NextResponse.json({ error: "missing status" }, { status: 400 });
  }
  const next = body.status as PlannedMealStatus;
  if (!VALID_STATUSES.has(next)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }

  const data: Record<string, unknown> = {
    status: next,
    notes: typeof body.notes === "string" ? body.notes : null,
  };
  if (next === "SKIPPED") {
    data.skippedAt = new Date();
  } else if (next === "QUEUED") {
    data.skippedAt = null;
    data.cookedAt = null;
  } else if (next === "COOKED" || next === "COOKED_FROM_LEFTOVERS") {
    data.cookedAt = new Date();
  }
  await prisma.plannedMeal.update({ where: { id: mealId }, data });

  // Grocery list always reflects QUEUED meals only — rebuild when status
  // crosses the QUEUED boundary.
  if (next !== meal.status) {
    await rebuildGroceryForPlan(planId);
  }

  let kind: "meal.skipped" | "meal.leftovers" | "meal.cooked" | "meal.uncommitted";
  if (next === "SKIPPED") kind = "meal.skipped";
  else if (next === "COOKED_FROM_LEFTOVERS") kind = "meal.leftovers";
  else if (next === "COOKED") kind = "meal.cooked";
  else kind = "meal.uncommitted";

  await recordPlanEvent(
    planId,
    kind,
    {
      mealId,
      candidateId: meal.chosenCandidateId,
      from: meal.status,
      to: next,
    },
    user.userId,
  );
  await recordFamilyEventForPlan(planId, {
    kind,
    payload: { mealId, from: meal.status, to: next },
    actorId: user.userId,
  });

  return NextResponse.json({ ok: true });
}

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
  await recordFamilyEventForPlan(planId, {
    kind: "meal.uncommitted",
    payload: { mealId, candidateId: meal.chosenCandidateId },
    actorId: user.userId,
  });

  return NextResponse.json({ ok: true });
}
