#!/usr/bin/env node
// Generate ingredient sprite PNGs from sprites/manifest.json.
//
// Provider is selected by SPRITE_PROVIDER (default "openai"):
//   openai → OpenAI gpt-image-1 with `background: "transparent"`. New default
//            after roadmap item 1.13. Sprites land with clean alpha so still-
//            life compositions feel like ingredients on paper, not card
//            collages on a wash. Uses `style_prompt_transparent` from the
//            manifest. Per-sprite `compose: "carafe"|"puddle"` injects a
//            fragment for translucent ingredients (oil, broth, vinegar).
//   gemini → legacy Gemini 2.5 Flash Image, white-background photoreal. Kept
//            for one-off regenerations / rollback. Uses `style_prompt`.
//
// Stores TWO variants in Vercel Blob per sprite:
//   sprites/originals/<slug>.png  — original PNG straight from the model
//   sprites/<slug>.png            — 512px display variant served by the app
//
// After upload, Blob URLs are written back into sprites/manifest.json
// (`url`, `original_url`).
//
// Usage:
//   OPENAI_API_KEY=... BLOB_READ_WRITE_TOKEN=... node scripts/generate-sprites.mjs           # only missing
//   ...                                          node scripts/generate-sprites.mjs --force   # regenerate all
//   ...                                          node scripts/generate-sprites.mjs olive-oil # one slug
//   SPRITE_PROVIDER=gemini GEMINI_API_KEY=... ... node scripts/generate-sprites.mjs           # legacy

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { argv, env, exit } from "node:process";
import sharp from "sharp";
import { put, head } from "@vercel/blob";

const TARGET_PX = 512;
const BLOB_DISPLAY_PREFIX = "sprites/";
const BLOB_ORIGINAL_PREFIX = "sprites/originals/";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const MANIFEST = join(ROOT, "sprites", "manifest.json");

const PROVIDER = (env.SPRITE_PROVIDER || "openai").toLowerCase();
if (PROVIDER !== "openai" && PROVIDER !== "gemini") {
  console.error(`ERROR: SPRITE_PROVIDER="${PROVIDER}" not recognized (use "openai" or "gemini").`);
  exit(1);
}

const blobToken = env.BLOB_READ_WRITE_TOKEN;
if (!blobToken) {
  console.error(
    "ERROR: set BLOB_READ_WRITE_TOKEN. Pull it via `vercel env pull .env.local`."
  );
  exit(1);
}

const args = argv.slice(2);
const force = args.includes("--force");
const limitIdx = args.findIndex((a) => a === "--limit");
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;
const onlySlugs = args.filter((a, i) => !a.startsWith("--") && i !== limitIdx + 1);

const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
let targets = manifest.sprites.filter((s) =>
  onlySlugs.length === 0 ? true : onlySlugs.includes(s.slug)
);
if (Number.isFinite(limit) && !force) {
  targets = targets.filter((s) => !s.url).slice(0, limit);
}

function buildPrompt(sprite) {
  const isTransparent = PROVIDER === "openai";
  const base = isTransparent
    ? manifest.style_prompt_transparent || manifest.style_prompt
    : manifest.style_prompt;
  let prompt = base.replace("{label}", sprite.label);
  if (isTransparent && sprite.compose && manifest.compose_fragments?.[sprite.compose]) {
    const fragment = manifest.compose_fragments[sprite.compose].replace(
      "{label}",
      sprite.label,
    );
    prompt += " " + fragment;
  }
  return prompt;
}

async function blobExists(pathname) {
  try {
    const meta = await head(pathname, { token: blobToken });
    return meta.url;
  } catch {
    return null;
  }
}

async function uploadToBlob(pathname, buf) {
  const blob = await put(pathname, buf, {
    access: "public",
    token: blobToken,
    addRandomSuffix: false,
    contentType: "image/png",
    allowOverwrite: true,
  });
  return blob.url;
}

// ─── Provider: Gemini (legacy) ──────────────────────────────────────────────
const GEMINI_MODEL = env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

async function callGemini(prompt) {
  const apiKey = env.GEMINI_API_KEY || env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "SPRITE_PROVIDER=gemini but GEMINI_API_KEY is not set. Get one at https://aistudio.google.com/apikey",
    );
  }
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
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
  }
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const imgPart = parts.find((p) => p.inlineData?.data || p.inline_data?.data);
  if (!imgPart) {
    const blockReason = data?.promptFeedback?.blockReason;
    throw new Error(
      `No image in response${blockReason ? ` (blocked: ${blockReason})` : ""}: ${JSON.stringify(data).slice(0, 400)}`,
    );
  }
  const b64 = imgPart.inlineData?.data ?? imgPart.inline_data?.data;
  return Buffer.from(b64, "base64");
}

// ─── Provider: OpenAI gpt-image-1 (new default) ─────────────────────────────
const OPENAI_MODEL = env.OPENAI_IMAGE_MODEL || "gpt-image-1";
const OPENAI_ENDPOINT = "https://api.openai.com/v1/images/generations";

async function callOpenAI(prompt) {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "SPRITE_PROVIDER=openai but OPENAI_API_KEY is not set. Add it to .env.local and your Vercel project, or set SPRITE_PROVIDER=gemini for the legacy path.",
    );
  }
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
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
  }
  const data = await res.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error(`No b64_json in response: ${JSON.stringify(data).slice(0, 400)}`);
  }
  return Buffer.from(b64, "base64");
}

async function callProvider(prompt) {
  return PROVIDER === "openai" ? callOpenAI(prompt) : callGemini(prompt);
}

async function processSlug(sprite) {
  const displayPath = `${BLOB_DISPLAY_PREFIX}${sprite.slug}.png`;
  const originalPath = `${BLOB_ORIGINAL_PREFIX}${sprite.slug}.png`;

  if (!force) {
    const existingDisplay = await blobExists(displayPath);
    const existingOriginal = await blobExists(originalPath);
    if (existingDisplay && existingOriginal) {
      sprite.url = existingDisplay;
      sprite.original_url = existingOriginal;
      return { status: "skip" };
    }
  }

  const prompt = buildPrompt(sprite);
  const original = await callProvider(prompt);
  const display = await sharp(original)
    .resize(TARGET_PX, TARGET_PX, { fit: "inside" })
    .png({ compressionLevel: 9 })
    .toBuffer();

  const [originalUrl, displayUrl] = await Promise.all([
    uploadToBlob(originalPath, original),
    uploadToBlob(displayPath, display),
  ]);

  sprite.url = displayUrl;
  sprite.original_url = originalUrl;
  return { status: "made", originalBytes: original.length, displayBytes: display.length };
}

async function persistManifest() {
  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
}

console.log(`provider=${PROVIDER}  targets=${targets.length}  force=${force}`);

let made = 0;
let skipped = 0;
let failed = 0;

for (const sprite of targets) {
  process.stdout.write(`· ${sprite.slug.padEnd(22)} `);
  try {
    const r = await processSlug(sprite);
    if (r.status === "skip") {
      skipped++;
      console.log("skip (exists)");
    } else {
      made++;
      const sizeMsg = `${(r.originalBytes / 1024) | 0}K orig → ${(r.displayBytes / 1024) | 0}K display`;
      console.log(`ok   ${sizeMsg}`);
      await new Promise((r) => setTimeout(r, 600));
    }
    await persistManifest();
  } catch (e) {
    failed++;
    console.log(`FAIL\n   ${e.message}`);
  }
}

console.log(
  `\nDone. provider=${PROVIDER} made=${made} skipped=${skipped} failed=${failed} total=${targets.length}`,
);
if (failed > 0) exit(1);
