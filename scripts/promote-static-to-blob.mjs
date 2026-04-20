#!/usr/bin/env node
// One-time migration: upload every public/sprites/<slug>.png to Vercel Blob
// at sprites/<slug>.png and write the resulting URL into sprites/manifest.json.
// Originals (high-res 1024) for these legacy sprites no longer exist locally
// — the resize step overwrote them — so original_url is left unset. Re-run
// `npm run sprites <slug> -- --force` later to regenerate any of them at
// full resolution.

import { readFile, writeFile, readdir, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { env, exit } from "node:process";
import { put } from "@vercel/blob";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const MANIFEST = join(ROOT, "sprites", "manifest.json");
const PUBLIC_DIR = join(ROOT, "public", "sprites");

const blobToken = env.BLOB_READ_WRITE_TOKEN;
if (!blobToken) {
  console.error(
    "ERROR: set BLOB_READ_WRITE_TOKEN. Pull it via `vercel env pull .env.local`."
  );
  exit(1);
}

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(PUBLIC_DIR))) {
  console.error(`No directory at ${PUBLIC_DIR} — nothing to promote.`);
  exit(0);
}

const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
const filesInDir = (await readdir(PUBLIC_DIR)).filter((f) => f.endsWith(".png"));
const filesBySlug = new Map(filesInDir.map((f) => [f.replace(/\.png$/, ""), f]));

let uploaded = 0;
let skipped = 0;

for (const sprite of manifest.sprites) {
  const file = filesBySlug.get(sprite.slug);
  if (!file) {
    console.log(`· ${sprite.slug.padEnd(22)} (no file in public/sprites — skip)`);
    skipped++;
    continue;
  }
  const buf = await readFile(join(PUBLIC_DIR, file));
  const blob = await put(`sprites/${sprite.slug}.png`, buf, {
    access: "public",
    token: blobToken,
    addRandomSuffix: false,
    contentType: "image/png",
    allowOverwrite: true,
  });
  sprite.url = blob.url;
  uploaded++;
  console.log(`✓ ${sprite.slug.padEnd(22)} ${(buf.length / 1024) | 0}K → ${blob.url}`);
}

await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
console.log(`\nDone. uploaded=${uploaded} skipped=${skipped}`);
