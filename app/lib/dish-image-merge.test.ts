import { describe, it, expect } from "vitest";
import { mergeDishImageIntoOverride } from "./dish-image-merge";
import type { CookCard } from "@/app/types";

const BLOB = "https://blob.vercel-storage.com/dishes/abc.jpg";

// Minimal CookCard factory. The merge helper only reads
// `generated_dish_image_url`, but we keep a realistic shape (a renamed step,
// a custom tagline) so the "preserves every other field" assertion is honest.
function card(overrides: Partial<CookCard> = {}): CookCard {
  return {
    title: "Alicia's weeknight turkey skillet",
    source_url: "https://example.com/turkey-skillet",
    tagline: "The one the kids actually finish.",
    servings: "4",
    total_time: "30 min",
    active_time: "25 min",
    equipment: ["skillet"],
    pantry_ingredients: [],
    steps: [
      {
        number: 1,
        headline: "Brown the turkey (I add extra garlic)",
        action: "Cook ground turkey until no longer pink.",
        icon: "flame",
        ingredients: [
          { quantity: "1", unit: "lb", item: "ground turkey", prep: null, note: null },
        ],
        equipment: ["skillet"],
        temperature: null,
        duration: "8 min",
        doneness_cue: "no longer pink",
      },
    ],
    ...overrides,
  };
}

describe("mergeDishImageIntoOverride", () => {
  it("fills the URL when the override lacks one and the parent has it", () => {
    const override = card({ generated_dish_image_url: null });
    const parent = { generated_dish_image_url: BLOB };

    const result = mergeDishImageIntoOverride(override, parent);

    expect(result.changed).toBe(true);
    if (!result.changed) throw new Error("expected change");
    expect(result.url).toBe(BLOB);
    expect(result.card.generated_dish_image_url).toBe(BLOB);
  });

  it("treats a missing (undefined) URL the same as null", () => {
    const override = card();
    delete (override as { generated_dish_image_url?: unknown }).generated_dish_image_url;

    const result = mergeDishImageIntoOverride(override, { generated_dish_image_url: BLOB });

    expect(result.changed).toBe(true);
  });

  it("never clobbers an override that already has its own image", () => {
    const existing = "https://blob.vercel-storage.com/dishes/own.jpg";
    const override = card({ generated_dish_image_url: existing });

    const result = mergeDishImageIntoOverride(override, { generated_dish_image_url: BLOB });

    expect(result).toEqual({ changed: false, reason: "override-already-set" });
  });

  it("no-ops when the parent has no image to give", () => {
    const override = card({ generated_dish_image_url: null });

    const result = mergeDishImageIntoOverride(override, { generated_dish_image_url: null });

    expect(result).toEqual({ changed: false, reason: "parent-has-no-image" });
  });

  it("ignores empty / whitespace-only URLs on both sides", () => {
    const blank = card({ generated_dish_image_url: "   " });
    expect(
      mergeDishImageIntoOverride(blank, { generated_dish_image_url: BLOB }).changed
    ).toBe(true); // blank override counts as "lacks one" → fillable

    const blankParent = card({ generated_dish_image_url: null });
    expect(
      mergeDishImageIntoOverride(blankParent, { generated_dish_image_url: "  " })
    ).toEqual({ changed: false, reason: "parent-has-no-image" });
  });

  it("preserves every other edited field and does not mutate the input", () => {
    const override = card({ generated_dish_image_url: null });
    const before = structuredClone(override);

    const result = mergeDishImageIntoOverride(override, { generated_dish_image_url: BLOB });

    if (!result.changed) throw new Error("expected change");
    // The user's edits survive untouched.
    expect(result.card.tagline).toBe(override.tagline);
    expect(result.card.steps[0].headline).toBe("Brown the turkey (I add extra garlic)");
    expect(result.card.title).toBe(override.title);
    // Only the one field changed — strip it from both and compare the rest.
    const stripImage = (c: CookCard) => {
      const copy: Partial<CookCard> = { ...c };
      delete copy.generated_dish_image_url;
      return copy;
    };
    expect(stripImage(result.card)).toEqual(stripImage(override));
    // Input object was not mutated.
    expect(override).toEqual(before);
  });
});
