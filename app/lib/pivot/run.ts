import { generateObject } from "ai";
import type { CookCard } from "@/app/types";
import { plannerModel } from "@/app/lib/planner/model";
import {
  PivotedCard,
  PivotProgressMapping,
  type PivotProgressMapping as PivotProgressMappingType,
} from "./schemas";
import { REVISE_SYSTEM_PROMPT, RESTATE_SYSTEM_PROMPT } from "./prompts";
import { expandPivotedCard } from "./expand";

export type PivotInput = {
  originalCard: CookCard;
  doneSteps: number[];
  miseEntryKeys: string[];
  problemText: string;
};

export type PivotOutput = {
  revisedCard: CookCard;
  mapping: PivotProgressMappingType;
};

export async function runPivot(input: PivotInput): Promise<PivotOutput> {
  // Pass 1 — Revise. Output: PivotedCard (slim, LLM-friendly).
  const reviseUser = [
    "ORIGINAL RECIPE",
    JSON.stringify(input.originalCard, null, 2),
    "",
    "PROGRESS SO FAR",
    `done step numbers (1-indexed): ${input.doneSteps.length ? input.doneSteps.join(", ") : "(none)"}`,
    `mise entryKeys gathered: ${input.miseEntryKeys.length ? input.miseEntryKeys.join(", ") : "(none)"}`,
    "",
    "WHAT WENT WRONG (cook's words)",
    input.problemText,
    "",
    "Adapt the recipe to absorb this misstep with minimum deviation. Return a PivotedCard.",
  ].join("\n");

  const reviseResult = await generateObject({
    model: plannerModel,
    schema: PivotedCard,
    system: REVISE_SYSTEM_PROMPT,
    prompt: reviseUser,
  });

  const revisedCard = expandPivotedCard(reviseResult.object, input.originalCard);

  // Pass 2 — Re-state. Output: PivotProgressMapping.
  const restateUser = [
    "ORIGINAL RECIPE",
    JSON.stringify(input.originalCard, null, 2),
    "",
    "REVISED RECIPE",
    JSON.stringify(revisedCard, null, 2),
    "",
    "COOK'S PROBLEM",
    input.problemText,
    "",
    "DONE STEP NUMBERS (in the ORIGINAL, 1-indexed)",
    input.doneSteps.length ? input.doneSteps.join(", ") : "(none)",
    "",
    "MISE ENTRY KEYS GATHERED (from the ORIGINAL)",
    input.miseEntryKeys.length ? input.miseEntryKeys.join(", ") : "(none)",
    "",
    "Map the cook's progress onto the revised recipe and write the chef's note.",
  ].join("\n");

  const restateResult = await generateObject({
    model: plannerModel,
    schema: PivotProgressMapping,
    system: RESTATE_SYSTEM_PROMPT,
    prompt: restateUser,
  });

  return { revisedCard, mapping: restateResult.object };
}
