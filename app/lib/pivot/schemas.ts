import { z } from "zod";

// Slimmed shape for the Pass 1 (Revise) LLM output. Same complexity-budget
// trade-off as planner/schemas.ts CookCardDraft: Anthropic's structured
// output rejects deeply-nested optional-heavy schemas, so we generate a
// lean draft and expand to the full CookCard server-side.
//
// Compared to CookCardDraft we keep extra fields (temperature, doneness_cue,
// pantry_ingredients, equipment) because pivots want fidelity — the cook is
// continuing execution, not picking from a menu — and we have headroom
// since this is one card per call, not 3-5.
const PivotIngredient = z.object({
  quantity: z.string().nullable().optional(),
  unit: z.string().nullable().optional(),
  item: z.string(),
  prep: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});

const StepIcon = z.enum([
  "flame",
  "soup",
  "boil",
  "oven",
  "knife",
  "wine",
  "leaf",
  "mix",
  "salt",
  "rest",
  "serve",
  "blend",
]);

const PivotStep = z.object({
  headline: z.string().describe("3-7 words, chapter-title style"),
  action: z.string().describe("one or two tight sentences"),
  icon: StepIcon,
  ingredients: z.array(PivotIngredient),
  duration: z.string().nullable().optional(),
  temperature: z.string().nullable().optional(),
  doneness_cue: z.string().nullable().optional(),
});

export const PivotedCard = z.object({
  title: z.string(),
  total_time: z.string().nullable().optional(),
  active_time: z.string().nullable().optional(),
  servings: z.string().nullable().optional(),
  equipment: z.array(z.string()),
  pantry_ingredients: z.array(PivotIngredient),
  steps: z.array(PivotStep).describe("preserve original step count when possible; insert/remove only when the misstep demands it"),
});
export type PivotedCard = z.infer<typeof PivotedCard>;

// Pass 2 (Re-state) — given the original card, the revised card, and the
// cook's progress markers from the original, infer which steps in the
// revised recipe are already complete and which mise items are already
// gathered. Also produces the narrative the user reads in the sheet.
export const PivotProgressMapping = z.object({
  newDoneSteps: z
    .array(z.number())
    .describe("step numbers (1-indexed) in the revised recipe the cook has already completed"),
  newCheckedEntryKeys: z
    .array(z.string())
    .describe("entryKey values (slug-or-lowercased-item|lowercased-unit) from the revised recipe's mise that the cook already has gathered"),
  aiNotes: z
    .string()
    .describe("2-3 sentences in an executive-chef voice: what changed and why, addressed to the cook"),
  changes: z
    .array(z.string())
    .describe("short bullet phrases (≤8 words each) listing concrete deltas — added/removed ingredients, modified durations, etc."),
});
export type PivotProgressMapping = z.infer<typeof PivotProgressMapping>;
