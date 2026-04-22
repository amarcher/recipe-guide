import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/server-auth";
import { loadPlanIfOwned } from "@/app/lib/plan-auth";
import type { CookCard } from "@/app/types";

export const runtime = "nodejs";

// Materializes a committed meal (MealCandidate's composedCardDraft) into a
// SavedRecipe for the current user so the existing /recipe/[id] execution
// flow can pick it up. Idempotent — returns the same SavedRecipe on repeat.
export async function POST(
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
    include: { candidate: true },
  });
  if (!meal) return NextResponse.json({ error: "meal not found" }, { status: 404 });

  const card = meal.candidate.composedCardDraft as unknown as CookCard;
  if (!card?.source_url || !card?.title) {
    return NextResponse.json(
      { error: "candidate card draft is malformed" },
      { status: 500 }
    );
  }

  const parsed = await prisma.parsedRecipe.upsert({
    where: { sourceUrl: card.source_url },
    create: {
      sourceUrl: card.source_url,
      title: card.title,
      cardJson: card as unknown as object,
      modelUsed: "planner-candidate",
    },
    update: {
      // Keep the title and card fresh in case the candidate was tuned.
      title: card.title,
      cardJson: card as unknown as object,
    },
  });

  const familyId = plan.familyId;
  const existing = await prisma.savedRecipe.findFirst({
    where: {
      userId: user.userId,
      parsedRecipeId: parsed.id,
      familyId: familyId ?? null,
    },
  });
  const saved =
    existing ??
    (await prisma.savedRecipe.create({
      data: {
        userId: user.userId,
        parsedRecipeId: parsed.id,
        familyId: familyId ?? null,
      },
    }));

  return NextResponse.json({ savedRecipeId: saved.id });
}
