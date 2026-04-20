#!/usr/bin/env node
// Generate ingredient sprite PNGs from sprites/manifest.json using Gemini 2.5
// Flash Image (codename "Nano Banana") via the Generative Language REST API.
//
// Stores TWO variants in Vercel Blob per sprite:
//   sprites/originals/<slug>.png  — original 1024-ish PNG straight from Gemini
//                                   (preserved for future high-res use)
//   sprites/<slug>.png            — 512px display variant served by the app
//
// After upload, the resolved Blob URLs are written back into
// sprites/manifest.json (`url`, `original_url`). The app reads URLs from the
// manifest — there is no /public/sprites/ folder anymore.
//
// Usage:
//   GEMINI_API_KEY=... BLOB_READ_WRITE_TOKEN=... node scripts/generate-sprites.mjs           # only missing
//   ...                                          node scripts/generate-sprites.mjs --force   # regenerate all
//   ...                                          node scripts/generate-sprites.mjs olive-oil # one slug

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

const MODEL = env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const apiKey = env.GEMINI_API_KEY || env.GOOGLE_API_KEY;
if (!apiKey) {
  console.error(
    "ERROR: set GEMINI_API_KEY (or GOOGLE_API_KEY). Get one at https://aistudio.google.com/apikey"
  );
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
const onlySlugs = args.filter((a) => !a.startsWith("--"));

const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
const targets = manifest.sprites.filter((s) =>
  onlySlugs.length === 0 ? true : onlySlugs.includes(s.slug)
);

function buildPrompt(label) {
  return manifest.style_prompt.replace("{label}", label);
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

async function callGemini(label) {
  const prompt = buildPrompt(label);
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
      `No image in response${blockReason ? ` (blocked: ${blockReason})` : ""}: ${JSON.stringify(data).slice(0, 400)}`
    );
  }
  const b64 = imgPart.inlineData?.data ?? imgPart.inline_data?.data;
  return Buffer.from(b64, "base64");
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

  const original = await callGemini(sprite.label);
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
      await new Promise((r) => setTimeout(r, 600)); // gentle rate limit
    }
    // Persist after every entry so a crash doesn't lose progress.
    await persistManifest();
  } catch (e) {
    failed++;
    console.log(`FAIL\n   ${e.message}`);
  }
}

console.log(
  `\nDone. made=${made} skipped=${skipped} failed=${failed} total=${targets.length}`
);
if (failed > 0) exit(1);
