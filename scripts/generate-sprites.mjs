#!/usr/bin/env node
// Generates ingredient sprite PNGs from sprites/manifest.json using Gemini 2.5
// Flash Image (codename "Nano Banana") via the Generative Language REST API.
//
// Usage:
//   GEMINI_API_KEY=...  node scripts/generate-sprites.mjs           # only missing
//   GEMINI_API_KEY=...  node scripts/generate-sprites.mjs --force   # regenerate all
//   GEMINI_API_KEY=...  node scripts/generate-sprites.mjs olive-oil # one slug
//
// Output: public/sprites/<slug>.png

import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { argv, env, exit } from "node:process";
import sharp from "sharp";

const TARGET_PX = 512;

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const MANIFEST = join(ROOT, "sprites", "manifest.json");
const OUT_DIR = join(ROOT, "public", "sprites");

const MODEL = env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const apiKey = env.GEMINI_API_KEY || env.GOOGLE_API_KEY;
if (!apiKey) {
  console.error(
    "ERROR: set GEMINI_API_KEY (or GOOGLE_API_KEY). Get one at https://aistudio.google.com/apikey"
  );
  exit(1);
}

const args = argv.slice(2);
const force = args.includes("--force");
const onlySlugs = args.filter((a) => !a.startsWith("--"));

const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
await mkdir(OUT_DIR, { recursive: true });

const targets = manifest.sprites.filter((s) =>
  onlySlugs.length === 0 ? true : onlySlugs.includes(s.slug)
);

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

function buildPrompt(label) {
  return manifest.style_prompt.replace("{label}", label);
}

async function generate(slug, label) {
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
  const raw = Buffer.from(b64, "base64");
  const resized = await sharp(raw)
    .resize(TARGET_PX, TARGET_PX, { fit: "inside" })
    .png({ compressionLevel: 9 })
    .toBuffer();
  const out = join(OUT_DIR, `${slug}.png`);
  await writeFile(out, resized);
  return out;
}

let made = 0;
let skipped = 0;
let failed = 0;

for (const sprite of targets) {
  const out = join(OUT_DIR, `${sprite.slug}.png`);
  if (!force && (await exists(out))) {
    skipped++;
    console.log(`· skip   ${sprite.slug} (exists)`);
    continue;
  }
  process.stdout.write(`… make   ${sprite.slug.padEnd(22)} `);
  try {
    await generate(sprite.slug, sprite.label);
    made++;
    console.log("ok");
    // gentle rate limiting
    await new Promise((r) => setTimeout(r, 600));
  } catch (e) {
    failed++;
    console.log(`FAIL\n   ${e.message}`);
  }
}

console.log(
  `\nDone. made=${made} skipped=${skipped} failed=${failed} total=${targets.length}`
);
if (failed > 0) exit(1);
