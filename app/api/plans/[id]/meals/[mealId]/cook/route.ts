import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/server-auth";
import { loadPlanIfOwned } from "@/app/lib/plan-auth";
import { recordPlanEvent } from "@/app/lib/planner/events";
import {
  publishCandidate,
  PublishCandidateError,
} from "@/app/lib/planner/publish-candidate";

export const runtime = "nodejs";

// Materializes a committed meal into a SavedRecipe for the current user so
// the existing /recipe/[id] execution flow can pick it up. Idempotent —
// publishCandidate("execute") returns the same SavedRecipe on repeat.
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; mealId: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id: planId, mealId } = await ctx.params;

  const plan = await loadPlanIfOwned(user.userId, planId);
  if (!plan) return NextResponse.json({ error: "not found" }, { status: 404 });

  const meal = await prisma.plannedMeal.findFirst({
    where: { id: mealId, planId },
    include: { candidate: true },
  });
  if (!meal) return NextResponse.json({ error: "meal not found" }, { status: 404 });

  let result;
  try {
    result = await publishCandidate({
      candidate: meal.candidate,
      userId: user.userId,
      familyId: plan.familyId,
      scope: "execute",
    });
  } catch (err) {
    if (err instanceof PublishCandidateError && err.code === "malformed_card") {
      return NextResponse.json(
        { error: "candidate card draft is malformed" },
        { status: 500 },
      );
    }
    throw err;
  }

  await recordPlanEvent(
    planId,
    "meal.cooked",
    {
      mealId,
      candidateId: meal.chosenCandidateId,
      savedRecipeId: result.savedRecipeId,
      parsedRecipeId: result.parsedRecipeId,
      newSavedRecipe: !result.alreadyExisted,
    },
    user.userId,
  );

  return NextResponse.json({ savedRecipeId: result.savedRecipeId });
}
