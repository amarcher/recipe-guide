import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { neon } from "@neondatabase/serverless";
import type { CookCard } from "@/app/types";
import { prisma } from "@/app/lib/prisma";

const MODEL = "claude-opus-4-7";

function logUsage(tokensIn: number, tokensOut: number, sourceUrl: string) {
  const dbUrl = process.env.DASHBOARD_DATABASE_URL;
  if (!dbUrl) return;
  const sql = neon(dbUrl);
  sql`INSERT INTO api_usage (project, service, endpoint, tokens_in, tokens_out, model, metadata)
    VALUES ('recipe-guide', 'anthropic', 'parse', ${tokensIn}, ${tokensOut}, ${MODEL}, ${JSON.stringify({ sourceUrl })})`.catch(
    (e) => console.error("[parse] usage log failed:", e),
  );
}

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT = `You are a precise recipe parser. You convert messy recipe webpages into a structured "recipe guide" optimized for one-screen reading while cooking.

Your job:
1. Identify the recipe (ignore ads, comments, blog preamble, video transcripts).
2. Group ingredients with the step that uses them. Many web recipes list all ingredients up top and then say "add the onions" later — re-attach each ingredient to the step where it actually goes in.
3. Each step's "ingredients" array should contain ONLY the ingredients added during that step. If an ingredient is split across steps (e.g. "half the salt"), split the quantity and put each portion in the right step.
4. Pull out temperature ("medium-high heat", "375°F"), duration ("8-10 minutes", "until golden"), and a doneness cue ("until fragrant", "until liquid is reduced by half") for each step.
5. Anything truly used everywhere or as a finishing touch (salt, pepper, garnish) goes in pantry_ingredients only if it doesn't fit cleanly in one step.
6. Keep step "headline" SHORT (3-5 words) — like a chapter title. The "action" is a TIGHT one-or-two sentence instruction (≤30 words). No fluff, no chef tips, no "you'll know it's ready when..." — that goes in doneness_cue.
7. Preserve quantities exactly as written ("1", "1/2", "1 1/2", "a pinch"). Use null for unit if it's countable ("2 onions" → quantity:"2", unit:null, item:"onion").
8. If a value is unknown, use null. Do not invent.
9. Pick exactly one "icon" per step from: flame (sear/brown/sauté/fry), soup (simmer/sauce/stew), boil (boil/blanch), oven (bake/roast/broil), knife (chop/slice/prep), wine (deglaze/add liquid), leaf (herbs/fresh garnish), mix (stir/fold/whisk/combine), salt (season/finish), rest (chill/rest/marinate/wait), serve (plate/serve), blend (blend/purée/emulsify).
10. Write a "tagline" — ONE short, evocative sentence (≤12 words) that makes someone want to cook this. Alison Roman voice: specific, a little dry, sensory. Not marketing. Good: "Pink, buttery, a little unhinged." / "Egg yolks, black pepper, the whole dance." / "The bowl you eat on the couch." Bad: "A delicious dish your family will love."

Return ONLY valid JSON matching the provided schema. No prose, no markdown.`;

const SCHEMA_HINT = `{
  "title": string,
  "tagline": string | null,         // one evocative sentence, ≤12 words
  "servings": string | null,        // e.g. "4-6 servings"
  "total_time": string | null,      // e.g. "2 hours"
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
  "prep": string | null,    // e.g. "thinly sliced", "finely chopped"
  "note": string | null     // e.g. "nothing too sweet"
}`;

async function fetchPageText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch recipe page: ${res.status} ${res.statusText}`);
  }
  const html = await res.text();
  return stripHtml(html);
}

function stripHtml(html: string): string {
  let text = html;
  text = text.replace(/<script[\s\S]*?<\/script>/gi, " ");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, " ");
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  text = text.replace(/<svg[\s\S]*?<\/svg>/gi, " ");
  text = text.replace(/<header[\s\S]*?<\/header>/gi, " ");
  text = text.replace(/<footer[\s\S]*?<\/footer>/gi, " ");
  text = text.replace(/<nav[\s\S]*?<\/nav>/gi, " ");
  text = text.replace(/<aside[\s\S]*?<\/aside>/gi, " ");
  text = text.replace(/<form[\s\S]*?<\/form>/gi, " ");
  text = text.replace(/<iframe[\s\S]*?<\/iframe>/gi, " ");
  text = text.replace(/<[^>]+>/g, " ");
  text = text.replace(/&nbsp;/g, " ");
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/\s+/g, " ").trim();
  // Cap to keep prompt small. Most recipe pages have the full recipe in well under 30k chars of text.
  const MAX = 60_000;
  if (text.length > MAX) text = text.slice(0, MAX);
  return text;
}

function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  // Strip ```json fences if present
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  // Try to find first { ... last }
  const first = candidate.indexOf("{");
  const last = candidate.lastIndexOf("}");
  if (first === -1 || last === -1) {
    throw new Error("Model did not return JSON.");
  }
  return JSON.parse(candidate.slice(first, last + 1));
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not set on the server." },
      { status: 500 }
    );
  }

  let url: string;
  try {
    const body = await req.json();
    url = String(body?.url ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!url || !/^https?:\/\//i.test(url)) {
    return NextResponse.json(
      { error: "Provide a valid http(s) URL." },
      { status: 400 }
    );
  }

  // ─── Cross-account cache lookup ─────────────────────────────────────────
  // The URL itself is the cache key. Append a query param to bust.
  try {
    const cached = await prisma.parsedRecipe.findUnique({
      where: { sourceUrl: url },
    });
    if (cached) {
      return NextResponse.json(cached.cardJson, {
        headers: { "X-Cache": "HIT" },
      });
    }
  } catch (e) {
    // DB unreachable shouldn't block parsing — log and continue to live parse.
    console.warn("ParsedRecipe cache lookup failed:", e);
  }

  let pageText: string;
  try {
    pageText = await fetchPageText(url);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown fetch error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  if (pageText.length < 200) {
    return NextResponse.json(
      { error: "Could not extract enough text from that page." },
      { status: 422 }
    );
  }

  const client = new Anthropic({ apiKey });

  const userMessage = `Source URL: ${url}

Schema (return JSON exactly matching this shape):
${SCHEMA_HINT}

Recipe page text:
"""
${pageText}
"""

Return only the JSON object.`;

  let raw: string;
  try {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });
    raw = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    logUsage(resp.usage.input_tokens, resp.usage.output_tokens, url);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown model error";
    return NextResponse.json({ error: `Model error: ${msg}` }, { status: 502 });
  }

  let parsed: CookCard;
  try {
    const obj = extractJson(raw) as CookCard;
    obj.source_url = url;
    parsed = obj;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown parse error";
    return NextResponse.json(
      { error: `Could not parse model output: ${msg}`, raw },
      { status: 502 }
    );
  }

  // Persist to the cross-account cache.
  try {
    await prisma.parsedRecipe.upsert({
      where: { sourceUrl: url },
      create: {
        sourceUrl: url,
        title: parsed.title,
        cardJson: parsed as unknown as object,
        modelUsed: MODEL,
      },
      update: {
        title: parsed.title,
        cardJson: parsed as unknown as object,
        modelUsed: MODEL,
      },
    });
  } catch (e) {
    console.warn("ParsedRecipe upsert failed:", e);
  }

  return NextResponse.json(parsed, { headers: { "X-Cache": "MISS" } });
}
