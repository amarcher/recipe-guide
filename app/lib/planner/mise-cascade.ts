import type { CookCard } from "../../types";

// Roadmap item 1.12 — the read-time mise cascade.
//
// When a family's grocery list shows "olive oil purchased Sunday," every
// queued meal's mise place should reflect that — Andrew shouldn't have to
// re-tap "olive oil" Wednesday night because Alicia already bought it.
//
// The cascade is a *read-time* compute against PantryItem (item 1.3) — no
// new schema, no MiseCheckShared row writes, no execution-layer touches.
// The mise GET endpoint merges these implicit checks into the user's
// returned `checked: string[]`. MisePlace renders them indistinguishably
// from manual checks (per the "execution layer untouchable" rule —
// distinguishing them visually requires explicit user approval).
//
// Match rule: a card ingredient cascades if its resolved slug (via
// `findSprite`) matches a slug in the family's pantry. A given card has
// many ingredients with the same slug at different units (oil "tbsp" in
// step 1, oil "tsp" in step 4). All matching entryKeys cascade together —
// the user bought the ingredient, not a specific unit of it.

export type EntryKey = string;

// The minimal slice of Ingredient we need — keeps tests cheap and decouples
// from any future Ingredient field additions.
export type IngredientLike = { item: string; unit?: string | null };

// Slug-resolution function. Production passes `findSprite` from sprites-core;
// tests pass a stub. Injected (rather than imported) so this module stays
// vitest-loadable — sprites-core uses the `@/sprites/manifest.json` alias
// which vitest can't resolve (CLAUDE.md no-path-alias rule).
export type Slugify = (name: string) => string | null;

// Mirrors aggregate.ts:keyFor — must stay in sync. Tests live next to this
// module.
export function entryKeyOf(ing: IngredientLike, slugify: Slugify): EntryKey {
  const slug = slugify(ing.item);
  const base = slug ?? ing.item.trim().toLowerCase();
  const unit = (ing.unit ?? "").trim().toLowerCase();
  return `${base}|${unit}`;
}

export function ingredientSlug(ing: IngredientLike, slugify: Slugify): string {
  return slugify(ing.item) ?? ing.item.trim().toLowerCase();
}

// All ingredients in a card — pantry section + every step. Identical iteration
// shape to aggregate.ts so cascade matches what mise actually renders.
function allIngredients(card: CookCard): IngredientLike[] {
  return [
    ...(card.pantry_ingredients ?? []),
    ...(card.steps ?? []).flatMap((s) => s.ingredients ?? []),
  ];
}

// Returns the set of entryKeys that should appear pre-checked because the
// family has the underlying ingredient in their pantry. Does NOT mutate any
// state; pure compute.
export function cascadeEntryKeys(
  card: CookCard,
  pantrySlugs: ReadonlySet<string>,
  slugify: Slugify,
): EntryKey[] {
  if (pantrySlugs.size === 0) return [];
  const out = new Set<EntryKey>();
  for (const ing of allIngredients(card)) {
    const slug = ingredientSlug(ing, slugify);
    if (pantrySlugs.has(slug)) {
      out.add(entryKeyOf(ing, slugify));
    }
  }
  return [...out];
}
