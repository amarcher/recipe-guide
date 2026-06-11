import { describe, it, expect } from "vitest";
import manifest from "@/sprites/manifest.json";
import {
  normalize,
  findSprite,
  spriteUrl,
  spriteAisle,
  aisleForName,
  allSlugs,
} from "./sprites-core";

describe("normalize", () => {
  it("lowercases and collapses whitespace", () => {
    expect(normalize("  Olive   OIL ")).toBe("olive oil");
  });

  it("strips punctuation and treats hyphens/underscores as spaces", () => {
    expect(normalize("Extra-Virgin Olive Oil (cold-pressed), please.")).toBe(
      "extra virgin olive oil cold pressed please"
    );
  });

  it("returns empty string for punctuation-only input", () => {
    expect(normalize("(),.-_")).toBe("");
  });
});

describe("findSprite", () => {
  it("matches an exact alias", () => {
    expect(findSprite("olive oil")).toBe("olive-oil");
  });

  it("matches a slug-shaped name via hyphen normalization", () => {
    expect(findSprite("olive-oil")).toBe("olive-oil");
  });

  it("matches case-insensitively with surrounding noise", () => {
    expect(findSprite("2 tbsp Extra Virgin OLIVE OIL, divided")).toBe(
      "olive-oil"
    );
  });

  it("prefers the longest alias when a shorter one also matches", () => {
    // "green onions" contains both "green onions" (scallion) and "onions"
    // (yellow-onion); longest-alias-first must win or every allium collapses
    // into yellow-onion.
    expect(findSprite("green onions")).toBe("scallion");
    expect(findSprite("garlic powder")).toBe("garlic-powder");
    expect(findSprite("3 cloves garlic, minced")).toBe("garlic");
  });

  it("still resolves the shorter alias on its own", () => {
    expect(findSprite("1 large onion, diced")).toBe("yellow-onion");
  });

  it("returns null for an unknown ingredient", () => {
    expect(findSprite("wd-40")).toBeNull();
  });

  it("matches by substring even inside a word (known quirk)", () => {
    // normalize() does not split words, and matching is `includes(alias)`,
    // so "unicorn" hits the "corn" alias. Pinned so a future fix to
    // word-boundary matching shows up as a deliberate test change.
    expect(findSprite("unicorn tears")).toBe("corn");
  });

  it("returns null for empty and punctuation-only input", () => {
    expect(findSprite("")).toBeNull();
    expect(findSprite("(),.")).toBeNull();
  });
});

describe("spriteUrl / spriteAisle", () => {
  it("returns the manifest blob URL for a known slug", () => {
    const entry = (
      manifest.sprites as Array<{ slug: string; url?: string }>
    ).find((e) => e.slug === "olive-oil");
    expect(entry?.url).toBeTruthy();
    expect(spriteUrl("olive-oil")).toBe(entry!.url);
  });

  it("returns null for an unknown slug", () => {
    expect(spriteUrl("not-a-real-slug")).toBeNull();
    expect(spriteAisle("not-a-real-slug")).toBeNull();
  });

  it("returns null aisle for a null slug", () => {
    expect(spriteAisle(null)).toBeNull();
  });
});

describe("aisleForName", () => {
  it("maps a produce ingredient through the sprite to its aisle", () => {
    expect(aisleForName("3 cloves garlic")).toBe("produce");
  });

  it("maps pantry staples to their aisles", () => {
    expect(aisleForName("kosher salt")).toBe("spices");
    expect(aisleForName("extra virgin olive oil")).toBe("oils-vinegars");
  });

  it("returns null when no sprite matches", () => {
    expect(aisleForName("wd-40")).toBeNull();
  });
});

describe("allSlugs", () => {
  it("mirrors the committed manifest exactly", () => {
    const expected = (manifest.sprites as Array<{ slug: string }>).map(
      (e) => e.slug
    );
    expect(allSlugs()).toEqual(expected);
    expect(expected.length).toBeGreaterThan(0);
    expect(new Set(expected).size).toBe(expected.length);
  });
});
