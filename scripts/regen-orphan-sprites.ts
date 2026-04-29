// Batch-regenerate orphan sprites (those not in `sprites/manifest.json`)
// using OpenAI gpt-image-1 with the transparent-background prompts now in
// `manifest.json` (`style_prompt_transparent` + `compose_fragments`).
// Each sprite gets a `compose` annotation tuned to whether it's a paste/
// powder (puddle), pourable liquid (carafe), or solid (none).
//
// Idempotent: safe to re-run a single slug, overwrites existing blobs.
//
// Usage:
//   node --env-file=.env.local --import tsx scripts/regen-orphan-sprites.ts
//   node ... regen-orphan-sprites.ts <slug>          # one slug
//   node ... regen-orphan-sprites.ts --dry-run       # print what would run

import { put } from "@vercel/blob";
import sharp from "sharp";
import manifest from "@/sprites/manifest.json";

const OPENAI_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
const OPENAI_ENDPOINT = "https://api.openai.com/v1/images/generations";

type Compose = "puddle" | "carafe" | undefined;
type Job = { slug: string; label: string; compose: Compose };

// 22 remaining orphans (harissa-paste already piloted).
const JOBS: Job[] = [
  { slug: "ancho-powder", label: "ancho chile powder", compose: "puddle" },
  { slug: "bean", label: "a single dried pinto bean", compose: undefined },
  { slug: "bone-in-pork-chop", label: "a raw bone-in pork chop", compose: undefined },
  { slug: "cheese-tortellini", label: "a small handful of cheese tortellini", compose: undefined },
  { slug: "chorizo", label: "a fresh chorizo sausage link", compose: undefined },
  { slug: "five-cheese-ravioli", label: "a small handful of five-cheese ravioli", compose: undefined },
  { slug: "fresh-herbs", label: "a small bundle of fresh mixed herbs (parsley, thyme, dill)", compose: undefined },
  { slug: "furikake", label: "Japanese furikake seasoning (sesame, seaweed, salt flakes)", compose: "puddle" },
  { slug: "habanero-chile", label: "a single fresh orange habanero chile pepper", compose: undefined },
  { slug: "light-brown-sugar", label: "light brown sugar", compose: "puddle" },
  { slug: "mirin", label: "mirin (Japanese sweet rice wine)", compose: "carafe" },
  { slug: "mixed-greens", label: "a small handful of mixed salad greens", compose: undefined },
  { slug: "nori", label: "a stack of dried nori sheets", compose: undefined },
  { slug: "pizza-sauce", label: "pizza sauce", compose: "puddle" },
  { slug: "radishes", label: "a small bunch of fresh red radishes with greens", compose: undefined },
  { slug: "salad-greens", label: "a small handful of mixed salad greens", compose: undefined },
  { slug: "salsa", label: "fresh tomato salsa", compose: "puddle" },
  { slug: "shredded-cheese", label: "a small mound of shredded cheddar cheese", compose: undefined },
  { slug: "spam", label: "a slab of cooked Spam luncheon meat", compose: undefined },
  { slug: "store-bought-pizza-dough", label: "a ball of raw pizza dough", compose: undefined },
  { slug: "tahini", label: "tahini (sesame paste)", compose: "puddle" },
  { slug: "tomatillo-salsa-verde", label: "tomatillo salsa verde", compose: "puddle" },
];

type Manifest = {
  style_prompt_transparent?: string;
  compose_fragments?: Record<string, string>;
};
const M = manifest as Manifest;

function buildPrompt(label: string, compose: Compose): string {
  const base = M.style_prompt_transparent;
  if (!base) throw new Error("manifest missing style_prompt_transparent");
  let p = base.replace("{label}", label);
  if (compose && M.compose_fragments?.[compose]) {
    p += " " + M.compose_fragments[compose].replace("{label}", label);
  }
  return p;
}

async function generateOpenAI(prompt: string, apiKey: string): Promise<Buffer> {
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
    throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error("no b64_json in OpenAI response");
  return Buffer.from(b64, "base64");
}

async function regen(job: Job, apiKey: string, token: string) {
  const prompt = buildPrompt(job.label, job.compose);
  const raw = await generateOpenAI(prompt, apiKey);
  const display = await sharp(raw)
    .resize(512, 512, { fit: "inside" })
    .png({ compressionLevel: 9 })
    .toBuffer();
  const [orig, disp] = await Promise.all([
    put(`sprites/originals/${job.slug}.png`, raw, {
      access: "public",
      token,
      addRandomSuffix: false,
      contentType: "image/png",
      allowOverwrite: true,
    }),
    put(`sprites/${job.slug}.png`, display, {
      access: "public",
      token,
      addRandomSuffix: false,
      contentType: "image/png",
      allowOverwrite: true,
    }),
  ]);
  return { display: disp.url, original: orig.url };
}

async function main() {
  const arg = process.argv[2];
  const dryRun = arg === "--dry-run";
  const single = !dryRun && arg ? arg : null;
  const jobs = single ? JOBS.filter((j) => j.slug === single) : JOBS;
  if (single && jobs.length === 0) {
    console.error(`unknown slug: ${single}`);
    process.exit(1);
  }
  if (dryRun) {
    for (const j of JOBS) {
      console.log(
        `${j.slug.padEnd(28)} ${j.compose ?? "bare".padEnd(6)}  "${j.label}"`,
      );
    }
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");
  if (!token) throw new Error("BLOB_READ_WRITE_TOKEN not set");

  // Run in batches of 4 — keeps OpenAI happy and lets a single failure not
  // poison the whole batch.
  const BATCH = 4;
  const results: Array<{ slug: string; ok: boolean; err?: string }> = [];
  for (let i = 0; i < jobs.length; i += BATCH) {
    const chunk = jobs.slice(i, i + BATCH);
    console.log(
      `\nBatch ${Math.floor(i / BATCH) + 1}: ${chunk.map((j) => j.slug).join(", ")}`,
    );
    const settled = await Promise.allSettled(
      chunk.map(async (job) => {
        const t0 = Date.now();
        const r = await regen(job, apiKey, token);
        const dt = ((Date.now() - t0) / 1000).toFixed(1);
        console.log(`  ✔ ${job.slug.padEnd(28)} (${dt}s)`);
        return { slug: job.slug, ...r };
      }),
    );
    for (let k = 0; k < settled.length; k++) {
      const s = settled[k];
      const slug = chunk[k].slug;
      if (s.status === "fulfilled") {
        results.push({ slug, ok: true });
      } else {
        const err = s.reason instanceof Error ? s.reason.message : String(s.reason);
        console.log(`  ✘ ${slug.padEnd(28)} ${err}`);
        results.push({ slug, ok: false, err });
      }
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\nDone. ${results.length - failed.length}/${results.length} succeeded.`);
  if (failed.length) {
    console.log("Failed slugs:");
    for (const f of failed) console.log(`  - ${f.slug}: ${f.err}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
