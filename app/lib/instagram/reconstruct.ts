import Anthropic from "@anthropic-ai/sdk";
import { neon } from "@neondatabase/serverless";
import type { CookCard } from "@/app/types";

const MODEL = "claude-opus-4-7";
const URL_RE = /https?:\/\/[^\s)\]}'"]+/gi;

// Domains we'll follow as "the real recipe". Social links get skipped.
const RECIPE_HOSTS = [
  "cooking.nytimes.com",
  "nytimes.com",
  "bonappetit.com",
  "epicurious.com",
  "seriouseats.com",
  "food52.com",
  "smittenkitchen.com",
  "kingarthurbaking.com",
  "kingarthurflour.com",
  "thekitchn.com",
  "bbcgoodfood.com",
  "bbc.co.uk",
  "simplyrecipes.com",
  "allrecipes.com",
  "halfbakedharvest.com",
  "pinchofyum.com",
  "minimalistbaker.com",
  "budgetbytes.com",
  "ottolenghi.co.uk",
  "davidlebovitz.com",
  "alisoneroman.com",
  "food.com",
  "cookingwithcocktailrings.com",
];

function isSocialOrJunkHost(host: string): boolean {
  return /(?:^|\.)(instagram|facebook|fb|tiktok|twitter|x|youtube|youtu\.be|reddit|pinterest|linkedin|threads|bit\.ly|t\.co|goo\.gl|lnk\.to)\./i.test(
    host
  );
}

export function extractRecipeUrl(caption: string | null | undefined): string | null {
  if (!caption) return null;
  const matches = caption.match(URL_RE);
  if (!matches) return null;

  // Prefer any URL from a known recipe host; fall back to any non-social URL.
  const scored = matches
    .map((raw) => {
      const cleaned = raw.replace(/[.,;:!?)\]}'"]+$/, "");
      try {
        const u = new URL(cleaned);
        const host = u.hostname.replace(/^www\./, "").toLowerCase();
        const isKnown = RECIPE_HOSTS.some(
          (h) => host === h || host.endsWith(`.${h}`)
        );
        const isSocial = isSocialOrJunkHost(host);
        return { url: u.toString(), host, isKnown, isSocial };
      } catch {
        return null;
      }
    })
    .filter((x): x is NonNullable<typeof x> => !!x);

  const known = scored.find((s) => s.isKnown);
  if (known) return known.url;
  const other = scored.find((s) => !s.isSocial);
  return other?.url ?? null;
}

const SYSTEM_PROMPT = `You are reconstructing a cooked home-kitchen recipe from an Instagram post. The user's account is a shared cooking diary; the image is the finished dish and the caption is their own short note about what they made.

Your job: produce the SAME JSON shape the recipe parser produces, but marked as a soft reconstruction. You are guessing. That's OK — frame ingredients and steps as the likely path, but:

- Pull what you can from the caption. Proper nouns, named techniques, and quantities in the caption are truth.
- Use the image for ingredient hints (visible herbs, vegetables, proteins, plating).
- Keep steps SHORT and few (3-6 steps). Don't invent precision you don't have. Better one step saying "Simmer until thickened, 20-25 min" than fake minute-by-minute instructions.
- For durations you aren't sure of, give a generous range or leave null.
- Write the tagline in the Alison Roman voice described below. Lean into the "from our kitchen" feel.

Alison Roman voice for the tagline: ONE short evocative sentence, ≤12 words, specific + dry + sensory. Good: "Pink, buttery, a little unhinged." Bad: "A delicious dinner."

Set provenance: "instagram-reconstructed". Title should feel like a real dish name (not "Instagram post of…").

Return ONLY valid JSON. No prose, no markdown, no code fences.`;

const SCHEMA_HINT = `{
  "title": string,
  "tagline": string | null,
  "provenance": "instagram-reconstructed",
  "servings": string | null,
  "total_time": string | null,
  "active_time": string | null,
  "equipment": string[],
  "pantry_ingredients": Ingredient[],
  "steps": [
    {
      "number": number,
      "headline": string,
      "action": string,
      "icon": "flame"|"soup"|"boil"|"oven"|"knife"|"wine"|"leaf"|"mix"|"salt"|"rest"|"serve"|"blend",
      "ingredients": Ingredient[],
      "equipment": string[],
      "temperature": string | null,
      "duration": string | null,
      "doneness_cue": string | null
    }
  ]
}

Ingredient = {
  "quantity": string | null,
  "unit": string | null,
  "item": string,
  "prep": string | null,
  "note": string | null
}`;

function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const first = candidate.indexOf("{");
  const last = candidate.lastIndexOf("}");
  if (first === -1 || last === -1) {
    throw new Error("model did not return JSON");
  }
  return JSON.parse(candidate.slice(first, last + 1));
}

function logUsage(tokensIn: number, tokensOut: number, postId: string) {
  const dbUrl = process.env.DASHBOARD_DATABASE_URL;
  if (!dbUrl) return;
  const sql = neon(dbUrl);
  sql`INSERT INTO api_usage (project, service, endpoint, tokens_in, tokens_out, model, metadata)
    VALUES ('recipe-guide', 'anthropic', 'instagram-reconstruct', ${tokensIn}, ${tokensOut}, ${MODEL}, ${JSON.stringify({ postId })})`.catch(
    (e) => console.error("[ig-reconstruct] usage log failed:", e)
  );
}

export async function reconstructFromInstagram(args: {
  postId: string;
  permalink: string;
  caption: string | null;
  imageUrl: string; // rehosted Blob URL (or original IG URL — either works for vision)
}): Promise<CookCard> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  const client = new Anthropic({ apiKey });

  const userText = `Instagram post permalink: ${args.permalink}

Caption (the cook's own note, may be short or fragmentary):
"""
${args.caption ?? "(no caption)"}
"""

Schema (match exactly):
${SCHEMA_HINT}

Return ONLY the JSON object.`;

  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 6000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "url", url: args.imageUrl } },
          { type: "text", text: userText },
        ],
      },
    ],
  });
  const raw = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  logUsage(resp.usage.input_tokens, resp.usage.output_tokens, args.postId);

  const parsed = extractJson(raw) as CookCard;
  parsed.source_url = args.permalink;
  parsed.provenance = "instagram-reconstructed";
  return parsed;
}
