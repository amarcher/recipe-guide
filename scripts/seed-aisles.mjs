#!/usr/bin/env node
// One-off: assign an `aisle` field to every sprite in sprites/manifest.json.
// Idempotent — overwrites existing aisles to match this map. Delete this
// script once everything is categorized.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST = join(__dirname, "..", "sprites", "manifest.json");

const AISLE_BY_SLUG = {
  // ─── PRODUCE ──────────────────────────────────────────────────────────────
  "yellow-onion": "produce",
  "red-onion": "produce",
  "white-onion": "produce",
  "scallion": "produce",
  "shallot": "produce",
  "leek": "produce",
  "garlic": "produce",
  "celery": "produce",
  "carrot": "produce",
  "potato": "produce",
  "sweet-potato": "produce",
  "fennel-bulb": "produce",
  "tomato": "produce",
  "cherry-tomatoes": "produce",
  "cucumber": "produce",
  "bell-pepper": "produce",
  "jalapeno": "produce",
  "serrano": "produce",
  "poblano": "produce",
  "eggplant": "produce",
  "zucchini": "produce",
  "yellow-squash": "produce",
  "butternut-squash": "produce",
  "broccoli": "produce",
  "cauliflower": "produce",
  "cabbage": "produce",
  "brussels-sprouts": "produce",
  "kale": "produce",
  "spinach": "produce",
  "arugula": "produce",
  "romaine": "produce",
  "asparagus": "produce",
  "green-beans": "produce",
  "peas": "produce",
  "corn": "produce",
  "mushroom": "produce",
  "shiitake": "produce",
  "portobello": "produce",
  "ginger": "produce",
  "avocado": "produce",
  "lemon": "produce",
  "lime": "produce",
  "orange": "produce",
  "lemon-zest": "produce",
  "lime-zest": "produce",
  "orange-zest": "produce",
  "apple": "produce",
  "pear": "produce",
  "banana": "produce",
  "mango": "produce",
  "pineapple": "produce",
  "peach": "produce",
  "strawberry": "produce",
  "blueberry": "produce",
  "raspberry": "produce",
  "grapes": "produce",
  "basil": "produce",
  "oregano": "produce",
  "thyme": "produce",
  "rosemary": "produce",
  "sage": "produce",
  "parsley": "produce",
  "cilantro": "produce",
  "dill": "produce",
  "chives": "produce",
  "mint": "produce",
  "tarragon": "produce",

  // ─── MEAT ─────────────────────────────────────────────────────────────────
  "ground-beef": "meat",
  "ground-pork": "meat",
  "ground-chicken": "meat",
  "ground-turkey": "meat",
  "whole-chicken": "meat",
  "chicken-breast": "meat",
  "chicken-thigh": "meat",
  "chicken-wing": "meat",
  "chicken-drumstick": "meat",
  "pork-chop": "meat",
  "pork-tenderloin": "meat",
  "pork-shoulder": "meat",
  "bacon": "meat",
  "prosciutto": "meat",
  "pancetta": "meat",
  "italian-sausage": "meat",
  "beef-steak": "meat",
  "beef-brisket": "meat",
  "beef-short-ribs": "meat",

  // ─── SEAFOOD ──────────────────────────────────────────────────────────────
  "salmon": "seafood",
  "tuna": "seafood",
  "shrimp": "seafood",
  "scallops": "seafood",
  "cod": "seafood",
  "mussels": "seafood",
  "clams": "seafood",

  // ─── DAIRY ────────────────────────────────────────────────────────────────
  "whole-milk": "dairy",
  "butter": "dairy",
  "parmesan": "dairy",
  "heavy-cream": "dairy",
  "half-and-half": "dairy",
  "sour-cream": "dairy",
  "yogurt": "dairy",
  "greek-yogurt": "dairy",
  "mozzarella": "dairy",
  "cheddar": "dairy",
  "feta": "dairy",
  "ricotta": "dairy",
  "goat-cheese": "dairy",
  "cream-cheese": "dairy",
  "gruyere": "dairy",
  "egg": "dairy",
  "egg-yolk": "dairy",
  "egg-white": "dairy",
  "tofu": "dairy",

  // ─── BREAD · PASTA · GRAINS ───────────────────────────────────────────────
  "pasta": "bread-grains",
  "spaghetti": "bread-grains",
  "penne": "bread-grains",
  "rigatoni": "bread-grains",
  "linguine": "bread-grains",
  "fettuccine": "bread-grains",
  "orzo": "bread-grains",
  "lasagna-sheets": "bread-grains",
  "white-rice": "bread-grains",
  "brown-rice": "bread-grains",
  "basmati-rice": "bread-grains",
  "jasmine-rice": "bread-grains",
  "arborio-rice": "bread-grains",
  "quinoa": "bread-grains",
  "couscous": "bread-grains",
  "oats": "bread-grains",
  "polenta": "bread-grains",
  "bread": "bread-grains",
  "tortilla": "bread-grains",
  "bread-crumbs": "bread-grains",
  "panko": "bread-grains",

  // ─── PANTRY (dry beans, dry goods) ───────────────────────────────────────
  "chickpeas": "pantry",
  "black-beans": "pantry",
  "kidney-beans": "pantry",
  "pinto-beans": "pantry",
  "white-beans": "pantry",
  "lentils": "pantry",
  "red-lentils": "pantry",

  // ─── CANNED · JARRED ──────────────────────────────────────────────────────
  "crushed-tomatoes": "canned-jarred",
  "broth": "canned-jarred",
  "coconut-milk": "canned-jarred",
  "tomato-paste": "canned-jarred",
  "tomato-sauce": "canned-jarred",
  "anchovies": "canned-jarred",
  "sardines": "canned-jarred",
  "kalamata-olives": "canned-jarred",
  "capers": "canned-jarred",
  "pickles": "canned-jarred",

  // ─── SPICES · DRIED HERBS ────────────────────────────────────────────────
  "kosher-salt": "spices",
  "black-pepper": "spices",
  "fennel-seed": "spices",
  "red-pepper-flakes": "spices",
  "cumin": "spices",
  "coriander": "spices",
  "paprika": "spices",
  "smoked-paprika": "spices",
  "cayenne": "spices",
  "turmeric": "spices",
  "cinnamon": "spices",
  "nutmeg": "spices",
  "allspice": "spices",
  "cloves": "spices",
  "cardamom": "spices",
  "star-anise": "spices",
  "saffron": "spices",
  "curry-powder": "spices",
  "chili-powder": "spices",
  "garam-masala": "spices",
  "garlic-powder": "spices",
  "onion-powder": "spices",
  "white-pepper": "spices",
  "mustard-seed": "spices",
  "sumac": "spices",
  "bay-leaf": "spices",

  // ─── OILS · VINEGARS ──────────────────────────────────────────────────────
  "olive-oil": "oils-vinegars",
  "vegetable-oil": "oils-vinegars",
  "canola-oil": "oils-vinegars",
  "sesame-oil": "oils-vinegars",
  "coconut-oil": "oils-vinegars",
  "balsamic-vinegar": "oils-vinegars",
  "red-wine-vinegar": "oils-vinegars",
  "white-wine-vinegar": "oils-vinegars",
  "rice-vinegar": "oils-vinegars",
  "apple-cider-vinegar": "oils-vinegars",

  // ─── CONDIMENTS · SAUCES ─────────────────────────────────────────────────
  "soy-sauce": "condiments",
  "fish-sauce": "condiments",
  "worcestershire": "condiments",
  "sriracha": "condiments",
  "ketchup": "condiments",
  "dijon-mustard": "condiments",
  "yellow-mustard": "condiments",
  "mayonnaise": "condiments",

  // ─── BAKING ───────────────────────────────────────────────────────────────
  "all-purpose-flour": "baking",
  "bread-flour": "baking",
  "whole-wheat-flour": "baking",
  "almond-flour": "baking",
  "granulated-sugar": "baking",
  "brown-sugar": "baking",
  "powdered-sugar": "baking",
  "honey": "baking",
  "maple-syrup": "baking",
  "vanilla-extract": "baking",
  "vanilla-bean": "baking",
  "baking-powder": "baking",
  "baking-soda": "baking",
  "cocoa-powder": "baking",
  "chocolate-chips": "baking",
  "dark-chocolate": "baking",
  "yeast": "baking",
  "cornstarch": "baking",

  // ─── NUTS · SEEDS ────────────────────────────────────────────────────────
  "almonds": "nuts-seeds",
  "walnuts": "nuts-seeds",
  "pecans": "nuts-seeds",
  "pistachios": "nuts-seeds",
  "pine-nuts": "nuts-seeds",
  "cashews": "nuts-seeds",
  "hazelnuts": "nuts-seeds",
  "sesame-seeds": "nuts-seeds",

  // ─── WINE · SPIRITS ──────────────────────────────────────────────────────
  "white-wine": "wine-spirits",

  // ─── OTHER ───────────────────────────────────────────────────────────────
  "water": "other",
};

const m = JSON.parse(await readFile(MANIFEST, "utf8"));
let assigned = 0;
let unmapped = [];
for (const sprite of m.sprites) {
  const aisle = AISLE_BY_SLUG[sprite.slug];
  if (aisle) {
    sprite.aisle = aisle;
    assigned++;
  } else {
    unmapped.push(sprite.slug);
  }
}
await writeFile(MANIFEST, JSON.stringify(m, null, 2) + "\n");
console.log(`Assigned aisle to ${assigned}/${m.sprites.length} sprites.`);
if (unmapped.length > 0) {
  console.log(`Unmapped (${unmapped.length}):`);
  for (const s of unmapped) console.log("  -", s);
}
