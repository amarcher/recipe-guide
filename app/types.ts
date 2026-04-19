export type Ingredient = {
  quantity: string | null;
  unit: string | null;
  item: string;
  prep: string | null;
  note: string | null;
};

export type StepIcon =
  | "flame"      // sear, brown, sauté, fry
  | "soup"       // simmer, sauce, stew
  | "boil"       // boil, blanch
  | "oven"       // bake, roast, broil
  | "knife"      // chop, slice, dice, prep
  | "wine"       // deglaze, add liquid/wine
  | "leaf"       // herbs, garnish, fresh add
  | "mix"        // combine, stir, fold, whisk
  | "salt"       // season, finish with salt
  | "rest"       // chill, rest, marinate, wait
  | "serve"      // plate, serve
  | "blend";     // blend, purée, emulsify

export type Step = {
  number: number;
  headline: string;
  action: string;
  icon: StepIcon;
  ingredients: Ingredient[];
  equipment: string[];
  temperature: string | null;
  duration: string | null;
  doneness_cue: string | null;
};

export type CookCard = {
  title: string;
  source_url: string;
  servings: string | null;
  total_time: string | null;
  active_time: string | null;
  equipment: string[];
  pantry_ingredients: Ingredient[];
  steps: Step[];
};
