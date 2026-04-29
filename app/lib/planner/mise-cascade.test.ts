import { describe, expect, it } from "vitest";
import type { CookCard } from "../../types";
import {
  cascadeEntryKeys,
  entryKeyOf,
  ingredientSlug,
  type Slugify,
} from "./mise-cascade";

// Test stub mirroring the real findSprite for the slugs we care about.
const stubSlugify: Slugify = (name) => {
  const n = name.trim().toLowerCase();
  const map: Record<string, string> = {
    "olive oil": "olive-oil",
    "yellow onion": "yellow-onion",
    onion: "yellow-onion",
    tomato: "tomato",
    salt: "salt",
  };
  return map[n] ?? null;
};

// Minimal CookCard fixture. Only fields the cascade reads.
function card(): CookCard {
  return {
    title: "Test",
    source_url: "https://example.com/t",
    servings: "4",
    pantry_ingredients: [
      { item: "olive oil", quantity: "2", unit: "tbsp" },
      { item: "salt", quantity: "1", unit: "tsp" },
    ],
    equipment: [],
    steps: [
      {
        number: 1,
        headline: "sweat",
        action: "soften the onion",
        icon: "flame",
        ingredients: [
          { item: "yellow onion", quantity: "1", unit: "" },
          { item: "olive oil", quantity: "1", unit: "tsp" }, // same slug, different unit
        ],
      },
      {
        number: 2,
        headline: "simmer",
        action: "add tomatoes",
        icon: "soup",
        ingredients: [
          { item: "tomato", quantity: "2", unit: "cans" },
        ],
      },
    ],
  } as unknown as CookCard;
}

describe("ingredientSlug", () => {
  it("resolves common items via the slugify function", () => {
    expect(ingredientSlug({ item: "olive oil" }, stubSlugify)).toBe("olive-oil");
    expect(ingredientSlug({ item: "Yellow onion" }, stubSlugify)).toBe("yellow-onion");
  });

  it("falls back to lowercased trimmed item when no sprite matches", () => {
    expect(ingredientSlug({ item: "  Galangal  " }, stubSlugify)).toBe("galangal");
  });
});

describe("entryKeyOf", () => {
  it("combines slug and unit", () => {
    expect(entryKeyOf({ item: "olive oil", unit: "tbsp" }, stubSlugify)).toBe(
      "olive-oil|tbsp",
    );
  });

  it("normalizes unit case", () => {
    expect(entryKeyOf({ item: "Tomato", unit: "Cans" }, stubSlugify)).toBe(
      "tomato|cans",
    );
  });

  it("emits empty unit when missing", () => {
    expect(entryKeyOf({ item: "salt" }, stubSlugify)).toBe("salt|");
  });
});

describe("cascadeEntryKeys", () => {
  it("returns empty when pantry is empty", () => {
    expect(cascadeEntryKeys(card(), new Set(), stubSlugify)).toEqual([]);
  });

  it("matches a single pantry slug across multiple units in the card", () => {
    const keys = cascadeEntryKeys(card(), new Set(["olive-oil"]), stubSlugify);
    // Both pantry-section "olive oil tbsp" and step-1 "olive oil tsp"
    expect(keys.sort()).toEqual(["olive-oil|tbsp", "olive-oil|tsp"]);
  });

  it("does not touch entries the family has not bought", () => {
    const keys = cascadeEntryKeys(card(), new Set(["olive-oil"]), stubSlugify);
    expect(keys.includes("salt|tsp")).toBe(false);
    expect(keys.includes("yellow-onion|")).toBe(false);
  });

  it("matches multiple pantry slugs in one pass", () => {
    const keys = cascadeEntryKeys(
      card(),
      new Set(["olive-oil", "tomato", "salt"]),
      stubSlugify,
    );
    expect(keys.sort()).toEqual(
      ["olive-oil|tbsp", "olive-oil|tsp", "salt|tsp", "tomato|cans"].sort(),
    );
  });

  it("ignores cards with no pantry section", () => {
    const c = card();
    c.pantry_ingredients = [];
    const keys = cascadeEntryKeys(c, new Set(["olive-oil"]), stubSlugify);
    // Step 1 still has olive oil
    expect(keys).toEqual(["olive-oil|tsp"]);
  });
});
