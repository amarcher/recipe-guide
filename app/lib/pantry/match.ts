// Matches pantry items against the ingredients a meal actually calls for.
// Same identity rule as the mise cascade (mise-cascade.ts): an item's key is
// its sprite slug when one resolves, otherwise its normalized display text.
// Slug resolution is injected so this module stays vitest-loadable with a
// stub; production passes `findSprite` from sprites-core.

export type Slugify = (name: string) => string | null;

export type PantryKeyable = { slug: string | null; display: string };

export function pantryKey(item: PantryKeyable, slugify: Slugify): string {
  return item.slug ?? slugify(item.display) ?? item.display.trim().toLowerCase();
}

export type CardIngredientSource = {
  pantry_ingredients?: Array<{ item: string }> | null;
  steps?: Array<{ ingredients?: Array<{ item: string }> | null }> | null;
} | null;

export function cardIngredientNames(card: CardIngredientSource): string[] {
  if (!card) return [];
  return [
    ...(card.pantry_ingredients ?? []).map((i) => i.item),
    ...(card.steps ?? []).flatMap((s) => (s.ingredients ?? []).map((i) => i.item)),
  ];
}

// Returns the pantry keys (subset of `pantryKeys`) that this meal's
// ingredient names touch, in the iteration order of `pantryKeys` so callers
// get a stable, urgency-preserving order.
export function matchMealToPantry(
  ingredientNames: string[],
  pantryKeys: ReadonlySet<string>,
  slugify: Slugify,
): string[] {
  if (pantryKeys.size === 0 || ingredientNames.length === 0) return [];
  const touched = new Set<string>();
  for (const name of ingredientNames) {
    const key = slugify(name) ?? name.trim().toLowerCase();
    if (pantryKeys.has(key)) touched.add(key);
  }
  return [...pantryKeys].filter((k) => touched.has(k));
}
