#!/usr/bin/env node
// Seed a hardcoded demo WeeklyPlan + MealCandidates for andrew.m.archer@gmail.com
// so the /plan UI has something to render before the LLM pipeline exists.
// Idempotent: deletes any prior plan with intake.demo === true for this user.
//
// Usage:
//   node --env-file=.env.local scripts/seed-demo-plan.ts

import { PrismaClient } from "../app/generated/prisma/client.ts";
import { PrismaNeon } from "@prisma/adapter-neon";

type Ingredient = {
  quantity: string | null;
  unit: string | null;
  item: string;
  prep: string | null;
  note: string | null;
};

type Step = {
  number: number;
  headline: string;
  action: string;
  icon: string;
  ingredients: Ingredient[];
  equipment: string[];
  temperature: string | null;
  duration: string | null;
  doneness_cue: string | null;
};

type CookCard = {
  title: string;
  source_url: string;
  servings: string | null;
  total_time: string | null;
  active_time: string | null;
  equipment: string[];
  pantry_ingredients: Ingredient[];
  steps: Step[];
};

const TARGET_EMAIL = "andrew.m.archer@gmail.com";

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter, log: ["warn", "error"] });

function ing(item: string, quantity?: string, unit?: string, prep?: string): Ingredient {
  return {
    quantity: quantity ?? null,
    unit: unit ?? null,
    item,
    prep: prep ?? null,
    note: null,
  };
}

function card(title: string, totalMin: number, pantry: Ingredient[], steps: Step[]): CookCard {
  return {
    title,
    source_url: `https://demo.local/${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    servings: "4",
    total_time: `${totalMin} minutes`,
    active_time: `${Math.max(10, Math.floor(totalMin * 0.6))} minutes`,
    equipment: Array.from(new Set(steps.flatMap((s) => s.equipment))),
    pantry_ingredients: pantry,
    steps,
  };
}

function step(n: number, headline: string, action: string, icon: string, opts: Partial<Step> = {}): Step {
  return {
    number: n,
    headline,
    action,
    icon,
    ingredients: opts.ingredients ?? [],
    equipment: opts.equipment ?? [],
    temperature: opts.temperature ?? null,
    duration: opts.duration ?? null,
    doneness_cue: opts.doneness_cue ?? null,
  };
}

function mondayOf(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

async function main() {
  const user = await prisma.user.findUnique({ where: { email: TARGET_EMAIL } });
  if (!user) {
    console.error(`No user found with email ${TARGET_EMAIL}. Sign in once first.`);
    process.exit(1);
  }

  const prior = await prisma.weeklyPlan.findMany({
    where: { createdById: user.id },
    select: { id: true, intake: true },
  });
  const demoIds = prior
    .filter((p) => (p.intake as { demo?: boolean } | null)?.demo === true)
    .map((p) => p.id);
  if (demoIds.length) {
    await prisma.weeklyPlan.deleteMany({ where: { id: { in: demoIds } } });
    console.log(`Deleted ${demoIds.length} prior demo plan(s).`);
  }

  const familyName = "Demo Family (seed)";
  let family = await prisma.family.findFirst({ where: { name: familyName } });
  if (!family) {
    family = await prisma.family.create({ data: { name: familyName } });
  }
  for (const email of [TARGET_EMAIL, "dev@recipe-guide.local"]) {
    const member = await prisma.user.findUnique({ where: { email } });
    if (!member) continue;
    const existing = await prisma.familyMember.findFirst({
      where: { userId: member.id, familyId: family.id },
    });
    if (!existing) {
      await prisma.familyMember.create({
        data: { userId: member.id, familyId: family.id, role: "OWNER" },
      });
    }
  }

  const profileIds = {} as Record<"ADULT" | "KID", string>;
  for (const kind of ["ADULT", "KID"] as const) {
    let profile = await prisma.profile.findFirst({
      where: { familyId: family.id, kind },
    });
    if (!profile) {
      profile = await prisma.profile.create({
        data: {
          familyId: family.id,
          kind,
          name: kind === "ADULT" ? "Adults" : "Kids",
        },
      });
    }
    profileIds[kind] = profile.id;
  }

  const demoPrefs = [
    { profile: "ADULT", kind: "RELIABLE_HIT", display: "turkey rice bowls", slug: "ground-turkey", evidenceCount: 3 },
    { profile: "ADULT", kind: "EXPERIMENTING", display: "shakshuka", slug: null, evidenceCount: 1 },
    { profile: "ADULT", kind: "HARD_NO", display: "mushrooms", slug: "mushroom", evidenceCount: 2 },
    { profile: "KID", kind: "RELIABLE_HIT", display: "pasta", slug: "pasta", evidenceCount: 4 },
    { profile: "KID", kind: "RELIABLE_HIT", display: "quesadillas", slug: null, evidenceCount: 2 },
    { profile: "KID", kind: "EXPERIMENTING", display: "bell pepper", slug: "bell-pepper", evidenceCount: 1 },
    { profile: "KID", kind: "HARD_NO", display: "mushrooms", slug: "mushroom", evidenceCount: 3 },
    { profile: "KID", kind: "HARD_NO", display: "fish", slug: null, evidenceCount: 1 },
  ] as const;
  for (const p of demoPrefs) {
    const profileId = profileIds[p.profile];
    const existing = await prisma.profilePreference.findFirst({
      where: { profileId, kind: p.kind, display: p.display },
    });
    if (!existing) {
      await prisma.profilePreference.create({
        data: {
          profileId,
          kind: p.kind,
          display: p.display,
          slug: p.slug,
          evidenceCount: p.evidenceCount,
          source: "intake",
        },
      });
    }
  }

  const nextMonday = mondayOf(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

  const intake = {
    demo: true,
    weekOf: nextMonday.toISOString().slice(0, 10),
    slots: [
      { slot: "DINNER", eaters: ["ADULTS", "KIDS"], mode: "PLAN", count: 3 },
      { slot: "DINNER", eaters: ["ADULTS"], mode: "PLAN", count: 1 },
      { slot: "DINNER", eaters: ["KIDS"], mode: "PLAN", count: 1 },
      { slot: "LUNCH", eaters: ["ADULTS"], mode: "PLAN", count: 2 },
      { slot: "LUNCH", eaters: ["KIDS"], mode: "PLAN", count: 1 },
      { slot: "BREAKFAST", eaters: ["KIDS"], mode: "PLAN", count: 2 },
    ],
    mood: { useUp: 0.6, explore: 0.2, survival: 0.2 },
    pantry: [
      { display: "ground turkey", slug: "ground-turkey", mustUse: true },
      { display: "half bag spinach", slug: "spinach", mustUse: true },
      { display: "jar of kalamata olives (open)", slug: "kalamata-olive", mustUse: true },
      { display: "brown rice", slug: "rice" },
      { display: "eggs (dozen)", slug: "egg" },
      { display: "sharp cheddar", slug: "cheddar" },
    ],
    aspirations: {
      adults: ["been curious about shakshuka"],
      kids: [],
    },
    constraints: {
      weeknightMaxCookMinutes: 40,
      avoid: ["mushroom"],
      equipmentOut: [],
    },
    kidRules: {
      reliableHits: [
        { display: "pasta", slug: "pasta" },
        { display: "quesadillas" },
        { display: "chicken and rice", slug: "chicken-thigh" },
      ],
      hardNos: [
        { display: "mushrooms", slug: "mushroom" },
        { display: "fish" },
      ],
    },
    notes: "Turkey and spinach are the pressure points this week. One explore slot OK.",
  };

  const skeleton = {
    heroIngredients: [
      { slug: "ground-turkey", label: "ground turkey", appearsIn: ["DINNER x2"], reason: "must use by Thursday" },
      { slug: "spinach", label: "spinach", appearsIn: ["DINNER x1", "LUNCH x1"], reason: "wilts into anything, use early" },
      { slug: "kalamata-olive", label: "kalamata olives", appearsIn: ["DINNER x1"], reason: "open jar, use or lose" },
      { slug: "egg", label: "eggs", appearsIn: ["DINNER x1", "BREAKFAST x2"], reason: "shakshuka + kid breakfasts" },
      { slug: "rice", label: "rice", appearsIn: ["LUNCH x1"], reason: "pantry staple, flexible base" },
      { slug: "bell-pepper", label: "bell pepper", appearsIn: ["DINNER x2"], reason: "shared between turkey bowls and shakshuka" },
    ],
    themes: [
      "Use up the mustUse trio in the first half of the week",
      "One explore slot: shakshuka for adults while kids get quesadillas",
    ],
    constraintsAcknowledged: [
      "no mushrooms or fish anywhere",
      "kid slots kept within reliableHits",
    ],
    rationale:
      "The mustUse list is doing the steering — turkey and spinach anchor the first two dinners and we'll work through the olives midweek. Friday is the one stretch: shakshuka for you two, quesadillas for the kids.",
  };

  const plan = await prisma.weeklyPlan.create({
    data: {
      createdById: user.id,
      familyId: family.id,
      weekOf: nextMonday,
      status: "CANDIDATES_READY",
      intake,
      skeleton,
    },
  });

  const candidates: Array<{
    slot: "BREAKFAST" | "LUNCH" | "DINNER";
    eaters: Array<"ADULTS" | "KIDS">;
    title: string;
    summary: string;
    rationale: string;
    heroIngredientSlugs: string[];
    approxCookMinutes: number;
    kidFitTag: "RELIABLE" | "STRETCH" | "NEW";
    rank: number;
    score: number;
    badges: string[];
    card: CookCard;
  }> = [
    {
      slot: "DINNER",
      eaters: ["ADULTS", "KIDS"],
      title: "Turkey + spinach pasta bake",
      summary: "One-pan casserole with ground turkey, wilted spinach, and tomato — kid-friendly baseline.",
      rationale: "Uses both must-use heroes at once (turkey + spinach) and pasta is in kidRules.reliableHits.",
      heroIngredientSlugs: ["ground-turkey", "spinach", "pasta"],
      approxCookMinutes: 35,
      kidFitTag: "RELIABLE",
      rank: 1,
      score: 0.88,
      badges: ["clears-the-fridge", "kid-reliable", "under-40-min"],
      card: card("Turkey + spinach pasta bake", 35, [
        ing("ground turkey", "1", "lb"),
        ing("spinach", "4", "cups", "roughly chopped"),
        ing("crushed tomatoes", "1", "can"),
        ing("rigatoni", "12", "oz"),
        ing("mozzarella", "1", "cup", "shredded"),
      ], [
        step(1, "Boil pasta", "Cook rigatoni 2 min shy of package directions, drain.", "boil", { duration: "8 minutes" }),
        step(2, "Brown turkey", "Break up turkey in a hot skillet with oil until no pink remains.", "flame", { duration: "6 minutes" }),
        step(3, "Build sauce", "Add tomatoes and spinach, simmer until spinach wilts.", "soup", { duration: "4 minutes" }),
        step(4, "Bake", "Combine pasta + sauce in a baking dish, top with mozzarella, bake.", "oven", { temperature: "400 F", duration: "15 minutes" }),
      ]),
    },
    {
      slot: "DINNER",
      eaters: ["ADULTS", "KIDS"],
      title: "One-pan turkey rice bowls",
      summary: "Ground turkey with bell pepper over rice — sauce on the side for the kids.",
      rationale: "Second turkey anchor of the week. Sauce-on-side pattern keeps kids reliable.",
      heroIngredientSlugs: ["ground-turkey", "rice", "bell-pepper"],
      approxCookMinutes: 25,
      kidFitTag: "RELIABLE",
      rank: 2,
      score: 0.82,
      badges: ["clears-the-fridge", "under-30-min", "kid-reliable"],
      card: card("One-pan turkey rice bowls", 25, [
        ing("ground turkey", "1", "lb"),
        ing("bell pepper", "2", null, "diced"),
        ing("jasmine rice", "1.5", "cups"),
        ing("soy sauce", "3", "tbsp"),
        ing("scallion", "3", null, "sliced"),
      ], [
        step(1, "Start rice", "Rinse and start rice per package.", "boil", { duration: "20 minutes" }),
        step(2, "Brown turkey", "Sear turkey in a large pan with oil.", "flame", { duration: "5 minutes" }),
        step(3, "Add peppers", "Stir in peppers, cook until softened.", "flame", { duration: "4 minutes" }),
        step(4, "Season + serve", "Soy + scallions over rice. Keep kid portions sauce-light.", "serve"),
      ]),
    },
    {
      slot: "DINNER",
      eaters: ["ADULTS", "KIDS"],
      title: "Sheet-pan harissa chicken + roasted veg",
      summary: "Weeknight sheet pan with chicken thighs, bell pepper, and a mild harissa rub.",
      rationale: "Adjustable spice — kid portions get the glaze brushed on lightly.",
      heroIngredientSlugs: ["chicken-thigh", "bell-pepper"],
      approxCookMinutes: 40,
      kidFitTag: "STRETCH",
      rank: 3,
      score: 0.71,
      badges: ["under-40-min"],
      card: card("Sheet-pan harissa chicken + roasted veg", 40, [
        ing("chicken thighs", "2", "lb", "bone-in"),
        ing("bell pepper", "2", null, "sliced"),
        ing("harissa paste", "2", "tbsp"),
        ing("olive oil", "3", "tbsp"),
      ], [
        step(1, "Preheat", "Oven to 425 F.", "oven", { temperature: "425 F" }),
        step(2, "Season", "Toss chicken and peppers with oil + harissa. Reserve plain portion for kids if needed.", "salt"),
        step(3, "Roast", "Spread on sheet pan, roast until chicken 165 F internal.", "oven", { temperature: "425 F", duration: "30 minutes", doneness_cue: "165 F internal" }),
      ]),
    },
    {
      slot: "DINNER",
      eaters: ["ADULTS"],
      title: "Shakshuka with feta + crusty bread",
      summary: "Eggs poached in spiced tomato with olives and feta. Honors the aspiration.",
      rationale: "Explore slot. Uses pantry eggs + open olive jar + bell pepper from the skeleton.",
      heroIngredientSlugs: ["egg", "bell-pepper", "kalamata-olive"],
      approxCookMinutes: 30,
      kidFitTag: "RELIABLE",
      rank: 1,
      score: 0.79,
      badges: ["honors-aspiration", "clears-the-fridge", "under-30-min"],
      card: card("Shakshuka with feta + crusty bread", 30, [
        ing("eggs", "6"),
        ing("bell pepper", "1", null, "sliced"),
        ing("crushed tomatoes", "1", "can"),
        ing("kalamata olives", "1/3", "cup", "halved"),
        ing("feta", "1/2", "cup", "crumbled"),
      ], [
        step(1, "Soften peppers", "Cook peppers in oil in a cast iron pan.", "flame", { duration: "6 minutes" }),
        step(2, "Build sauce", "Add tomatoes, olives, pinch of chili, simmer.", "soup", { duration: "8 minutes" }),
        step(3, "Poach eggs", "Crack eggs into wells, cover, cook to runny.", "flame", { duration: "8 minutes", doneness_cue: "whites set, yolks jiggly" }),
        step(4, "Finish", "Scatter feta, serve with bread.", "serve"),
      ]),
    },
    {
      slot: "DINNER",
      eaters: ["KIDS"],
      title: "Cheese quesadillas + black beans",
      summary: "Fast, reliable kid dinner for the Friday split night.",
      rationale: "Strict reliableHits match. Cooks in 15 while adults do shakshuka.",
      heroIngredientSlugs: ["cheddar"],
      approxCookMinutes: 15,
      kidFitTag: "RELIABLE",
      rank: 1,
      score: 0.86,
      badges: ["kid-reliable", "under-30-min"],
      card: card("Cheese quesadillas + black beans", 15, [
        ing("flour tortillas", "4"),
        ing("sharp cheddar", "1", "cup", "shredded"),
        ing("black beans", "1", "can", "rinsed"),
      ], [
        step(1, "Warm beans", "Heat beans with a splash of water and a pinch of salt.", "soup", { duration: "5 minutes" }),
        step(2, "Quesadillas", "Cheese between tortillas, griddle until golden both sides.", "flame", { duration: "6 minutes" }),
        step(3, "Serve", "Cut into wedges, beans on the side.", "serve"),
      ]),
    },
    {
      slot: "LUNCH",
      eaters: ["ADULTS"],
      title: "Chickpea + spinach grain bowl",
      summary: "Warm rice bowl with chickpeas, wilted spinach, lemon-tahini drizzle.",
      rationale: "Reuses the spinach hero and pantry rice. Under 20 minutes for a weekday lunch.",
      heroIngredientSlugs: ["spinach", "rice"],
      approxCookMinutes: 20,
      kidFitTag: "RELIABLE",
      rank: 1,
      score: 0.80,
      badges: ["clears-the-fridge", "under-30-min", "uses-pantry-x3"],
      card: card("Chickpea + spinach grain bowl", 20, [
        ing("chickpeas", "1", "can", "rinsed"),
        ing("spinach", "3", "cups"),
        ing("cooked rice", "2", "cups"),
        ing("tahini", "2", "tbsp"),
        ing("lemon", "1", null, "juiced"),
      ], [
        step(1, "Crisp chickpeas", "Toss with oil + salt, pan-crisp.", "flame", { duration: "6 minutes" }),
        step(2, "Wilt spinach", "Add spinach to pan, cook until wilted.", "flame", { duration: "2 minutes" }),
        step(3, "Assemble", "Rice base, chickpeas + spinach on top, tahini + lemon.", "serve"),
      ]),
    },
    {
      slot: "LUNCH",
      eaters: ["ADULTS"],
      title: "Tuna melt + simple salad",
      summary: "Open-face tuna melts with sharp cheddar under the broiler.",
      rationale: "Pantry-heavy, fast. Uses the sharp cheddar before it turns.",
      heroIngredientSlugs: ["cheddar"],
      approxCookMinutes: 15,
      kidFitTag: "RELIABLE",
      rank: 2,
      score: 0.68,
      badges: ["under-30-min", "uses-pantry-x3"],
      card: card("Tuna melt + simple salad", 15, [
        ing("tuna", "2", "cans", "drained"),
        ing("mayo", "3", "tbsp"),
        ing("sharp cheddar", "4", "slices"),
        ing("bread", "4", "slices"),
        ing("mixed greens", "4", "cups"),
      ], [
        step(1, "Mix tuna", "Tuna + mayo + salt + pepper.", "mix"),
        step(2, "Broil", "Tuna on bread, cheddar on top, broil until bubbly.", "oven", { duration: "3 minutes" }),
        step(3, "Salad", "Dress greens simply.", "serve"),
      ]),
    },
    {
      slot: "LUNCH",
      eaters: ["KIDS"],
      title: "Turkey + cheese roll-ups + grapes",
      summary: "Lunchbox-friendly cold roll-ups for kid packed lunches.",
      rationale: "Also uses the must-use turkey, no cook required.",
      heroIngredientSlugs: ["ground-turkey"],
      approxCookMinutes: 5,
      kidFitTag: "RELIABLE",
      rank: 1,
      score: 0.75,
      badges: ["kid-reliable", "under-30-min"],
      card: card("Turkey + cheese roll-ups + grapes", 5, [
        ing("sliced turkey", "6", "slices"),
        ing("sliced cheddar", "6", "slices"),
        ing("flour tortillas", "2", null, "halved"),
        ing("grapes", "1", "cup"),
      ], [
        step(1, "Roll", "Turkey + cheese in tortilla, roll tight, halve.", "knife"),
        step(2, "Pack", "Pack with grapes.", "serve"),
      ]),
    },
    {
      slot: "BREAKFAST",
      eaters: ["KIDS"],
      title: "Scrambled eggs + toast",
      summary: "Soft-scrambled eggs with buttered toast.",
      rationale: "Uses pantry eggs. Reliable kid breakfast.",
      heroIngredientSlugs: ["egg"],
      approxCookMinutes: 10,
      kidFitTag: "RELIABLE",
      rank: 1,
      score: 0.78,
      badges: ["kid-reliable", "under-30-min"],
      card: card("Scrambled eggs + toast", 10, [
        ing("eggs", "4"),
        ing("butter", "1", "tbsp"),
        ing("bread", "2", "slices"),
      ], [
        step(1, "Whisk eggs", "Beat eggs with a pinch of salt.", "mix"),
        step(2, "Scramble", "Low heat, stir constantly until just set.", "flame", { duration: "4 minutes", doneness_cue: "glossy, soft curds" }),
        step(3, "Toast + serve", "Butter toast, plate.", "serve"),
      ]),
    },
    {
      slot: "BREAKFAST",
      eaters: ["KIDS"],
      title: "Overnight oats with berries",
      summary: "Prep-ahead oats in jars with milk, honey, frozen berries.",
      rationale: "Zero-effort kid breakfast, makes multiple jars at once.",
      heroIngredientSlugs: [],
      approxCookMinutes: 5,
      kidFitTag: "RELIABLE",
      rank: 2,
      score: 0.65,
      badges: ["kid-reliable", "under-30-min"],
      card: card("Overnight oats with berries", 5, [
        ing("rolled oats", "2", "cups"),
        ing("milk", "2", "cups"),
        ing("honey", "2", "tbsp"),
        ing("frozen berries", "1", "cup"),
      ], [
        step(1, "Combine", "Jars: oats, milk, honey, berries.", "mix"),
        step(2, "Chill", "Refrigerate overnight.", "rest", { duration: "8 hours" }),
      ]),
    },
  ];

  const createdCandidates = [];
  for (const c of candidates) {
    const row = await prisma.mealCandidate.create({
      data: {
        planId: plan.id,
        slot: c.slot,
        eaters: c.eaters,
        title: c.title,
        summary: c.summary,
        rationale: c.rationale,
        heroIngredientSlugs: c.heroIngredientSlugs,
        approxCookMinutes: c.approxCookMinutes,
        kidFitTag: c.kidFitTag,
        composedCardDraft: c.card as unknown as object,
        rank: c.rank,
        score: c.score,
        badges: c.badges,
        rankedAt: new Date(),
      },
    });
    createdCandidates.push(row);
  }

  const queuedFrom =
    createdCandidates.find((c) => c.slot === "DINNER" && c.eaters.length === 2) ??
    createdCandidates[0];
  const cookedFrom =
    createdCandidates.find((c) => c.slot === "DINNER" && c.id !== queuedFrom.id) ??
    createdCandidates[1];
  const queuedMeal = await prisma.plannedMeal.create({
    data: {
      planId: plan.id,
      chosenCandidateId: queuedFrom.id,
      slot: queuedFrom.slot,
      eaters: queuedFrom.eaters,
    },
  });
  const cookedMeal = await prisma.plannedMeal.create({
    data: {
      planId: plan.id,
      chosenCandidateId: cookedFrom.id,
      slot: cookedFrom.slot,
      eaters: cookedFrom.eaters,
      status: "COOKED",
      cookedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    },
  });
  await prisma.mealOutcome.create({
    data: {
      plannedMealId: cookedMeal.id,
      profileId: profileIds.ADULT,
      eaterRole: "ADULT",
      verdict: "ATE",
    },
  });
  await prisma.mealOutcome.create({
    data: {
      plannedMealId: cookedMeal.id,
      profileId: profileIds.KID,
      eaterRole: "KID",
      verdict: "PICKED",
    },
  });

  console.log(`Seeded plan ${plan.id} with ${candidates.length} candidates.`);
  console.log(`Week of: ${nextMonday.toISOString().slice(0, 10)}`);
  console.log(`View at: /plan/${plan.id}`);
  console.log(`Queued meal (outcome prompt target): ${queuedMeal.id}`);
  console.log(`Cooked meal with prior outcomes: ${cookedMeal.id}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
