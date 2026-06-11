import { describe, it, expect } from "vitest";
import { applyCanonicalFallback } from "./card-fallback";
import type { CookCard } from "@/app/types";

const DISH = "https://blob.vercel-storage.com/dishes/abc.jpg";

function card(overrides: Partial<CookCard> = {}): CookCard {
  return {
    title: "Sunday short ribs",
    source_url: "https://example.com/short-ribs",
    servings: "4",
    total_time: "3 hr",
    active_time: "40 min",
    equipment: ["dutch oven"],
    pantry_ingredients: [],
    steps: [
      {
        number: 1,
        headline: "Sear the ribs",
        action: "Brown on all sides.",
        icon: "flame",
        ingredients: [
          { quantity: "3", unit: "lb", item: "short ribs", prep: null, note: null },
        ],
        equipment: ["dutch oven"],
        temperature: null,
        duration: "10 min",
        doneness_cue: "deep brown crust",
      },
    ],
    ...overrides,
  };
}

describe("applyCanonicalFallback", () => {
  it("fills a field the frozen snapshot predates (key absent)", () => {
    const snapshot = card(); // no generated_dish_image_url key at all
    const canonical = card({ generated_dish_image_url: DISH, tagline: "Falling-apart tender." });
    const out = applyCanonicalFallback(snapshot, canonical);
    expect(out.generated_dish_image_url).toBe(DISH);
    expect(out.tagline).toBe("Falling-apart tender.");
  });

  it("fills explicit null and blank-string values (pivot expand writes null)", () => {
    const snapshot = card({ tagline: null, generated_dish_image_url: "  " });
    const canonical = card({ tagline: "Falling-apart tender.", generated_dish_image_url: DISH });
    const out = applyCanonicalFallback(snapshot, canonical);
    expect(out.tagline).toBe("Falling-apart tender.");
    expect(out.generated_dish_image_url).toBe(DISH);
  });

  it("never clobbers an enrichment value the snapshot already has", () => {
    const snapshot = card({
      tagline: "My version, fixed.",
      generated_dish_image_url: "https://blob.vercel-storage.com/dishes/mine.jpg",
    });
    const canonical = card({ tagline: "Original.", generated_dish_image_url: DISH });
    const out = applyCanonicalFallback(snapshot, canonical);
    expect(out.tagline).toBe("My version, fixed.");
    expect(out.generated_dish_image_url).toBe(
      "https://blob.vercel-storage.com/dishes/mine.jpg"
    );
  });

  it("never resurrects snapshot-owned structure the user changed or cleared", () => {
    const snapshot = card({
      title: "Renamed by me",
      servings: null,
      equipment: [],
      steps: [],
    });
    const canonical = card({ generated_dish_image_url: DISH });
    const out = applyCanonicalFallback(snapshot, canonical);
    expect(out.title).toBe("Renamed by me");
    expect(out.servings).toBeNull();
    expect(out.equipment).toEqual([]);
    expect(out.steps).toEqual([]);
    expect(out.generated_dish_image_url).toBe(DISH);
  });

  it("falls through for future canonical fields without code changes", () => {
    const snapshot = card();
    const canonical = {
      ...card(),
      spice_level: "medium",
    } as CookCard & { spice_level: string };
    const out = applyCanonicalFallback(snapshot, canonical) as CookCard & {
      spice_level?: string;
    };
    expect(out.spice_level).toBe("medium");
  });

  it("fills provenance from canonical when the snapshot lacks it", () => {
    const snapshot = card();
    const canonical = card({ provenance: "instagram-reconstructed" });
    expect(applyCanonicalFallback(snapshot, canonical).provenance).toBe(
      "instagram-reconstructed"
    );
  });

  it("returns the same reference when nothing falls through", () => {
    const snapshot = card({ tagline: "Set.", generated_dish_image_url: DISH });
    const canonical = card({ tagline: "Other.", generated_dish_image_url: "x" });
    expect(applyCanonicalFallback(snapshot, canonical)).toBe(snapshot);
  });

  it("ignores canonical fields that are themselves missing", () => {
    const snapshot = card({ tagline: null });
    const canonical = card({ tagline: "" });
    expect(applyCanonicalFallback(snapshot, canonical).tagline).toBeNull();
  });

  it("no-ops on a null canonical", () => {
    const snapshot = card();
    expect(applyCanonicalFallback(snapshot, null)).toBe(snapshot);
    expect(applyCanonicalFallback(snapshot, undefined)).toBe(snapshot);
  });
});
