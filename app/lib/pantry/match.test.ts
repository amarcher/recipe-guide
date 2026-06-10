import { describe, it, expect } from "vitest";
import {
  cardIngredientNames,
  matchMealToPantry,
  pantryKey,
  type Slugify,
} from "./match";

const slugify: Slugify = (name) => {
  const n = name.toLowerCase();
  if (n.includes("cilantro")) return "cilantro";
  if (n.includes("chicken")) return "chicken-thigh";
  if (n.includes("yogurt")) return "greek-yogurt";
  return null;
};

describe("pantryKey", () => {
  it("prefers the stored slug", () => {
    expect(pantryKey({ slug: "cilantro", display: "fresh cilantro" }, slugify)).toBe(
      "cilantro",
    );
  });

  it("falls back to resolving the display name", () => {
    expect(pantryKey({ slug: null, display: "Chicken thighs" }, slugify)).toBe(
      "chicken-thigh",
    );
  });

  it("falls back to normalized display when nothing resolves", () => {
    expect(pantryKey({ slug: null, display: "  Weird Thing " }, slugify)).toBe(
      "weird thing",
    );
  });
});

describe("cardIngredientNames", () => {
  it("walks pantry section plus every step", () => {
    const card = {
      pantry_ingredients: [{ item: "olive oil" }],
      steps: [
        { ingredients: [{ item: "chicken thighs" }] },
        { ingredients: null },
        { ingredients: [{ item: "cilantro leaves" }, { item: "lime" }] },
      ],
    };
    expect(cardIngredientNames(card)).toEqual([
      "olive oil",
      "chicken thighs",
      "cilantro leaves",
      "lime",
    ]);
  });

  it("tolerates null cards and missing sections", () => {
    expect(cardIngredientNames(null)).toEqual([]);
    expect(cardIngredientNames({})).toEqual([]);
  });
});

describe("matchMealToPantry", () => {
  const pantry = new Set(["cilantro", "chicken-thigh", "weird thing"]);

  it("matches by slug across phrasing differences", () => {
    expect(
      matchMealToPantry(["boneless chicken thighs", "rice"], pantry, slugify),
    ).toEqual(["chicken-thigh"]);
  });

  it("matches slug-less items on normalized text", () => {
    expect(matchMealToPantry(["Weird Thing"], pantry, slugify)).toEqual([
      "weird thing",
    ]);
  });

  it("returns matches in pantry order (urgency-preserving) and deduped", () => {
    expect(
      matchMealToPantry(
        ["chicken thighs", "chopped cilantro", "more cilantro"],
        pantry,
        slugify,
      ),
    ).toEqual(["cilantro", "chicken-thigh"]);
  });

  it("returns empty for empty inputs", () => {
    expect(matchMealToPantry([], pantry, slugify)).toEqual([]);
    expect(matchMealToPantry(["cilantro"], new Set(), slugify)).toEqual([]);
  });
});
