// ─── Grocery aisles ─────────────────────────────────────────────────────────
// Standard US-supermarket-ish layout. Each manifest sprite entry can be
// labeled with one of these via its `aisle` field. New aisles must be added
// to AISLES (preserves display order in shopping view) and AISLE_LABEL.

export const AISLES = [
  "produce",
  "meat",
  "seafood",
  "dairy",
  "bread-grains",
  "pantry",
  "canned-jarred",
  "spices",
  "oils-vinegars",
  "condiments",
  "baking",
  "nuts-seeds",
  "wine-spirits",
  "other",
] as const;

export type Aisle = (typeof AISLES)[number];

export const AISLE_LABEL: Record<Aisle, string> = {
  produce: "Produce",
  meat: "Meat",
  seafood: "Seafood",
  dairy: "Dairy & eggs",
  "bread-grains": "Bread, pasta & grains",
  pantry: "Pantry",
  "canned-jarred": "Canned & jarred",
  spices: "Spices & dried herbs",
  "oils-vinegars": "Oils & vinegars",
  condiments: "Condiments & sauces",
  baking: "Baking",
  "nuts-seeds": "Nuts & seeds",
  "wine-spirits": "Wine & spirits",
  other: "Other",
};

// ─── Prep kinds ─────────────────────────────────────────────────────────────
// Derived from each ingredient's freeform `prep` text. Used for the "prep"
// grouping mode in the mise so users can batch knife work, etc.

export type PrepKind = "knife" | "grind" | "grate" | "toast" | "measure";

export const PREP_LABEL: Record<PrepKind, string> = {
  knife: "Knife work",
  grate: "Grate / shred",
  grind: "Grind / crush",
  toast: "Toast / bloom",
  measure: "Just measure",
};

export const PREP_ORDER: PrepKind[] = ["knife", "grate", "grind", "toast", "measure"];

const KNIFE_WORDS = [
  "chop",
  "slice",
  "dice",
  "mince",
  "cube",
  "julienne",
  "halve",
  "quarter",
  "trim",
  "cut",
  "shred",
];
const GRATE_WORDS = ["grate", "zest", "shave"];
const GRIND_WORDS = ["grind", "crush", "smash", "pound"];
const TOAST_WORDS = ["toast", "bloom", "char", "blister", "roast"];

export function derivePrepKind(prep: string | null | undefined): PrepKind {
  if (!prep) return "measure";
  const p = prep.toLowerCase();
  if (TOAST_WORDS.some((w) => p.includes(w))) return "toast";
  if (GRIND_WORDS.some((w) => p.includes(w))) return "grind";
  if (GRATE_WORDS.some((w) => p.includes(w))) return "grate";
  if (KNIFE_WORDS.some((w) => p.includes(w))) return "knife";
  return "measure";
}
