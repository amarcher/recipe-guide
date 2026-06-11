// Two read modes for a recipe card. Pick the right one for your surface:
//
//   resolveCard / resolveCardsForSavedRecipes
//     → VIEWER surfaces (recipe page, library list, fork). Applies the
//       per-scope RecipeOverride on top of the canonical ParsedRecipe.cardJson.
//
//   loadCanonicalCard
//     → PLANNER surfaces (skeleton / candidates / scoring / aggregation /
//       recent-history). Reasoning about a recipe must use the parsed card,
//       NEVER an applied override — otherwise the same dish scores differently
//       in family A vs family B because of a renamed ingredient (silent
//       correctness bug). See roadmap item 1.4.
//
// Anything in app/lib/planner/** or app/api/plans/** is a planner read and
// must NOT import resolveCard / resolveCardsForSavedRecipes — enforced by
// app/lib/planner/canonical-only.test.ts.
import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/app/lib/prisma";
import { applyCanonicalFallback } from "@/app/lib/card-fallback";
import type { CookCard } from "@/app/types";

// Minimal shape the resolver needs. Permits both `include: { parsedRecipe: true }`
// (full row) and `include: { parsedRecipe: { select: { cardJson, ... } } }`
// (partial select, used by the library list endpoint).
type SavedWithParsed = {
  id: string;
  parsedRecipeId: string;
  userId: string;
  familyId: string | null;
  pivotMeta?: Prisma.JsonValue | null;
  parsedRecipe: { cardJson: Prisma.JsonValue };
};

export type ResolvedCard = {
  card: CookCard;
  overrideUpdatedAt: Date | null;
  overrideUpdatedById: string | null;
};

// Pivot SavedRecipes carry their visible card inside pivotMeta.revisedCard
// rather than a per-(parsedRecipe, scope) RecipeOverride row, because the
// pivot's edits should NOT bleed onto the user's other personal-scope save
// of the same canonical recipe. Treat pivotMeta as the authoritative card
// when present and short-circuit the override lookup.
type PivotMetaShape = { revisedCard?: CookCard };
function pivotCard(saved: SavedWithParsed): CookCard | null {
  const meta = saved.pivotMeta as PivotMetaShape | null | undefined;
  return meta?.revisedCard ?? null;
}

// Given a SavedRecipe row, return the CookCard the user should see — its
// scope's RecipeOverride applied on top of the canonical ParsedRecipe.cardJson.
// Personal-scope saves resolve against (parsedRecipeId, userId, familyId=null).
// Family-scope saves resolve against (parsedRecipeId, userId=null, familyId).
export async function resolveCard(saved: SavedWithParsed): Promise<ResolvedCard> {
  const canonical = saved.parsedRecipe.cardJson as unknown as CookCard;
  const pivot = pivotCard(saved);
  if (pivot) {
    return {
      card: applyCanonicalFallback(pivot, canonical),
      overrideUpdatedAt: null,
      overrideUpdatedById: null,
    };
  }
  const override = await prisma.recipeOverride.findFirst({
    where: {
      parsedRecipeId: saved.parsedRecipeId,
      userId: saved.familyId === null ? saved.userId : null,
      familyId: saved.familyId,
    },
  });
  return {
    card: override
      ? applyCanonicalFallback(override.cardJson as unknown as CookCard, canonical)
      : canonical,
    overrideUpdatedAt: override?.updatedAt ?? null,
    overrideUpdatedById: override?.updatedById ?? null,
  };
}

// Batched resolver for list endpoints. One Prisma query for all overrides.
export async function resolveCardsForSavedRecipes(
  rows: SavedWithParsed[]
): Promise<Map<string, ResolvedCard>> {
  const result = new Map<string, ResolvedCard>();
  if (rows.length === 0) return result;

  // Resolve pivot rows first — they bypass RecipeOverride entirely.
  const nonPivotRows: SavedWithParsed[] = [];
  for (const r of rows) {
    const pivot = pivotCard(r);
    if (pivot) {
      result.set(r.id, {
        card: applyCanonicalFallback(
          pivot,
          r.parsedRecipe.cardJson as unknown as CookCard
        ),
        overrideUpdatedAt: null,
        overrideUpdatedById: null,
      });
    } else {
      nonPivotRows.push(r);
    }
  }
  if (nonPivotRows.length === 0) return result;

  const conditions = nonPivotRows.map((r) =>
    r.familyId === null
      ? { parsedRecipeId: r.parsedRecipeId, userId: r.userId, familyId: null }
      : { parsedRecipeId: r.parsedRecipeId, userId: null, familyId: r.familyId }
  );
  const overrides = await prisma.recipeOverride.findMany({
    where: { OR: conditions },
  });

  const keyOf = (parsedId: string, userId: string | null, familyId: string | null) =>
    `${parsedId}|${userId ?? ""}|${familyId ?? ""}`;
  const overrideByKey = new Map<string, (typeof overrides)[number]>();
  for (const o of overrides) {
    overrideByKey.set(keyOf(o.parsedRecipeId, o.userId, o.familyId), o);
  }

  for (const r of nonPivotRows) {
    const k =
      r.familyId === null
        ? keyOf(r.parsedRecipeId, r.userId, null)
        : keyOf(r.parsedRecipeId, null, r.familyId);
    const o = overrideByKey.get(k);
    const canonical = r.parsedRecipe.cardJson as unknown as CookCard;
    result.set(r.id, {
      card: o
        ? applyCanonicalFallback(o.cardJson as unknown as CookCard, canonical)
        : canonical,
      overrideUpdatedAt: o?.updatedAt ?? null,
      overrideUpdatedById: o?.updatedById ?? null,
    });
  }
  return result;
}

// Always returns the parsed card without any overrides. Use from planner /
// scoring / aggregation code that should reason about the recipe-as-parsed.
export function loadCanonicalCard(parsedRecipe: {
  cardJson: Prisma.JsonValue;
}): CookCard {
  return parsedRecipe.cardJson as unknown as CookCard;
}

export { overrideScopeFor } from "./card-scope";
