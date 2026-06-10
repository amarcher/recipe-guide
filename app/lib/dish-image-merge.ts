// Prisma-free merge logic for the override dish-image backfill.
//
// A RecipeOverride is a full-card replacement captured at fork/edit time.
// Overrides created BEFORE the dish-photo backfill (scripts/generate-dish-photos.ts)
// froze a copy of the canonical card that predates `generated_dish_image_url`,
// so those users keep seeing the vignette/swatch fallback even though the
// parent ParsedRecipe now has a perfectly good AI dish photo.
//
// This helper decides, for one (override card, parent card) pair, whether to
// shallow-merge the parent's generated_dish_image_url onto the override — and
// returns the merged card if so. It is deliberately conservative:
//
//   - Only fills the URL when the override LACKS one. A user who edited their
//     card after the backfill (or pivoted to a different image) already has the
//     field set; we never clobber it.
//   - Shallow-merge ONLY the one field. Every other field the user edited
//     (renamed steps, re-scaled ingredients, custom tagline) is preserved
//     byte-for-byte.
//   - No-ops when the parent has no URL to give.
//
// Kept Prisma-free so it can be unit-tested without pulling @/app/lib/prisma
// into vitest's import graph (see card-scope.ts for the same pattern).
import type { CookCard } from "@/app/types";

export type DishImageMergeResult =
  | { changed: false; reason: "override-already-set" | "parent-has-no-image" }
  | { changed: true; card: CookCard; url: string };

// A non-empty trimmed string is the only thing that counts as "has an image".
// Guards against "", null, undefined, and whitespace-only junk that would
// otherwise render as a broken <img>.
function hasImage(url: string | null | undefined): url is string {
  return typeof url === "string" && url.trim().length > 0;
}

// Decide whether to backfill one override card from its parent's canonical card.
// Returns the merged card (a new object — never mutates the input) when a fill
// is warranted, or a no-op result explaining why not.
export function mergeDishImageIntoOverride(
  overrideCard: CookCard,
  parentCard: Pick<CookCard, "generated_dish_image_url">
): DishImageMergeResult {
  if (hasImage(overrideCard.generated_dish_image_url)) {
    return { changed: false, reason: "override-already-set" };
  }
  const url = parentCard.generated_dish_image_url;
  if (!hasImage(url)) {
    return { changed: false, reason: "parent-has-no-image" };
  }
  return {
    changed: true,
    card: { ...overrideCard, generated_dish_image_url: url },
    url,
  };
}
