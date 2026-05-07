import { describe, expect, it } from "vitest";
import type { CookCard } from "@/app/types";
import { expandPivotedCard } from "./expand";
import type { PivotedCard } from "./schemas";

const original: CookCard = {
  title: "Sunday Pomodoro",
  source_url: "https://example.com/pomodoro",
  tagline: "A weeknight tomato sauce that earns its keep.",
  generated_dish_image_url: "https://blob.example/dishes/abc.jpg",
  provenance: "url",
  servings: "4",
  total_time: "45 minutes",
  active_time: "20 minutes",
  equipment: ["heavy saucepan", "wooden spoon"],
  pantry_ingredients: [
    { quantity: "2", unit: "tbsp", item: "olive oil", prep: null, note: null },
  ],
  steps: [
    {
      number: 1,
      headline: "Sweat the aromatics",
      action: "Soften onion + garlic in oil.",
      icon: "flame",
      ingredients: [
        { quantity: "1", unit: null, item: "yellow onion", prep: "diced", note: null },
      ],
      equipment: ["heavy saucepan"],
      temperature: "medium",
      duration: "6-8 minutes",
      doneness_cue: "translucent",
    },
    {
      number: 2,
      headline: "Bloom the paste",
      action: "Caramelize tomato paste against the pan.",
      icon: "soup",
      ingredients: [{ quantity: "2", unit: "tbsp", item: "tomato paste", prep: null, note: null }],
      equipment: ["wooden spoon"],
      temperature: null,
      duration: "2 minutes",
      doneness_cue: "brick red",
    },
  ],
};

const draft: PivotedCard = {
  title: "Sunday Pomodoro",
  total_time: "45 minutes",
  active_time: "20 minutes",
  servings: "4",
  equipment: ["heavy saucepan", "wooden spoon"],
  pantry_ingredients: [
    { quantity: "2", unit: "tbsp", item: "olive oil", prep: null, note: null },
  ],
  steps: [
    {
      headline: "Sweat the aromatics",
      action: "Soften onion + garlic in oil.",
      icon: "flame",
      ingredients: [
        { quantity: "1", unit: null, item: "yellow onion", prep: "diced", note: null },
      ],
      duration: "6-8 minutes",
      temperature: "medium",
      doneness_cue: "translucent",
    },
    {
      headline: "Bloom the paste, then loosen with cream",
      action: "Caramelize the paste, then stir in heavy cream off-heat to soften the acid.",
      icon: "soup",
      ingredients: [
        { quantity: "2", unit: "tbsp", item: "tomato paste", prep: null, note: null },
        { quantity: "1/2", unit: "cup", item: "heavy cream", prep: null, note: "off-heat" },
      ],
      duration: "2 minutes",
      temperature: null,
      doneness_cue: "brick red, then pink-blushed",
    },
  ],
};

describe("expandPivotedCard", () => {
  it("preserves source_url and provenance from the original", () => {
    const expanded = expandPivotedCard(draft, original);
    expect(expanded.source_url).toBe("https://example.com/pomodoro");
    expect(expanded.provenance).toBe("url");
  });

  it("preserves the original tagline and dish image — pivots don't restyle the brand", () => {
    const expanded = expandPivotedCard(draft, original);
    expect(expanded.tagline).toBe(original.tagline);
    expect(expanded.generated_dish_image_url).toBe(original.generated_dish_image_url);
  });

  it("re-numbers steps from the draft array, 1-indexed", () => {
    const expanded = expandPivotedCard(draft, original);
    expect(expanded.steps.map((s) => s.number)).toEqual([1, 2]);
  });

  it("falls back per-step equipment from the original at the same index", () => {
    const expanded = expandPivotedCard(draft, original);
    expect(expanded.steps[0].equipment).toEqual(["heavy saucepan"]);
    expect(expanded.steps[1].equipment).toEqual(["wooden spoon"]);
  });

  it("uses an empty array when the draft has more steps than the original", () => {
    const longerDraft: PivotedCard = {
      ...draft,
      steps: [
        ...draft.steps,
        {
          headline: "Steady the sauce",
          action: "Take the pan off the heat for 30 seconds and stir.",
          icon: "rest",
          ingredients: [],
          duration: "30 sec",
          temperature: null,
          doneness_cue: null,
        },
      ],
    };
    const expanded = expandPivotedCard(longerDraft, original);
    expect(expanded.steps).toHaveLength(3);
    expect(expanded.steps[2].equipment).toEqual([]);
    expect(expanded.steps[2].number).toBe(3);
  });

  it("normalizes nullable ingredient fields to null instead of undefined", () => {
    const expanded = expandPivotedCard(draft, original);
    const cream = expanded.steps[1].ingredients[1];
    expect(cream.item).toBe("heavy cream");
    expect(cream.prep).toBeNull();
    expect(cream.note).toBe("off-heat");
    // Pantry ingredient with explicit null prep
    expect(expanded.pantry_ingredients[0].prep).toBeNull();
  });

  it("falls back to the original's equipment when the draft array is empty", () => {
    const noEquipDraft: PivotedCard = { ...draft, equipment: [] };
    const expanded = expandPivotedCard(noEquipDraft, original);
    expect(expanded.equipment).toEqual(original.equipment);
  });
});
