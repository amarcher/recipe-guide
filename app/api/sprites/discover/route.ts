import { NextRequest, NextResponse } from "next/server";
import { put, head } from "@vercel/blob";
import sharp from "sharp";
import { neon } from "@neondatabase/serverless";
import manifest from "@/sprites/manifest.json";

const PROVIDER = (process.env.SPRITE_PROVIDER || "openai").toLowerCase();

function logSpriteUsage(count: number, slugs: string[]) {
  const dbUrl = process.env.DASHBOARD_DATABASE_URL;
  if (!dbUrl) return;
  const sql = neon(dbUrl);
  // Approximate output tokens (Gemini bills ~1290 per image; OpenAI bills
  // per call). Used for our usage rollup, not exact billing.
  const tokensOut = count * 1290;
  const model = PROVIDER === "openai" ? OPENAI_MODEL : GEMINI_MODEL;
  const service = PROVIDER === "openai" ? "openai" : "google";
  sql`INSERT INTO api_usage (project, service, endpoint, tokens_in, tokens_out, model, metadata)
    VALUES ('recipe-guide', ${service}, 'sprite', 0, ${tokensOut}, ${model}, ${JSON.stringify({ count, slugs, provider: PROVIDER })})`.catch(
    (e) => console.error("[sprites/discover] usage log failed:", e)
  );
}

export const runtime = "nodejs";
export const maxDuration = 120;

const GEMINI_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const OPENAI_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
const OPENAI_ENDPOINT = "https://api.openai.com/v1/images/generations";

const MAX_PER_REQUEST = 20;
const BLOB_DISPLAY_PREFIX = "sprites/";
const BLOB_ORIGINAL_PREFIX = "sprites/originals/";
const TARGET_PX = 512;

type Manifest = {
  style_prompt: string;
  style_prompt_transparent?: string;
  compose_fragments?: Record<string, string>;
  sprites: Array<{
    slug: string;
    label: string;
    aliases: string[];
    url?: string;
    compose?: "carafe" | "puddle";
  }>;
};
const M = manifest as Manifest;
const BY_SLUG = new Map(M.sprites.map((s) => [s.slug, s]));

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[(),.]/g, " ")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function computeSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const ALIASES = M.sprites
  .flatMap((s) => s.aliases.map((a) => ({ alias: normalize(a), slug: s.slug })))
  .sort((a, b) => b.alias.length - a.alias.length);

function findExistingSlug(name: string): string | null {
  const n = normalize(name);
  if (!n) return null;
  for (const { alias, slug } of ALIASES) {
    if (n.includes(alias)) return slug;
  }
  return null;
}

function buildPrompt(label: string, compose?: "carafe" | "puddle"): string {
  const isTransparent = PROVIDER === "openai";
  const base =
    isTransparent && M.style_prompt_transparent
      ? M.style_prompt_transparent
      : M.style_prompt;
  let prompt = base.replace("{label}", label);
  if (isTransparent && compose && M.compose_fragments?.[compose]) {
    prompt += " " + M.compose_fragments[compose].replace("{label}", label);
  }
  return prompt;
}

async function generateImageGemini(prompt: string, apiKey: string): Promise<Buffer | null> {
  const res = await fetch(GEMINI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["IMAGE"] },
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const imgPart = parts.find(
    (p: { inlineData?: { data?: string }; inline_data?: { data?: string } }) =>
      p.inlineData?.data || p.inline_data?.data
  );
  const b64 = imgPart?.inlineData?.data ?? imgPart?.inline_data?.data;
  return b64 ? Buffer.from(b64, "base64") : null;
}

async function generateImageOpenAI(prompt: string, apiKey: string): Promise<Buffer | null> {
  const res = await fetch(OPENAI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      prompt,
      size: "1024x1024",
      background: "transparent",
      n: 1,
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const b64 = data?.data?.[0]?.b64_json;
  return b64 ? Buffer.from(b64, "base64") : null;
}

async function generateImage(
  label: string,
  apiKey: string,
  compose?: "carafe" | "puddle",
): Promise<Buffer | null> {
  const prompt = buildPrompt(label, compose);
  return PROVIDER === "openai"
    ? generateImageOpenAI(prompt, apiKey)
    : generateImageGemini(prompt, apiKey);
}

// Check if a blob is already in our store. `head()` throws on 404.
async function existingBlobUrl(
  pathname: string,
  token: string
): Promise<string | null> {
  try {
    const meta = await head(pathname, { token });
    return meta.url;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const apiKey =
    PROVIDER === "openai" ? process.env.OPENAI_API_KEY : process.env.GEMINI_API_KEY;
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (!apiKey) {
    const want = PROVIDER === "openai" ? "OPENAI_API_KEY" : "GEMINI_API_KEY";
    return NextResponse.json(
      { error: `${want} not set on the server (SPRITE_PROVIDER=${PROVIDER}).` },
      { status: 500 }
    );
  }

  let names: string[];
  try {
    const body = await req.json();
    names = Array.isArray(body?.names)
      ? body.names.filter((n: unknown): n is string => typeof n === "string")
      : [];
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const cleaned = [...new Set(names.map((n) => n.trim()).filter(Boolean))].slice(
    0,
    MAX_PER_REQUEST
  );
  if (cleaned.length === 0) {
    return NextResponse.json({ results: {} });
  }

  type Result = { url?: string; slug?: string; error?: string };
  const results: Record<string, Result> = {};
  const generatedSlugs: string[] = [];

  await Promise.all(
    cleaned.map(async (name) => {
      // 1) Local manifest match → return the URL the manifest already has.
      const manifestSlug = findExistingSlug(name);
      if (manifestSlug) {
        const url = BY_SLUG.get(manifestSlug)?.url;
        if (url) {
          results[name] = { url, slug: manifestSlug };
          return;
        }
      }

      const slug = computeSlug(name);
      if (!slug) {
        results[name] = { error: "could not derive slug" };
        return;
      }
      const displayPath = `${BLOB_DISPLAY_PREFIX}${slug}.png`;
      const originalPath = `${BLOB_ORIGINAL_PREFIX}${slug}.png`;

      // 2) Already in Blob → return cached URL (no model call, no charge)
      if (blobToken) {
        const existing = await existingBlobUrl(displayPath, blobToken);
        if (existing) {
          results[name] = { url: existing, slug };
          return;
        }
      }

      // 3) Generate via the active provider. Persist BOTH the original
      //    (high-res) and a 512px display variant so we keep the original
      //    around for future high-res use.
      try {
        const raw = await generateImage(name, apiKey);
        if (!raw) {
          results[name] = { error: "no image returned" };
          return;
        }
        generatedSlugs.push(slug);
        const display = await sharp(raw)
          .resize(TARGET_PX, TARGET_PX, { fit: "inside" })
          .png({ compressionLevel: 9 })
          .toBuffer();
        if (blobToken) {
          const [, displayBlob] = await Promise.all([
            put(originalPath, raw, {
              access: "public",
              token: blobToken,
              addRandomSuffix: false,
              contentType: "image/png",
              allowOverwrite: true,
            }),
            put(displayPath, display, {
              access: "public",
              token: blobToken,
              addRandomSuffix: false,
              contentType: "image/png",
              allowOverwrite: true,
            }),
          ]);
          results[name] = { url: displayBlob.url, slug };
        } else {
          results[name] = {
            url: `data:image/png;base64,${display.toString("base64")}`,
            slug,
          };
        }
      } catch (e) {
        results[name] = {
          error: e instanceof Error ? e.message : "generation failed",
        };
      }
    })
  );

  if (generatedSlugs.length > 0) {
    logSpriteUsage(generatedSlugs.length, generatedSlugs);
  }

  return NextResponse.json({ results });
}
