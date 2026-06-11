import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/server-auth";
import { loadPlanIfOwned } from "@/app/lib/plan-auth";
import { recordPlanEvent } from "@/app/lib/planner/events";
import { recordFamilyEventForPlan } from "@/app/lib/family-events";
import { findSprite } from "@/app/lib/sprites-core";
import { decideLearningOutcome } from "@/app/lib/planner/outcome-learning";
import { latestVerdictsByRole } from "@/app/lib/planner/taste-panel";
import type {
  EaterRole,
  MealVerdict,
} from "@/app/generated/prisma/client";
import type { CookCard } from "@/app/types";

export const runtime = "nodejs";

// Roadmap item 2.15 — capture per-eater verdicts after a planner-cooked
// meal and feed them back into ProfilePreference.
//
// Body shape:
//   { entries: Array<{ eaterRole: "ADULT"|"KID", verdict: "ATE"|"PICKED"|"REFUSED",
//                       profileId?: string, notes?: string }> }
//
// Multiple entries are accepted in one POST so the photo-prompt UI can
// emit one tap per eater. Each entry:
//   - persists a MealOutcome row (no per-user scope columns per privacy
//     decision #4),
//   - if the meal has a candidate.composedCardDraft with hero ingredients,
//     fans the verdict out across the slug list (the planner's coarse but
//     useful proxy: "ate the dish" = "this slug worked"),
//   - re-evaluates ProfilePreference per slug via the
//     promote/demote rules in app/lib/planner/outcome-learning.ts.

type IncomingEntry = {
  eaterRole: EaterRole;
  verdict: MealVerdict;
  profileId?: string;
  notes?: string;
};

function isVerdict(v: unknown): v is MealVerdict {
  return v === "ATE" || v === "PICKED" || v === "REFUSED";
}
function isRole(v: unknown): v is EaterRole {
  return v === "ADULT" || v === "KID";
}

// GET powers the prompt's prefill: `recorded` is this meal's own verdicts
// (so a reload doesn't nag twice), `previous` is the most recent per-role
// verdict from any earlier cook of the same dish (title match within the
// plan's scope) — the "same as last time" one-tap.
export async function GET(
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
    include: { candidate: { select: { title: true } } },
  });
  if (!meal) return NextResponse.json({ error: "meal not found" }, { status: 404 });

  const scope = plan.familyId
    ? { familyId: plan.familyId }
    : { familyId: null, createdById: plan.createdById };

  const [ownRows, priorRows] = await Promise.all([
    prisma.mealOutcome.findMany({
      where: { plannedMealId: mealId },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { eaterRole: true, verdict: true, createdAt: true },
    }),
    prisma.mealOutcome.findMany({
      where: {
        plannedMealId: { not: mealId },
        plannedMeal: {
          plan: scope,
          candidate: {
            title: { equals: meal.candidate.title.trim(), mode: "insensitive" },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 24,
      select: { eaterRole: true, verdict: true, createdAt: true },
    }),
  ]);

  const toSnapshot = (r: {
    eaterRole: EaterRole;
    verdict: MealVerdict;
    createdAt: Date;
  }) => ({
    eaterRole: r.eaterRole,
    verdict: r.verdict,
    createdAt: r.createdAt.getTime(),
  });

  return NextResponse.json({
    recorded: ownRows.length
      ? latestVerdictsByRole(ownRows.map(toSnapshot))
      : null,
    previous: priorRows.length
      ? latestVerdictsByRole(priorRows.map(toSnapshot))
      : null,
  });
}

export async function POST(
  req: NextRequest,
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

  let body: { entries?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const incoming = (Array.isArray(body.entries) ? body.entries : []) as unknown[];
  const entries: IncomingEntry[] = [];
  for (const raw of incoming) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    if (!isRole(r.eaterRole) || !isVerdict(r.verdict)) continue;
    entries.push({
      eaterRole: r.eaterRole,
      verdict: r.verdict,
      profileId: typeof r.profileId === "string" ? r.profileId : undefined,
      notes: typeof r.notes === "string" ? r.notes : undefined,
    });
  }
  if (entries.length === 0) {
    return NextResponse.json({ error: "no entries" }, { status: 400 });
  }

  // Persist outcomes.
  const created = await prisma.$transaction(
    entries.map((e) =>
      prisma.mealOutcome.create({
        data: {
          plannedMealId: mealId,
          profileId: e.profileId ?? null,
          eaterRole: e.eaterRole,
          verdict: e.verdict,
          notes: e.notes ?? null,
        },
      }),
    ),
  );

  // Feed into ProfilePreference for family-scoped plans only (Profiles
  // are family primitives per item 1.2).
  let updatedPreferences = 0;
  if (plan.familyId) {
    const card = meal.candidate.composedCardDraft as unknown as CookCard | null;
    const heroSlugs: string[] = collectSlugs(card);
    if (heroSlugs.length > 0) {
      // Lazy-ensure profiles exist (creator is opt-in via intake; we don't
      // over-create here).
      for (const e of entries) {
        const profile = await ensureProfileForRole(plan.familyId, e.eaterRole);
        for (const slug of heroSlugs) {
          const updated = await applyLearning(profile.id, slug, e.verdict);
          if (updated) updatedPreferences++;
        }
      }
    }
  }

  await recordPlanEvent(
    planId,
    "meal.cooked",
    { mealId, outcomes: created.map((c) => c.id), updatedPreferences },
    user.userId,
  );
  await recordFamilyEventForPlan(planId, {
    kind: "meal.outcome.recorded",
    payload: { mealId, count: created.length, updatedPreferences },
    actorId: user.userId,
  });

  return NextResponse.json({
    ok: true,
    outcomeCount: created.length,
    updatedPreferences,
  });
}

function collectSlugs(card: CookCard | null): string[] {
  if (!card) return [];
  const out = new Set<string>();
  for (const ing of card.pantry_ingredients ?? []) {
    const s = findSprite(ing.item);
    if (s) out.add(s);
  }
  for (const step of card.steps ?? []) {
    for (const ing of step.ingredients ?? []) {
      const s = findSprite(ing.item);
      if (s) out.add(s);
    }
  }
  return [...out];
}

async function ensureProfileForRole(familyId: string, role: EaterRole) {
  const existing = await prisma.profile.findFirst({
    where: { familyId, kind: role },
  });
  if (existing) return existing;
  return prisma.profile.create({
    data: {
      familyId,
      kind: role,
      name: role === "ADULT" ? "Adults" : "Kids",
    },
  });
}

// Returns true if a ProfilePreference row was created or modified.
async function applyLearning(
  profileId: string,
  slug: string,
  verdict: MealVerdict,
): Promise<boolean> {
  // Fetch the recent outcome history for this (profile, slug).
  const recent = await prisma.mealOutcome.findMany({
    where: {
      profileId,
      plannedMeal: {
        candidate: {
          // Coarse: any candidate whose composedCardDraft contains this slug.
          // Cheap-ish since we've already narrowed to one profile.
          heroIngredientSlugs: { has: slug },
        },
      },
    },
    take: 12,
    orderBy: { createdAt: "desc" },
    select: { verdict: true, createdAt: true },
  });
  const decision = decideLearningOutcome(
    recent.map((r) => ({
      verdict: r.verdict,
      createdAt: r.createdAt.getTime(),
    })),
  );
  if (decision.kind === "noop") return false;

  // Hand-rolled upsert by (profileId, kind, normalizedKey) per the
  // NULL-distinct rule.
  const targetKind =
    decision.kind === "promote_reliable_hit"
      ? "RELIABLE_HIT"
      : "EXPERIMENTING";
  const existing = await prisma.profilePreference.findFirst({
    where: { profileId, slug },
  });
  if (existing) {
    if (existing.kind === targetKind) {
      await prisma.profilePreference.update({
        where: { id: existing.id },
        data: {
          lastConfirmedAt: new Date(),
          evidenceCount: { increment: 1 },
        },
      });
    } else {
      await prisma.profilePreference.update({
        where: { id: existing.id },
        data: {
          kind: targetKind,
          lastConfirmedAt: new Date(),
          source: "outcome",
        },
      });
    }
    void verdict;
    return true;
  }
  await prisma.profilePreference.create({
    data: {
      profileId,
      kind: targetKind,
      slug,
      display: slug.replace(/-/g, " "),
      source: "outcome",
    },
  });
  return true;
}
