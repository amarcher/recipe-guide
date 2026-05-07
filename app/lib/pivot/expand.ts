import type { CookCard, Ingredient, Step, StepIcon } from "@/app/types";
import type { PivotedCard } from "./schemas";

// Lift PivotedCard (Pass 1 LLM output) to a full CookCard. Anything the
// pivot draft schema omits is copied through from the original card —
// the cook is mid-execution, so we want fidelity (provenance,
// source_url, step.equipment) preserved unless the LLM explicitly
// changed it. The LLM owns ingredients, step text, durations, and
// timing; we own structural fields it shouldn't have to think about.
export function expandPivotedCard(
  draft: PivotedCard,
  original: CookCard,
): CookCard {
  return {
    title: draft.title,
    source_url: original.source_url, // never mutate — canonical key into ParsedRecipe
    tagline: original.tagline ?? null,
    generated_dish_image_url: original.generated_dish_image_url ?? null,
    provenance: original.provenance,
    servings: draft.servings ?? original.servings ?? null,
    total_time: draft.total_time ?? original.total_time ?? null,
    active_time: draft.active_time ?? original.active_time ?? null,
    equipment: draft.equipment.length > 0 ? draft.equipment : original.equipment,
    pantry_ingredients: draft.pantry_ingredients.map(toIngredient),
    steps: draft.steps.map((s, i): Step => ({
      number: i + 1,
      headline: s.headline,
      action: s.action,
      icon: s.icon as StepIcon,
      ingredients: s.ingredients.map(toIngredient),
      // Per-step equipment isn't in PivotedCard — pull through from the
      // original step at the same index when it exists. Fine if the LLM
      // shifted steps; equipment is a soft hint anyway.
      equipment: original.steps[i]?.equipment ?? [],
      temperature: s.temperature ?? null,
      duration: s.duration ?? null,
      doneness_cue: s.doneness_cue ?? null,
    })),
  };
}

function toIngredient(ing: {
  quantity?: string | null;
  unit?: string | null;
  item: string;
  prep?: string | null;
  note?: string | null;
}): Ingredient {
  return {
    quantity: ing.quantity ?? null,
    unit: ing.unit ?? null,
    item: ing.item,
    prep: ing.prep ?? null,
    note: ing.note ?? null,
  };
}
