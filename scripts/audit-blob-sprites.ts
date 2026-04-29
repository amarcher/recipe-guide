// Lists every blob under `sprites/` and `sprites/originals/` and diffs against
// the slugs in `sprites/manifest.json`. Surfaces "orphan" sprites — entries
// that exist in Blob but not in the manifest, i.e. those generated on-demand
// by `/api/sprites/discover`. Pre-pivot orphans came from Gemini
// (nano-banana) and lack transparent backgrounds; we want to regenerate them
// via OpenAI gpt-image-1.

import { list } from "@vercel/blob";
import manifest from "@/sprites/manifest.json";

type Sprite = { slug: string };
const manifestSlugs = new Set(
  (manifest.sprites as Sprite[]).map((s) => s.slug),
);

async function listAll(prefix: string) {
  const keys: Array<{ pathname: string; size: number; uploadedAt: Date; url: string }> = [];
  let cursor: string | undefined;
  do {
    const r = await list({ prefix, cursor, limit: 1000 });
    for (const b of r.blobs) {
      keys.push({
        pathname: b.pathname,
        size: b.size,
        uploadedAt: b.uploadedAt,
        url: b.url,
      });
    }
    cursor = r.cursor;
  } while (cursor);
  return keys;
}

function slugFromPathname(pathname: string): string | null {
  const m = pathname.match(/^sprites\/(?:originals\/)?(.+)\.png$/);
  return m ? m[1] : null;
}

async function main() {
  const display = await listAll("sprites/");
  // listAll("sprites/") includes both top-level and originals/. Split.
  const displayOnly = display.filter((b) => !b.pathname.startsWith("sprites/originals/"));
  const originalOnly = display.filter((b) => b.pathname.startsWith("sprites/originals/"));

  const displaySlugs = new Map<string, typeof displayOnly[number]>();
  for (const b of displayOnly) {
    const slug = slugFromPathname(b.pathname);
    if (slug) displaySlugs.set(slug, b);
  }
  const originalSlugs = new Map<string, typeof originalOnly[number]>();
  for (const b of originalOnly) {
    const slug = slugFromPathname(b.pathname);
    if (slug) originalSlugs.set(slug, b);
  }

  const orphanDisplay = [...displaySlugs.entries()]
    .filter(([slug]) => !manifestSlugs.has(slug))
    .sort((a, b) => a[0].localeCompare(b[0]));

  console.log(`Manifest sprites: ${manifestSlugs.size}`);
  console.log(`Blob display blobs: ${displaySlugs.size}`);
  console.log(`Blob original blobs: ${originalSlugs.size}`);
  console.log(`Orphan display blobs (in Blob, not in manifest): ${orphanDisplay.length}`);
  console.log("");

  for (const [slug, b] of orphanDisplay) {
    const hasOriginal = originalSlugs.has(slug);
    const uploaded = b.uploadedAt.toISOString().slice(0, 10);
    const sizeKB = Math.round(b.size / 1024);
    console.log(
      `${slug.padEnd(40)} ${uploaded}  ${String(sizeKB).padStart(4)}KB  original:${hasOriginal ? "yes" : "no "}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
