#!/usr/bin/env node
// One-off: extend sprites/manifest.json with a curated list of common
// ingredients. Skips slugs that already exist. Safe to re-run; idempotent.
// Delete this script once you're happy with the seeded set.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST = join(__dirname, "..", "sprites", "manifest.json");

const NEW = [
  // ─── PROTEINS ────────────────────────────────────────────────────────────
  { slug: "whole-chicken",   label: "a raw whole chicken",                              aliases: ["whole chicken", "roasting chicken"] },
  { slug: "chicken-breast",  label: "raw boneless skinless chicken breasts",            aliases: ["chicken breast", "chicken breasts", "boneless skinless chicken breast"] },
  { slug: "chicken-thigh",   label: "raw bone-in chicken thighs",                       aliases: ["chicken thigh", "chicken thighs", "bone-in chicken thigh"] },
  { slug: "chicken-wing",    label: "raw chicken wings",                                aliases: ["chicken wing", "chicken wings"] },
  { slug: "chicken-drumstick", label: "raw chicken drumsticks",                         aliases: ["chicken drumstick", "drumstick", "drumsticks"] },
  { slug: "ground-chicken",  label: "a portion of raw ground chicken",                  aliases: ["ground chicken", "minced chicken"] },
  { slug: "ground-turkey",   label: "a portion of raw ground turkey",                   aliases: ["ground turkey", "minced turkey"] },
  { slug: "pork-chop",       label: "a thick raw bone-in pork chop",                    aliases: ["pork chop", "pork chops", "bone-in pork chop"] },
  { slug: "pork-tenderloin", label: "a raw pork tenderloin",                            aliases: ["pork tenderloin", "tenderloin"] },
  { slug: "pork-shoulder",   label: "a raw pork shoulder roast",                        aliases: ["pork shoulder", "boston butt", "pork butt"] },
  { slug: "bacon",           label: "raw strips of bacon",                              aliases: ["bacon", "bacon strips", "thick-cut bacon"] },
  { slug: "prosciutto",      label: "thin slices of prosciutto",                        aliases: ["prosciutto", "prosciutto di parma"] },
  { slug: "pancetta",        label: "diced cubes of pancetta",                          aliases: ["pancetta", "diced pancetta"] },
  { slug: "italian-sausage", label: "raw italian sausage links",                        aliases: ["italian sausage", "sweet italian sausage", "hot italian sausage"] },
  { slug: "beef-steak",      label: "a raw ribeye steak",                               aliases: ["ribeye", "ribeye steak", "beef steak", "steak"] },
  { slug: "beef-brisket",    label: "a raw beef brisket",                               aliases: ["brisket", "beef brisket"] },
  { slug: "beef-short-ribs", label: "raw beef short ribs",                              aliases: ["short ribs", "beef short ribs"] },
  { slug: "salmon",          label: "a raw salmon fillet",                              aliases: ["salmon", "salmon fillet", "salmon filet"] },
  { slug: "tuna",            label: "a raw tuna steak",                                 aliases: ["tuna", "tuna steak", "ahi tuna"] },
  { slug: "shrimp",          label: "raw peeled shrimp",                                aliases: ["shrimp", "prawns"] },
  { slug: "scallops",        label: "raw sea scallops",                                 aliases: ["scallops", "sea scallops"] },
  { slug: "cod",             label: "a raw cod fillet",                                 aliases: ["cod", "cod fillet"] },
  { slug: "anchovies",       label: "tinned anchovy fillets in oil",                    aliases: ["anchovies", "anchovy", "anchovy fillets"] },
  { slug: "sardines",        label: "tinned sardines",                                  aliases: ["sardines", "sardine"] },
  { slug: "mussels",         label: "raw mussels in their shells",                      aliases: ["mussels", "mussel"] },
  { slug: "clams",           label: "raw littleneck clams in their shells",             aliases: ["clams", "clam", "littleneck clams"] },
  { slug: "egg",             label: "a single fresh whole egg in its shell",            aliases: ["egg", "eggs", "large egg", "large eggs"] },
  { slug: "egg-yolk",        label: "fresh egg yolks separated in a small bowl",        aliases: ["egg yolk", "egg yolks", "yolk", "yolks"] },
  { slug: "egg-white",       label: "egg whites separated in a small bowl",             aliases: ["egg white", "egg whites"] },
  { slug: "tofu",            label: "a block of firm white tofu",                       aliases: ["tofu", "firm tofu", "extra-firm tofu"] },

  // ─── VEGETABLES ──────────────────────────────────────────────────────────
  { slug: "red-onion",       label: "a whole red onion",                                aliases: ["red onion", "red onions"] },
  { slug: "white-onion",     label: "a whole white onion",                              aliases: ["white onion", "white onions"] },
  { slug: "scallion",        label: "a small bunch of fresh scallions",                 aliases: ["scallion", "scallions", "green onion", "green onions", "spring onion"] },
  { slug: "shallot",         label: "a small whole shallot with papery skin",           aliases: ["shallot", "shallots"] },
  { slug: "leek",            label: "a fresh whole leek",                               aliases: ["leek", "leeks"] },
  { slug: "celery",          label: "a few stalks of fresh celery",                     aliases: ["celery", "celery stalk", "celery stalks", "celery rib"] },
  { slug: "carrot",          label: "a fresh whole carrot",                             aliases: ["carrot", "carrots"] },
  { slug: "potato",          label: "a whole russet potato",                            aliases: ["potato", "potatoes", "russet potato", "russet potatoes"] },
  { slug: "sweet-potato",    label: "a whole sweet potato",                             aliases: ["sweet potato", "sweet potatoes", "yam", "yams"] },
  { slug: "tomato",          label: "a single ripe red vine tomato",                    aliases: ["fresh tomato", "fresh tomatoes", "ripe tomato", "vine tomato"] },
  { slug: "cherry-tomatoes", label: "a small pile of fresh cherry tomatoes",            aliases: ["cherry tomatoes", "cherry tomato", "grape tomatoes"] },
  { slug: "cucumber",        label: "a whole fresh cucumber",                           aliases: ["cucumber", "cucumbers", "english cucumber"] },
  { slug: "bell-pepper",     label: "a whole fresh red bell pepper",                    aliases: ["bell pepper", "bell peppers", "red bell pepper", "green bell pepper", "yellow bell pepper"] },
  { slug: "jalapeno",        label: "a whole fresh jalapeño pepper",                    aliases: ["jalapeño", "jalapeno", "jalapenos"] },
  { slug: "serrano",         label: "a whole fresh serrano pepper",                     aliases: ["serrano", "serrano pepper", "serrano chile"] },
  { slug: "poblano",         label: "a whole fresh poblano pepper",                     aliases: ["poblano", "poblano pepper", "poblano chile"] },
  { slug: "eggplant",        label: "a whole shiny purple eggplant",                    aliases: ["eggplant", "aubergine"] },
  { slug: "zucchini",        label: "a whole fresh green zucchini",                     aliases: ["zucchini", "courgette"] },
  { slug: "yellow-squash",   label: "a whole fresh yellow summer squash",               aliases: ["yellow squash", "summer squash"] },
  { slug: "butternut-squash", label: "a whole butternut squash",                        aliases: ["butternut squash", "butternut"] },
  { slug: "broccoli",        label: "a fresh head of broccoli",                         aliases: ["broccoli", "broccoli florets"] },
  { slug: "cauliflower",     label: "a fresh head of cauliflower",                      aliases: ["cauliflower", "cauliflower florets"] },
  { slug: "cabbage",         label: "a whole green cabbage",                            aliases: ["cabbage", "green cabbage", "savoy cabbage", "napa cabbage"] },
  { slug: "brussels-sprouts", label: "fresh brussels sprouts",                          aliases: ["brussels sprouts", "brussel sprouts"] },
  { slug: "kale",            label: "a fresh bunch of curly kale",                      aliases: ["kale", "lacinato kale", "tuscan kale"] },
  { slug: "spinach",         label: "a small pile of fresh baby spinach leaves",        aliases: ["spinach", "baby spinach"] },
  { slug: "arugula",         label: "a small pile of fresh baby arugula",               aliases: ["arugula", "rocket"] },
  { slug: "romaine",         label: "a fresh head of romaine lettuce",                  aliases: ["romaine", "romaine lettuce", "lettuce"] },
  { slug: "asparagus",       label: "a small bundle of fresh green asparagus spears",   aliases: ["asparagus", "asparagus spears"] },
  { slug: "green-beans",     label: "a small handful of fresh green beans",             aliases: ["green beans", "string beans", "haricots verts"] },
  { slug: "peas",            label: "a small pile of fresh shelled green peas",         aliases: ["peas", "green peas", "fresh peas"] },
  { slug: "corn",            label: "a fresh ear of corn with husk peeled back",        aliases: ["corn", "corn on the cob", "ear of corn", "fresh corn"] },
  { slug: "mushroom",        label: "a small pile of fresh button mushrooms",           aliases: ["mushroom", "mushrooms", "button mushroom", "white mushroom", "cremini"] },
  { slug: "shiitake",        label: "fresh shiitake mushrooms",                         aliases: ["shiitake", "shiitake mushrooms"] },
  { slug: "portobello",      label: "a fresh portobello mushroom",                      aliases: ["portobello", "portobello mushroom", "portabella"] },
  { slug: "ginger",          label: "a fresh knob of ginger root",                      aliases: ["ginger", "fresh ginger", "ginger root"] },
  { slug: "avocado",         label: "a single ripe whole avocado",                      aliases: ["avocado", "avocados", "hass avocado"] },

  // ─── FRUITS / CITRUS ─────────────────────────────────────────────────────
  { slug: "lemon",           label: "a single fresh whole lemon",                       aliases: ["lemon", "lemons", "fresh lemon"] },
  { slug: "lime",            label: "a single fresh whole lime",                        aliases: ["lime", "limes", "fresh lime"] },
  { slug: "orange",          label: "a single fresh whole orange",                      aliases: ["orange", "oranges", "navel orange"] },
  { slug: "lemon-zest",      label: "a small pile of fresh lemon zest curls",           aliases: ["lemon zest", "zest of lemon"] },
  { slug: "lime-zest",       label: "a small pile of fresh lime zest curls",            aliases: ["lime zest", "zest of lime"] },
  { slug: "orange-zest",     label: "a small pile of fresh orange zest curls",          aliases: ["orange zest", "zest of orange"] },
  { slug: "apple",           label: "a single fresh whole red apple",                   aliases: ["apple", "apples", "honeycrisp apple", "granny smith"] },
  { slug: "pear",            label: "a single fresh whole pear",                        aliases: ["pear", "pears", "bartlett pear"] },
  { slug: "banana",          label: "a single ripe yellow banana",                      aliases: ["banana", "bananas"] },
  { slug: "mango",           label: "a single ripe whole mango",                        aliases: ["mango", "mangoes", "mangos"] },
  { slug: "pineapple",       label: "a single fresh whole pineapple",                   aliases: ["pineapple", "fresh pineapple"] },
  { slug: "peach",           label: "a single ripe whole peach",                        aliases: ["peach", "peaches", "fresh peach"] },
  { slug: "strawberry",      label: "a small pile of fresh ripe strawberries",          aliases: ["strawberry", "strawberries"] },
  { slug: "blueberry",       label: "a small pile of fresh ripe blueberries",           aliases: ["blueberry", "blueberries"] },
  { slug: "raspberry",       label: "a small pile of fresh ripe raspberries",           aliases: ["raspberry", "raspberries"] },
  { slug: "grapes",          label: "a small bunch of fresh red grapes",                aliases: ["grape", "grapes", "red grapes", "green grapes"] },

  // ─── DAIRY ───────────────────────────────────────────────────────────────
  { slug: "heavy-cream",     label: "a small pitcher of heavy cream",                   aliases: ["heavy cream", "heavy whipping cream", "double cream"] },
  { slug: "half-and-half",   label: "a small pitcher of half-and-half",                 aliases: ["half and half", "half-and-half"] },
  { slug: "sour-cream",      label: "a small dollop of sour cream in a bowl",           aliases: ["sour cream"] },
  { slug: "yogurt",          label: "a small bowl of plain yogurt",                     aliases: ["yogurt", "plain yogurt", "yoghurt"] },
  { slug: "greek-yogurt",    label: "a small bowl of thick plain greek yogurt",         aliases: ["greek yogurt", "greek yoghurt"] },
  { slug: "mozzarella",      label: "a fresh ball of mozzarella cheese",                aliases: ["mozzarella", "fresh mozzarella", "buffalo mozzarella"] },
  { slug: "cheddar",         label: "a wedge of sharp orange cheddar cheese",           aliases: ["cheddar", "cheddar cheese", "sharp cheddar"] },
  { slug: "feta",            label: "a block of crumbly white feta cheese",             aliases: ["feta", "feta cheese"] },
  { slug: "ricotta",         label: "a small bowl of fresh ricotta cheese",             aliases: ["ricotta", "ricotta cheese"] },
  { slug: "goat-cheese",     label: "a small log of fresh goat cheese",                 aliases: ["goat cheese", "chèvre", "chevre"] },
  { slug: "cream-cheese",    label: "a block of cream cheese",                          aliases: ["cream cheese"] },
  { slug: "gruyere",         label: "a wedge of gruyère cheese",                        aliases: ["gruyère", "gruyere", "gruyere cheese"] },

  // ─── PANTRY · OILS · VINEGARS ────────────────────────────────────────────
  { slug: "vegetable-oil",   label: "a clear bottle of vegetable oil",                  aliases: ["vegetable oil", "neutral oil"] },
  { slug: "canola-oil",      label: "a clear bottle of canola oil",                     aliases: ["canola oil"] },
  { slug: "sesame-oil",      label: "a small bottle of toasted sesame oil",             aliases: ["sesame oil", "toasted sesame oil"] },
  { slug: "coconut-oil",     label: "a small jar of solid white coconut oil",           aliases: ["coconut oil"] },
  { slug: "balsamic-vinegar", label: "a small bottle of dark balsamic vinegar",         aliases: ["balsamic vinegar", "balsamic"] },
  { slug: "red-wine-vinegar", label: "a small bottle of red wine vinegar",              aliases: ["red wine vinegar"] },
  { slug: "white-wine-vinegar", label: "a small bottle of white wine vinegar",          aliases: ["white wine vinegar"] },
  { slug: "rice-vinegar",    label: "a small bottle of clear rice vinegar",             aliases: ["rice vinegar", "rice wine vinegar"] },
  { slug: "apple-cider-vinegar", label: "a small bottle of amber apple cider vinegar",  aliases: ["apple cider vinegar", "cider vinegar"] },

  // ─── PANTRY · CONDIMENTS · SAUCES ────────────────────────────────────────
  { slug: "soy-sauce",       label: "a small bottle of dark soy sauce",                 aliases: ["soy sauce", "shoyu", "tamari"] },
  { slug: "fish-sauce",      label: "a small bottle of amber fish sauce",               aliases: ["fish sauce", "nam pla"] },
  { slug: "worcestershire",  label: "a small bottle of worcestershire sauce",           aliases: ["worcestershire", "worcestershire sauce"] },
  { slug: "sriracha",        label: "a small bottle of bright red sriracha sauce",      aliases: ["sriracha", "sriracha sauce"] },
  { slug: "ketchup",         label: "a small bottle of ketchup",                        aliases: ["ketchup", "tomato ketchup"] },
  { slug: "dijon-mustard",   label: "a small jar of yellow dijon mustard",              aliases: ["dijon", "dijon mustard"] },
  { slug: "yellow-mustard",  label: "a small jar of bright yellow mustard",             aliases: ["yellow mustard", "mustard", "prepared mustard"] },
  { slug: "mayonnaise",      label: "a small jar of creamy white mayonnaise",           aliases: ["mayonnaise", "mayo"] },
  { slug: "tomato-paste",    label: "a small open can of dark red tomato paste",        aliases: ["tomato paste", "tomato concentrate"] },
  { slug: "tomato-sauce",    label: "a small jar of red tomato sauce",                  aliases: ["tomato sauce", "marinara"] },
  { slug: "coconut-milk",    label: "a can of full-fat coconut milk",                   aliases: ["coconut milk", "full-fat coconut milk"] },

  // ─── PANTRY · BAKING ─────────────────────────────────────────────────────
  { slug: "all-purpose-flour", label: "a small pile of white all-purpose flour",        aliases: ["all-purpose flour", "all purpose flour", "ap flour", "flour"] },
  { slug: "bread-flour",     label: "a small pile of white bread flour",                aliases: ["bread flour"] },
  { slug: "whole-wheat-flour", label: "a small pile of whole wheat flour",              aliases: ["whole wheat flour", "wheat flour"] },
  { slug: "almond-flour",    label: "a small pile of fine almond flour",                aliases: ["almond flour", "almond meal"] },
  { slug: "granulated-sugar", label: "a small pile of white granulated sugar",          aliases: ["granulated sugar", "white sugar", "sugar"] },
  { slug: "brown-sugar",     label: "a small pile of soft light brown sugar",           aliases: ["brown sugar", "light brown sugar", "dark brown sugar"] },
  { slug: "powdered-sugar",  label: "a small pile of fine powdered sugar",              aliases: ["powdered sugar", "confectioners sugar", "icing sugar"] },
  { slug: "honey",           label: "a small jar of golden honey with a dipper",        aliases: ["honey"] },
  { slug: "maple-syrup",     label: "a small bottle of dark maple syrup",               aliases: ["maple syrup", "pure maple syrup"] },
  { slug: "vanilla-extract", label: "a small bottle of dark vanilla extract",           aliases: ["vanilla extract", "vanilla"] },
  { slug: "vanilla-bean",    label: "a single fresh whole vanilla bean pod",            aliases: ["vanilla bean", "vanilla pod"] },
  { slug: "baking-powder",   label: "a small open tin of white baking powder",          aliases: ["baking powder"] },
  { slug: "baking-soda",     label: "a small open box of white baking soda",            aliases: ["baking soda", "bicarbonate of soda", "sodium bicarbonate"] },
  { slug: "cocoa-powder",    label: "a small pile of dark unsweetened cocoa powder",    aliases: ["cocoa powder", "unsweetened cocoa", "cacao powder"] },
  { slug: "chocolate-chips", label: "a small pile of dark chocolate chips",             aliases: ["chocolate chips", "chocolate chunks", "semi-sweet chocolate chips"] },
  { slug: "dark-chocolate",  label: "a broken bar of dark chocolate",                   aliases: ["dark chocolate", "bittersweet chocolate"] },
  { slug: "yeast",           label: "a small pile of granular active dry yeast",        aliases: ["yeast", "active dry yeast", "instant yeast"] },
  { slug: "cornstarch",      label: "a small pile of fine white cornstarch",            aliases: ["cornstarch", "corn starch", "cornflour"] },

  // ─── HERBS · FRESH ───────────────────────────────────────────────────────
  { slug: "basil",           label: "a small bunch of fresh basil leaves",              aliases: ["basil", "fresh basil", "basil leaves"] },
  { slug: "oregano",         label: "a small sprig of fresh oregano",                   aliases: ["oregano", "fresh oregano", "dried oregano"] },
  { slug: "thyme",           label: "a small bunch of fresh thyme sprigs",              aliases: ["thyme", "fresh thyme", "thyme leaves", "dried thyme"] },
  { slug: "rosemary",        label: "a small sprig of fresh rosemary",                  aliases: ["rosemary", "fresh rosemary", "dried rosemary"] },
  { slug: "sage",            label: "a small bunch of fresh sage leaves",               aliases: ["sage", "fresh sage", "sage leaves"] },
  { slug: "parsley",         label: "a small bunch of fresh flat-leaf parsley",         aliases: ["parsley", "fresh parsley", "italian parsley", "flat-leaf parsley"] },
  { slug: "cilantro",        label: "a small bunch of fresh cilantro",                  aliases: ["cilantro", "fresh cilantro", "coriander leaves"] },
  { slug: "dill",            label: "a small bunch of fresh feathery dill",             aliases: ["dill", "fresh dill", "dill weed"] },
  { slug: "chives",          label: "a small bundle of fresh chives",                   aliases: ["chives", "fresh chives"] },
  { slug: "mint",            label: "a small bunch of fresh mint leaves",               aliases: ["mint", "fresh mint", "mint leaves"] },
  { slug: "tarragon",        label: "a small sprig of fresh tarragon",                  aliases: ["tarragon", "fresh tarragon"] },
  { slug: "bay-leaf",        label: "a few dried bay leaves",                           aliases: ["bay leaf", "bay leaves", "bay"] },

  // ─── SPICES · GROUND ─────────────────────────────────────────────────────
  { slug: "cumin",           label: "a small pile of ground cumin",                     aliases: ["cumin", "ground cumin", "cumin seeds"] },
  { slug: "coriander",       label: "a small pile of ground coriander",                 aliases: ["coriander", "ground coriander", "coriander seeds"] },
  { slug: "paprika",         label: "a small pile of bright red sweet paprika",         aliases: ["paprika", "sweet paprika"] },
  { slug: "smoked-paprika",  label: "a small pile of deep red smoked paprika",          aliases: ["smoked paprika", "pimentón"] },
  { slug: "cayenne",         label: "a small pile of bright red cayenne pepper",        aliases: ["cayenne", "cayenne pepper", "ground cayenne"] },
  { slug: "turmeric",        label: "a small pile of bright yellow ground turmeric",    aliases: ["turmeric", "ground turmeric"] },
  { slug: "cinnamon",        label: "a small pile of warm brown ground cinnamon",       aliases: ["cinnamon", "ground cinnamon", "cinnamon stick"] },
  { slug: "nutmeg",          label: "a whole nutmeg seed beside ground nutmeg",         aliases: ["nutmeg", "ground nutmeg", "fresh nutmeg"] },
  { slug: "allspice",        label: "a small pile of dark allspice berries",            aliases: ["allspice", "ground allspice"] },
  { slug: "cloves",          label: "a small pile of dried whole cloves",               aliases: ["cloves", "ground cloves", "whole cloves"] },
  { slug: "cardamom",        label: "a few whole green cardamom pods",                  aliases: ["cardamom", "green cardamom", "ground cardamom"] },
  { slug: "star-anise",      label: "a few whole dried star anise pods",                aliases: ["star anise"] },
  { slug: "saffron",         label: "a small pinch of red saffron threads",             aliases: ["saffron", "saffron threads"] },
  { slug: "curry-powder",    label: "a small pile of golden curry powder",              aliases: ["curry powder"] },
  { slug: "chili-powder",    label: "a small pile of dark red chili powder",            aliases: ["chili powder", "chile powder"] },
  { slug: "garam-masala",    label: "a small pile of warm brown garam masala",          aliases: ["garam masala"] },
  { slug: "garlic-powder",   label: "a small pile of pale yellow garlic powder",        aliases: ["garlic powder", "granulated garlic"] },
  { slug: "onion-powder",    label: "a small pile of pale tan onion powder",            aliases: ["onion powder"] },
  { slug: "white-pepper",    label: "a small pile of ground white pepper",              aliases: ["white pepper", "ground white pepper"] },
  { slug: "mustard-seed",    label: "a small pile of yellow mustard seeds",             aliases: ["mustard seed", "mustard seeds"] },
  { slug: "sumac",           label: "a small pile of deep red sumac powder",            aliases: ["sumac", "ground sumac"] },

  // ─── PASTA · RICE · GRAINS ───────────────────────────────────────────────
  { slug: "spaghetti",       label: "a small bundle of dry spaghetti",                  aliases: ["spaghetti"] },
  { slug: "penne",           label: "a small pile of dry penne pasta",                  aliases: ["penne"] },
  { slug: "rigatoni",        label: "a small pile of dry rigatoni pasta",               aliases: ["rigatoni"] },
  { slug: "linguine",        label: "a small bundle of dry linguine",                   aliases: ["linguine"] },
  { slug: "fettuccine",      label: "a small bundle of dry fettuccine",                 aliases: ["fettuccine"] },
  { slug: "orzo",            label: "a small pile of dry orzo pasta",                   aliases: ["orzo"] },
  { slug: "lasagna-sheets",  label: "a stack of dry lasagna sheets",                    aliases: ["lasagna sheets", "lasagna noodles", "lasagne sheets"] },
  { slug: "white-rice",      label: "a small pile of long-grain white rice",            aliases: ["white rice", "long grain rice", "rice"] },
  { slug: "brown-rice",      label: "a small pile of long-grain brown rice",            aliases: ["brown rice"] },
  { slug: "basmati-rice",    label: "a small pile of long fragrant basmati rice",       aliases: ["basmati rice", "basmati"] },
  { slug: "jasmine-rice",    label: "a small pile of long fragrant jasmine rice",       aliases: ["jasmine rice", "jasmine"] },
  { slug: "arborio-rice",    label: "a small pile of short-grain arborio rice",         aliases: ["arborio rice", "arborio", "risotto rice"] },
  { slug: "quinoa",          label: "a small pile of pale uncooked quinoa",             aliases: ["quinoa"] },
  { slug: "couscous",        label: "a small pile of pale dry couscous",                aliases: ["couscous"] },
  { slug: "oats",            label: "a small pile of rolled oats",                      aliases: ["oats", "rolled oats", "old fashioned oats", "oatmeal"] },
  { slug: "polenta",          label: "a small pile of coarse golden polenta",            aliases: ["polenta", "cornmeal"] },
  { slug: "bread",           label: "a rustic round loaf of crusty bread",              aliases: ["bread", "rustic bread", "boule", "loaf"] },
  { slug: "bread-crumbs",    label: "a small pile of golden plain breadcrumbs",         aliases: ["bread crumbs", "breadcrumbs"] },
  { slug: "panko",           label: "a small pile of crisp white panko breadcrumbs",    aliases: ["panko", "panko breadcrumbs"] },
  { slug: "tortilla",        label: "a stack of soft corn tortillas",                   aliases: ["tortilla", "tortillas", "corn tortilla", "flour tortilla"] },

  // ─── BEANS · LEGUMES ─────────────────────────────────────────────────────
  { slug: "chickpeas",       label: "a small pile of dry chickpeas",                    aliases: ["chickpeas", "chickpea", "garbanzo beans", "garbanzos"] },
  { slug: "black-beans",     label: "a small pile of dry black beans",                  aliases: ["black beans", "black bean"] },
  { slug: "kidney-beans",    label: "a small pile of dry red kidney beans",             aliases: ["kidney beans", "red kidney beans"] },
  { slug: "pinto-beans",     label: "a small pile of dry speckled pinto beans",         aliases: ["pinto beans", "pinto bean"] },
  { slug: "white-beans",     label: "a small pile of dry white cannellini beans",       aliases: ["white beans", "cannellini beans", "navy beans", "great northern beans"] },
  { slug: "lentils",         label: "a small pile of dry brown lentils",                aliases: ["lentils", "brown lentils", "green lentils", "lentil"] },
  { slug: "red-lentils",     label: "a small pile of dry split red lentils",            aliases: ["red lentils", "split red lentils", "masoor dal"] },

  // ─── NUTS · SEEDS ────────────────────────────────────────────────────────
  { slug: "almonds",         label: "a small handful of whole raw almonds",             aliases: ["almonds", "almond", "raw almonds"] },
  { slug: "walnuts",         label: "a small handful of walnut halves",                 aliases: ["walnuts", "walnut", "walnut halves"] },
  { slug: "pecans",          label: "a small handful of pecan halves",                  aliases: ["pecans", "pecan"] },
  { slug: "pistachios",      label: "a small handful of shelled green pistachios",      aliases: ["pistachios", "pistachio"] },
  { slug: "pine-nuts",       label: "a small pile of pale pine nuts",                   aliases: ["pine nuts", "pine nut", "pignoli"] },
  { slug: "cashews",         label: "a small handful of raw cashews",                   aliases: ["cashews", "cashew"] },
  { slug: "hazelnuts",       label: "a small handful of whole hazelnuts",               aliases: ["hazelnuts", "hazelnut", "filberts"] },
  { slug: "sesame-seeds",    label: "a small pile of pale sesame seeds",                aliases: ["sesame seeds", "sesame seed"] },

  // ─── PRESERVED · MISC ────────────────────────────────────────────────────
  { slug: "kalamata-olives", label: "a small pile of dark kalamata olives",             aliases: ["kalamata olives", "kalamata", "olives"] },
  { slug: "capers",          label: "a small pile of brined capers",                    aliases: ["capers"] },
  { slug: "pickles",         label: "a few whole dill pickles",                         aliases: ["pickles", "dill pickles", "pickle"] },
];

const m = JSON.parse(await readFile(MANIFEST, "utf8"));
const existing = new Set(m.sprites.map((s) => s.slug));
let added = 0;
for (const entry of NEW) {
  if (existing.has(entry.slug)) continue;
  m.sprites.push(entry);
  added++;
}
await writeFile(MANIFEST, JSON.stringify(m, null, 2) + "\n");
console.log(`Added ${added} new entries (total now ${m.sprites.length}).`);
