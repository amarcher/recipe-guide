import { z } from "zod";

export const MealSlotType = z.enum(["BREAKFAST", "LUNCH", "DINNER", "SNACK"]);
export type MealSlotType = z.infer<typeof MealSlotType>;

export const Eater = z.enum(["ADULTS", "KIDS"]);
export type Eater = z.infer<typeof Eater>;

export const KidFitTag = z.enum(["RELIABLE", "STRETCH", "NEW"]);
export type KidFitTag = z.infer<typeof KidFitTag>;

export const SlotMode = z.enum(["PLAN", "REPEAT", "LEFTOVERS", "EAT_OUT"]);
export type SlotMode = z.infer<typeof SlotMode>;

export const DayOfWeek = z.enum(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
export type DayOfWeek = z.infer<typeof DayOfWeek>;

const PantryEntry = z.object({
  display: z.string(),
  slug: z.string().optional(),
  mustUse: z.boolean().optional(),
});

const KidListEntry = z.object({
  display: z.string(),
  slug: z.string().optional(),
});

export const PlanIntake = z.object({
  weekOf: z.string().describe("ISO date for the Monday of the target week"),
  slots: z.array(
    z.object({
      day: DayOfWeek.optional(),
      slot: MealSlotType,
      eaters: z.array(Eater).min(1),
      mode: SlotMode.default("PLAN"),
      count: z.number().default(1),
    })
  ),
  mood: z.object({
    useUp: z.number().describe("0-1"),
    explore: z.number().describe("0-1"),
    survival: z.number().describe("0-1"),
  }),
  pantry: z.array(PantryEntry).default([]),
  aspirations: z.object({
    adults: z.array(z.string()).default([]),
    kids: z.array(z.string()).default([]),
  }),
  constraints: z.object({
    weeknightMaxCookMinutes: z.number().optional(),
    weekendMaxCookMinutes: z.number().optional(),
    avoid: z.array(z.string()).default([]),
    equipmentOut: z.array(z.string()).default([]),
  }),
  kidRules: z.object({
    reliableHits: z.array(KidListEntry).default([]),
    hardNos: z.array(KidListEntry).default([]),
  }),
  notes: z.string().optional(),
});
export type PlanIntake = z.infer<typeof PlanIntake>;

export const MenuSkeleton = z.object({
  heroIngredients: z
    .array(
      z.object({
        slug: z.string().optional(),
        label: z.string(),
        appearsIn: z.array(z.string()).describe("slot-type references like DINNERx2 or LUNCHx1"),
        reason: z.string(),
      })
    )
    .describe("3-10 entries"),
  themes: z.array(z.string()).describe("1-3 organizing principles"),
  constraintsAcknowledged: z.array(z.string()),
  rationale: z.string(),
});
export type MenuSkeleton = z.infer<typeof MenuSkeleton>;

// Slimmed shape for LLM structured output — Anthropic has a schema-complexity
// budget and the full CookCard tree blows it. We generate a minimum viable
// draft and fill in the rest of the CookCard fields at insert time.
const IngredientDraft = z.object({
  quantity: z.string().optional(),
  unit: z.string().optional(),
  item: z.string(),
});

const StepDraft = z.object({
  headline: z.string().describe("3-5 words, chapter-title style"),
  action: z.string().describe("one or two tight sentences, under 30 words"),
  icon: z.enum([
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
  ]),
  ingredients: z.array(IngredientDraft),
  duration: z.string().optional(),
});

export const CookCardDraft = z.object({
  title: z.string(),
  total_time: z.string().optional(),
  steps: z.array(StepDraft).describe("3-7 steps"),
});
export type CookCardDraft = z.infer<typeof CookCardDraft>;

export const Candidate = z.object({
  title: z.string().describe("2-6 words"),
  summary: z.string().describe("one sentence, what it actually is"),
  rationale: z.string().describe("1-2 sentences grounded in skeleton/intake"),
  heroIngredientSlugs: z.array(z.string()).default([]),
  approxCookMinutes: z.number(),
  kidFitTag: KidFitTag,
  composedCardDraft: CookCardDraft,
});
export type Candidate = z.infer<typeof Candidate>;

export const CandidatesForSlot = z.object({
  candidates: z.array(Candidate).describe("3-5 candidates"),
});
export type CandidatesForSlot = z.infer<typeof CandidatesForSlot>;
