// PLANNER: canonical-only. Reasons about candidate.composedCardDraft (the
// LLM-generated pre-save artifact) — never resolveCard / RecipeOverride.
// See app/lib/card-resolver.ts banner.
import { prisma } from "@/app/lib/prisma";
import type { PlanIntake, MenuSkeleton } from "@/app/lib/planner/schemas";
import type { CookCard } from "@/app/types";
import { findSprite } from "@/app/lib/sprites-core";
import { loadRecentRecipes } from "@/app/lib/planner/history";

type CandidateRow = {
  id: string;
  slot: "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK";
  eaters: Array<"ADULTS" | "KIDS">;
  title: string;
  heroIngredientSlugs: string[];
  approxCookMinutes: number;
  kidFitTag: "RELIABLE" | "STRETCH" | "NEW";
  composedCardDraft: unknown;
};

type Dimensions = {
  reuse: number;
  pantry: number;
  freshness: number;
  kidFit: number;
  moodFit: number;
};

type FilterReason = string;

function allSlugs(card: CookCard | null): string[] {
  if (!card) return [];
  const out = new Set<string>();
  for (const ing of card.pantry_ingredients ?? []) {
    const slug = findSprite(ing.item) ?? ing.item.trim().toLowerCase();
    if (slug) out.add(slug);
  }
  for (const s of card.steps ?? []) {
    for (const ing of s.ingredients ?? []) {
      const slug = findSprite(ing.item) ?? ing.item.trim().toLowerCase();
      if (slug) out.add(slug);
    }
  }
  return [...out];
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

function hardFilterReason(
  c: CandidateRow,
  slugs: string[],
  intake: PlanIntake
): FilterReason | null {
  const slugSet = new Set(slugs);
  const eatersIncludeKids = c.eaters.includes("KIDS");

  for (const avoid of intake.constraints.avoid ?? []) {
    const s = avoid.toLowerCase();
    for (const slug of slugSet) {
      if (slug.includes(s) || s.includes(slug)) {
        return `contains "${avoid}" (on avoid list)`;
      }
    }
  }

  if (eatersIncludeKids) {
    for (const bad of intake.kidRules?.hardNos ?? []) {
      const target = (bad.slug ?? bad.display).toLowerCase();
      for (const slug of slugSet) {
        if (slug.includes(target) || target.includes(slug)) {
          return `contains "${bad.display}" (kid hardNo)`;
        }
      }
    }
  }

  const equipmentOut = intake.constraints.equipmentOut ?? [];
  if (equipmentOut.length) {
    const card = c.composedCardDraft as CookCard | null;
    const eq = new Set(
      (card?.equipment ?? []).concat(
        (card?.steps ?? []).flatMap((s) => s.equipment ?? [])
      ).map((s) => s.toLowerCase())
    );
    for (const ne of equipmentOut) {
      const needle = ne.toLowerCase();
      for (const item of eq) {
        if (item.includes(needle)) {
          return `requires "${ne}" (equipmentOut)`;
        }
      }
    }
  }

  return null;
}

function scoreCandidate(
  c: CandidateRow,
  slugs: string[],
  intake: PlanIntake,
  skeleton: MenuSkeleton,
  recentSlugs: Array<Set<string>>
): { dims: Dimensions; composite: number } {
  const candidateSlugs = new Set(slugs);

  const heroSlugsForSlotType = new Set(
    skeleton.heroIngredients
      .filter((h) =>
        h.appearsIn.some((ref) => ref.toUpperCase().startsWith(c.slot))
      )
      .map((h) => h.slug ?? h.label.toLowerCase())
  );
  const heroHits = [...candidateSlugs].filter((s) => heroSlugsForSlotType.has(s))
    .length;
  const reuse =
    heroSlugsForSlotType.size === 0
      ? 0
      : Math.min(1, heroHits / Math.max(1, Math.min(3, heroSlugsForSlotType.size)));

  const pantrySlugs = new Set(
    (intake.pantry ?? [])
      .map((p) => p.slug ?? p.display.toLowerCase())
      .filter(Boolean) as string[]
  );
  const mustUseSlugs = new Set(
    (intake.pantry ?? [])
      .filter((p) => p.mustUse)
      .map((p) => p.slug ?? p.display.toLowerCase())
      .filter(Boolean) as string[]
  );
  let pantryHits = 0;
  let mustUseHits = 0;
  for (const s of candidateSlugs) {
    if (pantrySlugs.has(s)) pantryHits++;
    if (mustUseSlugs.has(s)) mustUseHits++;
  }
  const pantry = Math.min(
    1,
    pantryHits * 0.2 + mustUseHits * 0.4
  );

  let worstSim = 0;
  for (const r of recentSlugs) {
    worstSim = Math.max(worstSim, jaccard(candidateSlugs, r));
  }
  const freshness = 1 - worstSim;

  const eatersIncludeKids = c.eaters.includes("KIDS");
  const tagBase = c.kidFitTag === "RELIABLE" ? 1 : c.kidFitTag === "STRETCH" ? 0.7 : 0.3;
  const reliableBoost = eatersIncludeKids
    ? [...candidateSlugs].some((s) =>
        (intake.kidRules?.reliableHits ?? []).some((r) => {
          const target = (r.slug ?? r.display).toLowerCase();
          return s.includes(target) || target.includes(s);
        })
      )
      ? 0.15
      : 0
    : 0;
  const kidFit = eatersIncludeKids ? Math.min(1, tagBase + reliableBoost) : 1;

  const moodFit =
    (intake.mood.useUp >= 0.5 && pantryHits > 0 ? 0.5 : 0) +
    (intake.mood.explore >= 0.5 && c.kidFitTag === "NEW" ? 0.5 : 0) +
    (intake.mood.survival >= 0.5 && c.approxCookMinutes <= 30 ? 0.5 : 0) +
    0.1;

  const w = {
    reuse: 0.30,
    pantry: 0.15 + 0.20 * intake.mood.useUp,
    freshness: 0.10 + 0.20 * intake.mood.explore,
    kidFit: eatersIncludeKids ? 0.30 : 0,
    moodFit: 0.10,
  };
  const wsum = w.reuse + w.pantry + w.freshness + w.kidFit + w.moodFit;
  const dims: Dimensions = { reuse, pantry, freshness, kidFit, moodFit };
  const composite =
    (dims.reuse * w.reuse +
      dims.pantry * w.pantry +
      dims.freshness * w.freshness +
      dims.kidFit * w.kidFit +
      dims.moodFit * w.moodFit) /
    wsum;

  return { dims, composite };
}

// Roadmap item 1.7 — derive a mood-based decision signal per candidate
// from existing signals. No LLM inference; pure heuristic so a tile can
// render `FAST · FORGIVING` etc. as a single eyebrow.
type MoodTagValue =
  | "FAST_FORGIVING"
  | "EARNED_EFFORT"
  | "USE_IT_UP"
  | "KID_APPROVED"
  | "LEFTOVER_FRIENDLY"
  | "ONE_PAN";

function deriveMoodTags(
  c: CandidateRow,
  slugs: string[],
  intake: PlanIntake,
  dims: Dimensions,
): MoodTagValue[] {
  const tags: MoodTagValue[] = [];
  const eatersIncludeKids = c.eaters.includes("KIDS");

  if (c.approxCookMinutes <= 30) tags.push("FAST_FORGIVING");
  else if (c.approxCookMinutes >= 60) tags.push("EARNED_EFFORT");

  const candidateSlugs = new Set(slugs);
  const mustUseHits = (intake.pantry ?? []).filter(
    (p) => p.mustUse && candidateSlugs.has(p.slug ?? p.display.toLowerCase()),
  ).length;
  if (mustUseHits >= 1) tags.push("USE_IT_UP");

  if (eatersIncludeKids && c.kidFitTag === "RELIABLE" && dims.kidFit >= 0.85) {
    tags.push("KID_APPROVED");
  }

  // LEFTOVER_FRIENDLY and ONE_PAN deferred — need 2.15 outcome data and an
  // equipment-tagging story respectively. Reserved in the enum so a future
  // pass can fill them without a migration.

  return tags;
}

function badgesFor(
  c: CandidateRow,
  slugs: string[],
  intake: PlanIntake,
  dims: Dimensions
): string[] {
  const out: string[] = [];
  const candidateSlugs = new Set(slugs);
  const mustUseHits = (intake.pantry ?? []).filter(
    (p) => p.mustUse && candidateSlugs.has((p.slug ?? p.display.toLowerCase()))
  ).length;
  const pantryHits = (intake.pantry ?? []).filter((p) =>
    candidateSlugs.has(p.slug ?? p.display.toLowerCase())
  ).length;

  if (mustUseHits >= 2) out.push("clears-the-fridge");
  if (pantryHits >= 3) out.push("uses-pantry-x3");
  if (c.approxCookMinutes < 30) out.push("under-30-min");
  else if (c.approxCookMinutes < 40) out.push("under-40-min");
  if (c.eaters.includes("KIDS") && c.kidFitTag === "RELIABLE") out.push("kid-reliable");
  if (
    intake.aspirations?.adults?.some((a) =>
      c.title.toLowerCase().includes(a.toLowerCase().split(" ")[0])
    ) ||
    intake.aspirations?.adults?.some((a) =>
      a.toLowerCase().split(" ").some((w) => c.title.toLowerCase().includes(w))
    )
  ) {
    if (dims.freshness > 0.6) out.push("honors-aspiration");
  }
  return out;
}

export async function scoreAndRankPlan(planId: string): Promise<void> {
  const plan = await prisma.weeklyPlan.findUnique({ where: { id: planId } });
  if (!plan) return;
  const intake = plan.intake as PlanIntake | null;
  const skeleton = plan.skeleton as MenuSkeleton | null;
  if (!intake || !skeleton) return;

  const candidates = await prisma.mealCandidate.findMany({
    where: { planId, discardedAt: null },
  });
  const recentRecipes = await loadRecentRecipes(plan.createdById, plan.familyId);
  const recentSlugs = recentRecipes
    .filter((r) => r.daysSinceCooked !== null && r.daysSinceCooked < 14 && r.cookCount > 0)
    .map((r) => new Set(r.heroIngredientSlugs.map((s) => s.toLowerCase())));

  type Scored = {
    id: string;
    combo: string;
    filtered: string | null;
    composite: number;
    dims: Dimensions;
    badges: string[];
    moodTags: MoodTagValue[];
  };
  const scored: Scored[] = candidates.map((c) => {
    const row: CandidateRow = {
      id: c.id,
      slot: c.slot,
      eaters: c.eaters,
      title: c.title,
      heroIngredientSlugs: c.heroIngredientSlugs,
      approxCookMinutes: c.approxCookMinutes,
      kidFitTag: c.kidFitTag,
      composedCardDraft: c.composedCardDraft,
    };
    const card = c.composedCardDraft as unknown as CookCard | null;
    const slugs = allSlugs(card);
    const filtered = hardFilterReason(row, slugs, intake);
    if (filtered) {
      return {
        id: c.id,
        combo: `${c.slot}:${[...c.eaters].sort().join("+")}`,
        filtered,
        composite: 0,
        dims: { reuse: 0, pantry: 0, freshness: 0, kidFit: 0, moodFit: 0 },
        badges: [],
        moodTags: [],
      };
    }
    const { dims, composite } = scoreCandidate(row, slugs, intake, skeleton, recentSlugs);
    const badges = badgesFor(row, slugs, intake, dims);
    const moodTags = deriveMoodTags(row, slugs, intake, dims);
    return {
      id: c.id,
      combo: `${c.slot}:${[...c.eaters].sort().join("+")}`,
      filtered: null,
      composite,
      dims,
      badges,
      moodTags,
    };
  });

  const byGroup = new Map<string, Scored[]>();
  for (const s of scored) {
    if (s.filtered) continue;
    const list = byGroup.get(s.combo) ?? [];
    list.push(s);
    byGroup.set(s.combo, list);
  }

  for (const list of byGroup.values()) {
    list.sort((a, b) => b.composite - a.composite);
    const kept = new Map<string, string[]>();
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      const candidate = candidates.find((c) => c.id === item.id)!;
      const card = candidate.composedCardDraft as unknown as CookCard | null;
      const slugs = new Set(allSlugs(card));
      for (const prevId of kept.keys()) {
        const prev = new Set(kept.get(prevId)!);
        const sim = jaccard(slugs, prev);
        if (sim > 0.6) item.composite *= 0.7;
      }
      kept.set(item.id, [...slugs]);
    }
    list.sort((a, b) => b.composite - a.composite);
    list.forEach((s, idx) => ((s as Scored & { rank: number }).rank = idx + 1));
  }

  const now = new Date();
  for (const s of scored) {
    const rank = (s as Scored & { rank?: number }).rank ?? null;
    await prisma.mealCandidate.update({
      where: { id: s.id },
      data: {
        rank,
        score: s.composite,
        filteredOutReason: s.filtered,
        scoreBreakdownJson: s.dims as unknown as object,
        badges: s.badges,
        moodTags: s.moodTags,
        rankedAt: now,
      },
    });
  }
}
