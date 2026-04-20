import { NextRequest, NextResponse } from "next/server";
import { put, head } from "@vercel/blob";
import sharp from "sharp";
import manifest from "@/sprites/manifest.json";

export const runtime = "nodejs";
export const maxDuration = 120;

const MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const MAX_PER_REQUEST = 20;
const BLOB_PREFIX = "sprites/";
const TARGET_PX = 512;

type Manifest = {
  style_prompt: string;
  sprites: Array<{ slug: string; label: string; aliases: string[] }>;
};
const M = manifest as Manifest;

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[(),.]/g, " ")
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

async function generateImage(label: string, apiKey: string): Promise<Buffer | null> {
  const prompt = M.style_prompt.replace("{label}", label);
  const res = await fetch(ENDPOINT, {
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
  const apiKey = process.env.GEMINI_API_KEY;
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY not set on the server." },
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

  await Promise.all(
    cleaned.map(async (name) => {
      // 1) Local manifest match → instant /sprites/{slug}.png
      const manifestSlug = findExistingSlug(name);
      if (manifestSlug) {
        results[name] = { url: `/sprites/${manifestSlug}.png`, slug: manifestSlug };
        return;
      }

      const slug = computeSlug(name);
      if (!slug) {
        results[name] = { error: "could not derive slug" };
        return;
      }
      const pathname = `${BLOB_PREFIX}${slug}.png`;

      // 2) Already in Blob → return cached URL (no model call, no charge)
      if (blobToken) {
        const existing = await existingBlobUrl(pathname, blobToken);
        if (existing) {
          results[name] = { url: existing, slug };
          return;
        }
      }

      // 3) Generate via Gemini, then resize to TARGET_PX before persisting.
      try {
        const raw = await generateImage(name, apiKey);
        if (!raw) {
          results[name] = { error: "no image returned" };
          return;
        }
        const buf = await sharp(raw)
          .resize(TARGET_PX, TARGET_PX, { fit: "inside" })
          .png({ compressionLevel: 9 })
          .toBuffer();
        if (blobToken) {
          const blob = await put(pathname, buf, {
            access: "public",
            token: blobToken,
            addRandomSuffix: false,
            contentType: "image/png",
            allowOverwrite: true,
          });
          results[name] = { url: blob.url, slug };
        } else {
          results[name] = {
            url: `data:image/png;base64,${buf.toString("base64")}`,
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

  return NextResponse.json({ results });
}
