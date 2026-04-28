import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/app/lib/prisma";
import type { CookCard } from "@/app/types";

// Minimal shape the resolver needs. Permits both `include: { parsedRecipe: true }`
// (full row) and `include: { parsedRecipe: { select: { cardJson, ... } } }`
// (partial select, used by the library list endpoint).
type SavedWithParsed = {
  id: string;
  parsedRecipeId: string;
  userId: string;
  familyId: string | null;
  parsedRecipe: { cardJson: Prisma.JsonValue };
};

export type ResolvedCard = {
  card: CookCard;
  overrideUpdatedAt: Date | null;
  overrideUpdatedById: string | null;
};

// Given a SavedRecipe row, return the CookCard the user should see — its
// scope's RecipeOverride applied on top of the canonical ParsedRecipe.cardJson.
// Personal-scope saves resolve against (parsedRecipeId, userId, familyId=null).
// Family-scope saves resolve against (parsedRecipeId, userId=null, familyId).
export async function resolveCard(saved: SavedWithParsed): Promise<ResolvedCard> {
  const override = await prisma.recipeOverride.findFirst({
    where: {
      parsedRecipeId: saved.parsedRecipeId,
      userId: saved.familyId === null ? saved.userId : null,
      familyId: saved.familyId,
    },
  });
  return {
    card: (override?.cardJson ?? saved.parsedRecipe.cardJson) as unknown as CookCard,
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

  const conditions = rows.map((r) =>
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

  for (const r of rows) {
    const k =
      r.familyId === null
        ? keyOf(r.parsedRecipeId, r.userId, null)
        : keyOf(r.parsedRecipeId, null, r.familyId);
    const o = overrideByKey.get(k);
    result.set(r.id, {
      card: (o?.cardJson ?? r.parsedRecipe.cardJson) as unknown as CookCard,
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
