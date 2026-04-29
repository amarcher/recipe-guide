import { describe, it, expect } from "vitest";
import {
  AMAZON_FRESH_DEEPLINK_ITEM_CAP,
  DEFAULT_GROCERY_VENDOR,
  GROCERY_VENDORS,
  GROCERY_VENDOR_IDS,
  clipboardList,
  composeQuery,
  getVendor,
  type ExportItem,
} from "./grocery-vendors";

const SAMPLE: ExportItem[] = [
  { display: "olive oil", slug: "olive-oil", quantity: "1 bottle" },
  { display: "kosher salt", slug: "kosher-salt", quantity: "1 box" },
  { display: "lemons", slug: "lemons", quantity: "3" },
  { display: "garlic", slug: "garlic", quantity: "1 head" },
  { display: "parsley", slug: "parsley", quantity: "1 bunch" },
  { display: "chicken thighs", slug: "chicken-thighs", quantity: "2 lbs" },
  { display: "flaky salt", slug: null, quantity: null },
];

describe("grocery-vendors / module shape", () => {
  it("exposes the three known adapters keyed by id", () => {
    expect(GROCERY_VENDOR_IDS.sort()).toEqual(
      ["amazonFresh", "instacart", "walmart"].sort(),
    );
    for (const id of GROCERY_VENDOR_IDS) {
      expect(GROCERY_VENDORS[id].id).toBe(id);
      expect(typeof GROCERY_VENDORS[id].deeplink).toBe("function");
    }
  });

  it("defaults to AmazonFresh per the 2026-04-28 decision", () => {
    expect(DEFAULT_GROCERY_VENDOR).toBe("amazonFresh");
  });

  it("getVendor returns null for unknown ids", () => {
    expect(getVendor("amazonFresh")?.id).toBe("amazonFresh");
    expect(getVendor("nope")).toBeNull();
  });
});

describe("composeQuery", () => {
  it("returns empty string for an empty cart", () => {
    expect(composeQuery([])).toEqual({ query: "", usedCount: 0 });
  });

  it("caps the query at AMAZON_FRESH_DEEPLINK_ITEM_CAP items by default", () => {
    const result = composeQuery(SAMPLE);
    expect(result.usedCount).toBe(AMAZON_FRESH_DEEPLINK_ITEM_CAP);
    // Quantity hints are not included in the search query — Amazon ignores
    // them and they pollute relevance ranking.
    expect(result.query).toBe("olive oil kosher salt lemons garlic parsley");
  });

  it("respects an explicit itemCap override", () => {
    const result = composeQuery(SAMPLE, { itemCap: 2 });
    expect(result.usedCount).toBe(2);
    expect(result.query).toBe("olive oil kosher salt");
  });

  it("falls back to slug when display is empty", () => {
    const items: ExportItem[] = [
      { display: "", slug: "rosemary" },
      { display: "thyme" },
    ];
    expect(composeQuery(items, { itemCap: 5 }).query).toBe("rosemary thyme");
  });

  it("skips items with neither display nor slug", () => {
    const items: ExportItem[] = [
      { display: "", slug: null },
      { display: "lemon" },
    ];
    expect(composeQuery(items, { itemCap: 5 }).query).toBe("lemon");
  });

  it("stops adding items once the encoded query exceeds maxLen", () => {
    const long = "x".repeat(40);
    const items: ExportItem[] = Array.from({ length: 10 }, (_, i) => ({
      display: `${long}${i}`,
    }));
    const result = composeQuery(items, { itemCap: 99, maxLen: 80 });
    // Should fit fewer than the requested 99 due to the maxLen guard.
    expect(result.usedCount).toBeLessThan(99);
    expect(encodeURIComponent(result.query).length).toBeLessThanOrEqual(80);
  });
});

describe("clipboardList", () => {
  it("lists every item on its own line, prefixed by quantity when present", () => {
    const out = clipboardList(SAMPLE);
    const lines = out.split("\n");
    expect(lines.length).toBe(SAMPLE.length);
    expect(lines[0]).toBe("1 bottle olive oil");
    expect(lines[5]).toBe("2 lbs chicken thighs");
    // Slug-less, quantity-less item still renders by display.
    expect(lines[6]).toBe("flaky salt");
  });

  it("omits items with no usable name", () => {
    const out = clipboardList([
      { display: "" },
      { display: "lemon" },
      { display: "  " },
    ]);
    expect(out).toBe("lemon");
  });
});

describe("amazonFresh adapter", () => {
  const amazon = GROCERY_VENDORS.amazonFresh;

  it("returns a Fresh storefront landing for an empty cart", () => {
    const url = amazon.deeplink([]);
    expect(url).toMatch(/^https:\/\/www\.amazon\.com\//);
  });

  it("targets the AmazonFresh storefront via i=amazonfresh", () => {
    const url = amazon.deeplink(SAMPLE);
    expect(url).toContain("amazon.com/s?k=");
    expect(url).toContain("&i=amazonfresh");
  });

  it("URL-encodes the query so spaces become %20-equivalent", () => {
    const url = amazon.deeplink([{ display: "extra virgin olive oil" }]);
    // encodeURIComponent uses %20 for spaces (vs application/x-www-form-urlencoded +).
    expect(url).toContain("k=extra%20virgin%20olive%20oil");
  });

  it("never produces a URL above the safe length even on a huge cart", () => {
    const items: ExportItem[] = Array.from({ length: 200 }, (_, i) => ({
      display: `ingredient-${i}`,
    }));
    const url = amazon.deeplink(items);
    expect(url.length).toBeLessThan(2048);
  });
});

describe("instacart adapter (stub)", () => {
  it("falls back to a public store landing on empty cart", () => {
    expect(GROCERY_VENDORS.instacart.deeplink([])).toMatch(
      /^https:\/\/www\.instacart\.com\//,
    );
  });

  it("composes a search URL when items are present", () => {
    const url = GROCERY_VENDORS.instacart.deeplink([{ display: "butter" }]);
    expect(url).toContain("instacart.com/store/s?k=butter");
  });
});

describe("walmart adapter (stub)", () => {
  it("falls back to a grocery landing on empty cart", () => {
    expect(GROCERY_VENDORS.walmart.deeplink([])).toContain("walmart.com/");
  });

  it("composes a search URL when items are present", () => {
    const url = GROCERY_VENDORS.walmart.deeplink([{ display: "milk" }]);
    expect(url).toContain("walmart.com/search?q=milk");
  });
});
