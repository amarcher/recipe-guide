import type { CookCard } from "@/app/types";
import type { CookCardDraft } from "./schemas";

export function expandDraft(draft: CookCardDraft, sourceUrl: string): CookCard {
  return {
    title: draft.title,
    source_url: sourceUrl,
    tagline: draft.tagline ?? null,
    servings: null,
    total_time: draft.total_time ?? null,
    active_time: null,
    equipment: [],
    pantry_ingredients: [],
    steps: draft.steps.map((s, i) => ({
      number: i + 1,
      headline: s.headline,
      action: s.action,
      icon: s.icon,
      ingredients: s.ingredients.map((ing) => ({
        quantity: ing.quantity ?? null,
        unit: ing.unit ?? null,
        item: ing.item,
        prep: null,
        note: null,
      })),
      equipment: [],
      temperature: null,
      duration: s.duration ?? null,
      doneness_cue: null,
    })),
  };
}
