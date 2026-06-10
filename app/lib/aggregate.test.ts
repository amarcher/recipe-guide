import { describe, it, expect } from "vitest";
import { buildMise, formatMiseQuantity, type MiseEntry } from "./aggregate";
import type { CookCard, Ingredient, Step } from "@/app/types";

// ─── Fixtures ────────────────────────────────────────────────────────────────
// These tests exercise the REAL implementation, including its real dependency
// graph: findSprite/spriteAisle (sprites-core → sprites/manifest.json),
// parseQty/scaleQty/formatQty (scale.ts), and derivePrepKind (taxonomy.ts).
// Assertions are pinned to OBSERVED current behavior. Where a behavior is a
// genuine quirk (e.g. ranges are not range-summed in numericTotal), it's
// called out in a comment so a future reader doesn't mistake it for intent.

function ing(p: Partial<Ingredient>): Ingredient {
  return { quantity: null, unit: null, item: "x", prep: null, note: null, ...p };
}

function step(ingredients: Ingredient[], p: Partial<Step> = {}): Step {
  return {
    number: 1,
    headline: "",
    action: "",
    icon: "mix",
    ingredients,
    equipment: [],
    temperature: null,
    duration: null,
    doneness_cue: null,
    ...p,
  };
}

function card(p: Partial<CookCard>): CookCard {
  return {
    title: "t",
    source_url: "https://example.com/r",
    servings: null,
    total_time: null,
    active_time: null,
    equipment: [],
    pantry_ingredients: [],
    steps: [],
    ...p,
  };
}

function find(entries: MiseEntry[], keyPrefix: string): MiseEntry {
  const e = entries.find((x) => x.key.startsWith(keyPrefix));
  if (!e) throw new Error(`no entry with key prefix "${keyPrefix}" in [${entries.map((x) => x.key).join(", ")}]`);
  return e;
}

// ─── Sprite-resolution sanity ────────────────────────────────────────────────
// The keying behavior below depends on findSprite mapping certain item names to
// known slugs. These probes pin the manifest-derived assumptions the rest of
// the suite leans on, so a manifest change that breaks them fails loudly here
// rather than as a confusing dedupe assertion failure elsewhere.
describe("manifest assumptions the suite relies on", () => {
  it("known items resolve to the slugs these tests assume", () => {
    const c = card({
      steps: [
        step([
          ing({ item: "garlic" }),
          ing({ item: "olive oil" }),
          ing({ item: "salt" }),
          ing({ item: "onion" }),
        ]),
      ],
    });
    const m = buildMise(c, 1);
    expect(find(m, "garlic|").slug).toBe("garlic");
    expect(find(m, "olive-oil|").slug).toBe("olive-oil");
    // "salt" aliases to the kosher-salt sprite.
    expect(find(m, "kosher-salt|").slug).toBe("kosher-salt");
    // "onion" aliases to the yellow-onion sprite.
    expect(find(m, "yellow-onion|").slug).toBe("yellow-onion");
  });
});

// ─── Keying / dedupe ─────────────────────────────────────────────────────────
describe("entryKey dedupe by (slug || normalized item, unit)", () => {
  it("merges two ingredients that resolve to the same sprite slug + unit", () => {
    const c = card({
      steps: [
        step([ing({ item: "garlic", quantity: "2", unit: "cloves" })]),
        // Different surface text, same sprite slug + unit → one entry.
        step([ing({ item: "minced garlic", quantity: "3", unit: "cloves" })]),
      ],
    });
    const m = buildMise(c, 1);
    const garlic = m.filter((e) => e.slug === "garlic");
    expect(garlic).toHaveLength(1);
    expect(garlic[0].key).toBe("garlic|cloves");
    expect(garlic[0].numericTotal).toBe(5);
  });

  it("does NOT merge the same item across different units (unit is part of the key)", () => {
    const c = card({
      steps: [
        step([ing({ item: "garlic", quantity: "2", unit: "cloves" })]),
        step([ing({ item: "garlic", quantity: "1", unit: "tbsp" })]),
      ],
    });
    const m = buildMise(c, 1);
    expect(m.filter((e) => e.slug === "garlic")).toHaveLength(2);
    expect(find(m, "garlic|cloves").numericTotal).toBe(2);
    expect(find(m, "garlic|tbsp").numericTotal).toBe(1);
  });

  it("falls back to the normalized (lowercased, trimmed) item name when no sprite matches", () => {
    const c = card({
      steps: [
        step([
          ing({ item: "  Dragonfruit  ", quantity: "1", unit: "cup" }),
          ing({ item: "dragonfruit", quantity: "2", unit: "cup" }),
        ]),
      ],
    });
    const m = buildMise(c, 1);
    const df = m.filter((e) => e.slug === null);
    expect(df).toHaveLength(1);
    // base = item.trim().toLowerCase(); unit = lowercased.
    expect(df[0].key).toBe("dragonfruit|cup");
    expect(df[0].numericTotal).toBe(3);
  });

  it("normalizes the unit case when keying", () => {
    const c = card({
      steps: [
        step([ing({ item: "flour", quantity: "1", unit: "Cup" })]),
        step([ing({ item: "flour", quantity: "1", unit: "cup" })]),
      ],
    });
    const m = buildMise(c, 1);
    expect(m).toHaveLength(1);
    expect(m[0].key.endsWith("|cup")).toBe(true);
    expect(m[0].numericTotal).toBe(2);
  });

  it("treats a null unit as an empty unit segment in the key", () => {
    const c = card({
      steps: [step([ing({ item: "kale", quantity: "1", unit: null })])],
    });
    const m = buildMise(c, 1);
    expect(m[0].key.endsWith("|")).toBe(true);
    expect(m[0].unit).toBeNull();
  });
});

// ─── Quantity summation across steps + pantry ────────────────────────────────
describe("quantity summation across steps and pantry", () => {
  it("sums parseable numeric quantities across multiple steps", () => {
    const c = card({
      steps: [
        step([ing({ item: "carrot", quantity: "2", unit: "ea" })]),
        step([ing({ item: "carrot", quantity: "3", unit: "ea" })]),
        step([ing({ item: "carrot", quantity: "1", unit: "ea" })]),
      ],
    });
    expect(find(buildMise(c, 1), "carrot|ea").numericTotal).toBe(6);
  });

  it("merges a pantry ingredient into the same entry as a step ingredient", () => {
    const c = card({
      pantry_ingredients: [ing({ item: "olive oil", quantity: "2", unit: "tbsp" })],
      steps: [step([ing({ item: "olive oil", quantity: "1", unit: "tbsp" })])],
    });
    const m = buildMise(c, 1);
    const oil = m.filter((e) => e.slug === "olive-oil");
    expect(oil).toHaveLength(1);
    expect(oil[0].numericTotal).toBe(3);
  });

  it("parses fractional and mixed-number quantities before summing", () => {
    const c = card({
      steps: [
        step([ing({ item: "flour", quantity: "1 1/2", unit: "cup" })]),
        step([ing({ item: "flour", quantity: "1/2", unit: "cup" })]),
      ],
    });
    expect(find(buildMise(c, 1), "all-purpose-flour|cup").numericTotal).toBeCloseTo(2, 10);
  });

  it("parses vulgar-fraction quantities", () => {
    const c = card({ steps: [step([ing({ item: "sugar", quantity: "¾", unit: "cup" })])] });
    expect(find(buildMise(c, 1), "granulated-sugar|cup").numericTotal).toBeCloseTo(0.75, 10);
  });
});

// ─── Scaling by factor ───────────────────────────────────────────────────────
describe("scaling by factor", () => {
  it("scales the summed numericTotal once at the end (sum raw, then multiply)", () => {
    const c = card({
      steps: [
        step([ing({ item: "carrot", quantity: "2", unit: "ea" })]),
        step([ing({ item: "carrot", quantity: "2", unit: "ea" })]),
      ],
    });
    // (2 + 2) * 2 == 8
    expect(find(buildMise(c, 2), "carrot|ea").numericTotal).toBe(8);
  });

  it("supports fractional scale factors", () => {
    const c = card({ steps: [step([ing({ item: "carrot", quantity: "4", unit: "ea" })])] });
    expect(find(buildMise(c, 0.5), "carrot|ea").numericTotal).toBe(2);
  });

  it("leaves numericTotal null (not 0) when nothing parsed, regardless of factor", () => {
    const c = card({ steps: [step([ing({ item: "thyme", quantity: "to taste", unit: null })])] });
    expect(find(buildMise(c, 3), "thyme|").numericTotal).toBeNull();
  });

  it("routes non-numeric quantities into rawParts unchanged (scaleQty is a no-op on them)", () => {
    const c = card({
      // No leading number → parseQty returns null → lands in rawParts. scaleQty
      // can only scale a parseable leading number, so an unparseable string
      // passes through untouched even at a non-1 factor.
      steps: [step([ing({ item: "thyme", quantity: "a handful", unit: null })])],
    });
    const e = find(buildMise(c, 3), "thyme|");
    expect(e.numericTotal).toBeNull();
    expect(e.rawParts).toEqual(["a handful"]);
  });

  it("scales a numeric-with-tail quantity ONLY when it stays in rawParts (it does not — leading number parses)", () => {
    // "1 sprig" has a leading number, so parseQty reads 1 and it is summed
    // numerically; it never reaches the rawParts/scaleQty branch.
    const c = card({ steps: [step([ing({ item: "thyme", quantity: "1 sprig", unit: null })])] });
    const e = find(buildMise(c, 3), "thyme|");
    expect(e.numericTotal).toBe(3);
    expect(e.rawParts).toEqual([]);
  });

  it("dedupes identical raw parts", () => {
    const c = card({
      steps: [
        step([ing({ item: "thyme", quantity: "a handful", unit: null })]),
        step([ing({ item: "thyme", quantity: "a handful", unit: null })]),
      ],
    });
    expect(find(buildMise(c, 2), "thyme|").rawParts).toEqual(["a handful"]);
  });
});

// ─── Range quirk (documented, not a correctness assertion of intent) ─────────
describe("range quantities", () => {
  // parseQty only reads the LEADING number, so a "8-10" range is summed/scaled
  // as 8, NOT as a range. scaleQty's range-awareness is bypassed because the
  // numericTotal branch wins as soon as parseQty returns non-null. This is the
  // current behavior; the test pins it so a future range-aware change is a
  // deliberate, visible diff rather than a silent regression.
  it("collapses a numeric range to its low end in numericTotal (current behavior)", () => {
    const c = card({ steps: [step([ing({ item: "garlic", quantity: "8-10", unit: "cloves" })])] });
    expect(find(buildMise(c, 1), "garlic|cloves").numericTotal).toBe(8);
  });

  it("scales the collapsed low end by the factor", () => {
    const c = card({ steps: [step([ing({ item: "garlic", quantity: "8-10", unit: "cloves" })])] });
    expect(find(buildMise(c, 2), "garlic|cloves").numericTotal).toBe(16);
  });

  // Forward-looking tripwire: when range-summing is fixed (carry the high end,
  // or at least stop silently under-counting), this flips green. Pairs with the
  // current-behavior tests above so the fix is a deliberate, visible diff.
  it.skip("WANT: a range quantity preserves its high end so the mise does not under-count", () => {
    const c = card({ steps: [step([ing({ item: "garlic", quantity: "8-10", unit: "cloves" })])] });
    expect(formatMiseQuantity(find(buildMise(c, 1), "garlic|cloves"))).toContain("10");
  });
});

// ─── Singular/plural unit desync (documented bug, not blessed as intent) ──────
describe("singular vs plural unit text", () => {
  // The dedupe key includes the raw unit text (lowercased), so "clove" and
  // "cloves" hash to different keys and produce TWO mise entries for what is one
  // physical ingredient. On the shared grocery list this double-counts / desyncs
  // quantities. Pinned as current behavior; the WANT below is the intended fix.
  it("does NOT merge clove vs cloves into one entry (current behavior)", () => {
    const c = card({
      steps: [
        step([ing({ item: "garlic", quantity: "1", unit: "clove" })]),
        step([ing({ item: "garlic", quantity: "2", unit: "cloves" })]),
      ],
    });
    const m = buildMise(c, 1);
    const garlic = m.filter((e) => e.slug === "garlic");
    expect(garlic).toHaveLength(2);
    expect(garlic.map((e) => e.key).sort()).toEqual(["garlic|clove", "garlic|cloves"]);
  });

  it.skip("WANT: trivially-pluralized units merge into one entry (clove ≈ cloves)", () => {
    const c = card({
      steps: [
        step([ing({ item: "garlic", quantity: "1", unit: "clove" })]),
        step([ing({ item: "garlic", quantity: "2", unit: "cloves" })]),
      ],
    });
    const m = buildMise(c, 1);
    const garlic = m.filter((e) => e.slug === "garlic");
    expect(garlic).toHaveLength(1);
    expect(garlic[0].numericTotal).toBe(3);
  });
});

// ─── Prep-kind aggregation / promotion ───────────────────────────────────────
describe("prepKind promotion across usages", () => {
  it("promotes to the more-involved prep when the same entry is used multiple ways", () => {
    const c = card({
      steps: [
        // First usage is plain "to taste" → measure.
        step([ing({ item: "garlic", quantity: "1", unit: "clove", prep: "to taste" })]),
        // Later usage is "minced" → knife, which outranks measure and wins.
        step([ing({ item: "garlic", quantity: "1", unit: "clove", prep: "minced" })]),
      ],
    });
    const e = find(buildMise(c, 1), "garlic|clove");
    expect(e.prepKind).toBe("knife");
    expect(e.prepHints).toContain("minced");
    expect(e.prepHints).toContain("to taste");
  });

  it("does NOT demote to a lighter prep once a heavier one is set", () => {
    const c = card({
      steps: [
        step([ing({ item: "garlic", quantity: "1", unit: "clove", prep: "minced" })]),
        step([ing({ item: "garlic", quantity: "1", unit: "clove", prep: "to taste" })]),
      ],
    });
    expect(find(buildMise(c, 1), "garlic|clove").prepKind).toBe("knife");
  });

  it("collects distinct prep hints and does not duplicate", () => {
    const c = card({
      steps: [
        step([ing({ item: "garlic", quantity: "1", unit: "clove", prep: "minced" })]),
        step([ing({ item: "garlic", quantity: "1", unit: "clove", prep: "minced" })]),
      ],
    });
    expect(find(buildMise(c, 1), "garlic|clove").prepHints).toEqual(["minced"]);
  });

  it("defaults to measure prep when no prep text is present", () => {
    const c = card({ steps: [step([ing({ item: "garlic", quantity: "1", unit: "clove" })])] });
    const e = find(buildMise(c, 1), "garlic|clove");
    expect(e.prepKind).toBe("measure");
    expect(e.prepHints).toEqual([]);
  });
});

// ─── Aisle + first-seen item label ───────────────────────────────────────────
describe("entry metadata", () => {
  it("attaches the sprite aisle when the slug is known", () => {
    const c = card({ steps: [step([ing({ item: "garlic", quantity: "1", unit: "clove" })])] });
    expect(find(buildMise(c, 1), "garlic|clove").aisle).toBe("produce");
  });

  it("leaves aisle null when no sprite matches", () => {
    const c = card({ steps: [step([ing({ item: "dragonfruit", quantity: "1", unit: "ea" })])] });
    expect(find(buildMise(c, 1), "dragonfruit|ea").aisle).toBeNull();
  });

  it("keeps the FIRST-seen item label and unit on the merged entry", () => {
    const c = card({
      steps: [
        step([ing({ item: "Garlic Cloves", quantity: "1", unit: "clove" })]),
        step([ing({ item: "minced garlic", quantity: "1", unit: "clove" })]),
      ],
    });
    const e = find(buildMise(c, 1), "garlic|clove");
    expect(e.item).toBe("Garlic Cloves");
    expect(e.unit).toBe("clove");
  });
});

// ─── Output ordering ─────────────────────────────────────────────────────────
describe("output ordering", () => {
  it("sorts entries by item label (localeCompare)", () => {
    const c = card({
      steps: [
        step([
          ing({ item: "zucchini", quantity: "1", unit: "ea" }),
          ing({ item: "apple", quantity: "1", unit: "ea" }),
          ing({ item: "mango", quantity: "1", unit: "ea" }),
        ]),
      ],
    });
    expect(buildMise(c, 1).map((e) => e.item)).toEqual(["apple", "mango", "zucchini"]);
  });

  it("returns an empty list for a card with no ingredients", () => {
    expect(buildMise(card({}), 1)).toEqual([]);
  });
});

// ─── formatMiseQuantity ──────────────────────────────────────────────────────
describe("formatMiseQuantity", () => {
  it("formats numericTotal with its unit", () => {
    const c = card({ steps: [step([ing({ item: "carrot", quantity: "3", unit: "ea" })])] });
    expect(formatMiseQuantity(find(buildMise(c, 1), "carrot|ea"))).toBe("3 ea");
  });

  it("renders just the number when the unit is null", () => {
    const c = card({ steps: [step([ing({ item: "egg", quantity: "2", unit: null })])] });
    const e = find(buildMise(c, 1), "egg|");
    expect(formatMiseQuantity(e)).toBe("2");
  });

  it("appends rawParts in parentheses alongside a numeric main quantity", () => {
    const c = card({
      steps: [
        step([
          ing({ item: "carrot", quantity: "2", unit: "ea" }),
          ing({ item: "carrot", quantity: "a handful", unit: "ea" }),
        ]),
      ],
    });
    // numericTotal = 2, rawParts = ["a handful"] (factor 1 leaves it untouched).
    expect(formatMiseQuantity(find(buildMise(c, 1), "carrot|ea"))).toBe("2 ea (+ a handful)");
  });

  it("shows only rawParts when there is no numeric total", () => {
    const c = card({ steps: [step([ing({ item: "thyme", quantity: "a handful", unit: null })])] });
    expect(formatMiseQuantity(find(buildMise(c, 1), "thyme|"))).toBe("a handful");
  });

  it("falls back to 'to taste' when there is neither a numeric total nor raw parts", () => {
    const c = card({ steps: [step([ing({ item: "thyme", quantity: null, unit: null })])] });
    expect(formatMiseQuantity(find(buildMise(c, 1), "thyme|"))).toBe("to taste");
  });

  it("joins multiple distinct raw parts with ' + '", () => {
    const c = card({
      steps: [
        step([
          ing({ item: "thyme", quantity: "a handful", unit: null }),
          ing({ item: "thyme", quantity: "to taste", unit: null }),
        ]),
      ],
    });
    expect(formatMiseQuantity(find(buildMise(c, 1), "thyme|"))).toBe("a handful + to taste");
  });
});
