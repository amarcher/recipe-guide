import { NextRequest, NextResponse, after } from "next/server";
import { generateObject } from "ai";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/server-auth";
import { loadPlanIfOwned } from "@/app/lib/plan-auth";
import { plannerModel } from "@/app/lib/planner/model";
import { logPlannerUsage } from "@/app/lib/planner/usageLog";
import {
  CandidatesForSlot,
  PlanIntake,
  MenuSkeleton,
  type Eater,
  type MealSlotType,
} from "@/app/lib/planner/schemas";
import { slotCandidateSystemPrompt } from "@/app/lib/planner/prompts";
import { loadRecentRecipes } from "@/app/lib/planner/history";
import { scoreAndRankPlan } from "@/app/lib/planner/scoring";
import { expandDraft } from "@/app/lib/planner/card-expand";
import { recordPlanEvent } from "@/app/lib/planner/events";
import { backfillCandidateDishPhotos } from "@/app/lib/planner/candidate-dish-photo";

export const runtime = "nodejs";
export const maxDuration = 300;

type Combo = { slot: MealSlotType; eaters: Eater[] };

function comboKey(c: Combo): string {
  return `${c.slot}:${[...c.eaters].sort().join("+")}`;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id: planId } = await ctx.params;

  const plan = await loadPlanIfOwned(user.userId, planId);
  if (!plan) return NextResponse.json({ error: "not found" }, { status: 404 });

  const intakeParsed = PlanIntake.safeParse(plan.intake);
  if (!intakeParsed.success) {
    return NextResponse.json(
      { error: "intake missing or invalid — run intake first" },
      { status: 409 }
    );
  }
  const skeletonParsed = MenuSkeleton.safeParse(plan.skeleton);
  if (!skeletonParsed.success) {
    return NextResponse.json(
      { error: "skeleton missing or invalid — run skeleton first" },
      { status: 409 }
    );
  }

  const intake = intakeParsed.data;
  const skeleton = skeletonParsed.data;

  let targetSlot: MealSlotType | null = null;
  let targetEaters: Eater[] | null = null;
  let guidance: string | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.slot) targetSlot = body.slot as MealSlotType;
    if (Array.isArray(body?.eaters)) targetEaters = body.eaters as Eater[];
    if (typeof body?.guidance === "string" && body.guidance.trim()) guidance = body.guidance.trim();
  } catch {
    // no body is fine — whole-plan regen with no guidance
  }

  const combos = new Map<string, Combo>();
  for (const s of intake.slots) {
    if (s.mode !== "PLAN") continue;
    const c: Combo = { slot: s.slot, eaters: s.eaters };
    combos.set(comboKey(c), c);
  }
  if (combos.size === 0) {
    return NextResponse.json(
      { error: "no PLAN-mode slots in intake" },
      { status: 409 }
    );
  }

  let targetCombos = [...combos.values()];
  if (targetSlot && targetEaters) {
    const key = comboKey({ slot: targetSlot, eaters: targetEaters });
    const found = combos.get(key);
    if (!found) {
      return NextResponse.json(
        { error: `no PLAN-mode slot for ${key}` },
        { status: 409 }
      );
    }
    targetCombos = [found];
  }

  const committed = await prisma.plannedMeal.findMany({
    where: { planId, status: "QUEUED" },
    select: { chosenCandidateId: true },
  });
  const protectedIds = new Set(committed.map((m) => m.chosenCandidateId));

  // When scoped to a single combo, preserve non-committed candidates in other
  // slots. When unscoped, wipe everything not committed.
  const scopedWhere =
    targetSlot && targetEaters
      ? {
          planId,
          slot: targetSlot,
          eaters: { hasEvery: targetEaters, hasSome: targetEaters },
          id: { notIn: [...protectedIds] },
        }
      : { planId, id: { notIn: [...protectedIds] } };

  if (targetSlot && targetEaters) {
    // hasEvery+hasSome is an awkward way to express "exactly these eaters" —
    // Prisma's enum-array operators don't have a direct equality predicate.
    // Hand-filter instead.
    const existing = await prisma.mealCandidate.findMany({
      where: { planId, slot: targetSlot, id: { notIn: [...protectedIds] } },
      select: { id: true, eaters: true },
    });
    const sameEaters = (a: Eater[], b: Eater[]) => {
      const sa = [...a].sort().join("+");
      const sb = [...b].sort().join("+");
      return sa === sb;
    };
    const deleteIds = existing
      .filter((c) => sameEaters(c.eaters, targetEaters!))
      .map((c) => c.id);
    if (deleteIds.length) {
      await prisma.mealCandidate.deleteMany({ where: { id: { in: deleteIds } } });
    }
  } else {
    await prisma.mealCandidate.deleteMany({ where: scopedWhere });
  }

  const history = await loadRecentRecipes(plan.createdById, plan.familyId);

  const results = await Promise.all(
    targetCombos.map(async (combo) => {
      const sections: string[] = [
        "SLOT",
        JSON.stringify({ slot: combo.slot, eaters: combo.eaters }),
        "",
        "SKELETON",
        JSON.stringify(skeleton, null, 2),
        "",
        "INTAKE",
        JSON.stringify(intake, null, 2),
        "",
        "RECENT RECIPES",
        history.length
          ? history
              .map(
                (r) =>
                  `- "${r.title}" — cooked ${r.cookCount}x${r.daysSinceCooked !== null ? `, ${r.daysSinceCooked}d ago` : ", never"}`
              )
              .join("\n")
          : "(none)",
      ];

      if (guidance) {
        sections.push(
          "",
          "USER GUIDANCE FOR THIS REGENERATION",
          guidance,
          "",
          "Apply this guidance to the 3-5 candidates you produce."
        );
      }

      const result = await generateObject({
        model: plannerModel,
        schema: CandidatesForSlot,
        system: slotCandidateSystemPrompt(plan.scope),
        prompt: sections.join("\n"),
      });
      logPlannerUsage("planner-candidates", plannerModel, result.usage, { planId });

      return { combo, candidates: result.object.candidates };
    })
  );

  let inserted = 0;
  const newCandidateIds: string[] = [];
  for (const { combo, candidates } of results) {
    for (const c of candidates) {
      const created = await prisma.mealCandidate.create({
        data: {
          planId,
          slot: combo.slot,
          eaters: combo.eaters,
          title: c.title,
          summary: c.summary,
          rationale: c.rationale,
          heroIngredientSlugs: c.heroIngredientSlugs,
          approxCookMinutes: Math.max(1, Math.round(c.approxCookMinutes)),
          kidFitTag: c.kidFitTag,
          composedCardDraft: expandDraft(
            c.composedCardDraft,
            `generated://plan/${planId}/${crypto.randomUUID()}`
          ) as unknown as object,
        },
        select: { id: true },
      });
      newCandidateIds.push(created.id);
      inserted++;
    }
  }

  await scoreAndRankPlan(planId);

  await prisma.weeklyPlan.update({
    where: { id: planId },
    data: { status: "CANDIDATES_READY" },
  });

  await recordPlanEvent(
    planId,
    "candidates.generated",
    {
      combos: targetCombos.length,
      inserted,
      scoped: !!(targetSlot && targetEaters),
      slot: targetSlot ?? null,
      eaters: targetEaters ?? null,
      hasGuidance: !!guidance,
    },
    user.userId,
  );

  // No-op unless IMAGE_GEN_URL is set (typically only in dev with the local
  // MLX server running). Production deployments skip cleanly. The response
  // returns before this finishes; the user refreshes to see photos arrive.
  after(() => backfillCandidateDishPhotos(newCandidateIds));

  return NextResponse.json({ combos: targetCombos.length, inserted });
}
