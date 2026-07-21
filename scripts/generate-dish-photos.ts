// Backfills `cardJson.generated_dish_image_url` on ParsedRecipe rows by
// calling the local image-gen server (see ../../image-gen) for a food-photo
// per recipe, uploading the JPEG to Vercel Blob, and merging the URL into
// cardJson.
//
// Three modes:
//   (default)      dry-run — print what would be generated, no work done
//   --local-only   generate JPEGs to ./out/dish-photos/{id}.jpg only; no prod writes
//   --apply        generate, save locally, upload to Blob, write URL to DB
//
// Generated JPEGs always land in ./out/dish-photos/{id}.jpg as a side effect
// of generation, regardless of --apply (so you can preview before promoting).
//
// Usage:
//   npm run dish-photos                              # dry-run, list candidates
//   npm run dish-photos -- --local-only --limit 1 --shuffle   # one random preview
//   npm run dish-photos -- --local-only             # generate ALL locally (overnight)
//   npm run dish-photos -- --apply                  # actually write to prod
//   npm run dish-photos -- --apply --limit 5        # cap at 5 prod writes
//   npm run dish-photos -- --apply <id>...          # specific ParsedRecipe IDs
//   npm run dish-photos -- --apply --force          # regenerate even if already set
//
// Env vars (all read from .env.local via `node --env-file=.env.local`):
//   IMAGE_GEN_URL          default http://127.0.0.1:8000
//   BLOB_READ_WRITE_TOKEN  required if --apply (pull via `vercel env pull .env.local`)
//   DATABASE_URL_UNPOOLED  production Neon (already in .env.local)

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { put } from "@vercel/blob";
import { prisma } from "@/app/lib/prisma";
import type { CookCard } from "@/app/types";

const IMAGE_GEN_URL = process.env.IMAGE_GEN_URL || "http://127.0.0.1:8000";
const BLOB_PREFIX = "dishes/";
const LOCAL_DIR = join("out", "dish-photos");
const PER_CALL_DELAY_MS = 200;
// 4:3 landscape — natural food-photo aspect, fits MealFace tile (~2:1) and
// spread (~2:1) with only a modest top/bottom crop via `object-cover`. Square
// generations waste ~30% of pixels to crop on the dominant tile surface.
const GEN_WIDTH = 1024;
const GEN_HEIGHT = 768;
const SKIP_HERO = /^(salt|pepper|olive oil|oil|water|kosher salt|black pepper|salt and pepper|ice|ice water)$/i;

type Args = {
  apply: boolean;
  localOnly: boolean;
  force: boolean;
  shuffle: boolean;
  limit: number | null;
  ids: string[];
};

function parseArgs(argv: string[]): Args {
  const args = argv.slice(2);
  const apply = args.includes("--apply");
  const localOnly = args.includes("--local-only");
  const force = args.includes("--force");
  const shuffle = args.includes("--shuffle");
  const limitIdx = args.findIndex((a) => a === "--limit");
  const limit =
    limitIdx >= 0 && args[limitIdx + 1] ? parseInt(args[limitIdx + 1], 10) : null;
  const ids = args.filter(
    (a, i) => !a.startsWith("--") && i !== limitIdx + 1
  );
  if (apply && localOnly) {
    console.error("--apply and --local-only are mutually exclusive");
    process.exit(2);
  }
  return { apply, localOnly, force, shuffle, limit, ids };
}

// Mirror app/library/RolodexTile.heroesFromCard — keeping it inline so this
// script doesn't have to import a "use client" module.
function heroesFromCard(card: CookCard, limit = 4): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const step of card.steps) {
    for (const ing of step.ingredients) {
      const key = ing.item.trim().toLowerCase();
      if (!key || seen.has(key) || SKIP_HERO.test(ing.item)) continue;
      seen.add(key);
      out.push(ing.item);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

async function preflight(apply: boolean): Promise<void> {
  // Local image-gen server reachable?
  try {
    const r = await fetch(`${IMAGE_GEN_URL}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = (await r.json()) as { model?: string };
    console.log(`✓ image-gen server up (model=${j.model})`);
  } catch (e) {
    console.error(
      `\n✗ image-gen server not reachable at ${IMAGE_GEN_URL}.\n` +
        `  Start it with:\n` +
        `    cd ~/Programs/image-gen && uv run uvicorn server.main:app --host 127.0.0.1 --port 8000\n` +
        `  Reason: ${e instanceof Error ? e.message : e}\n`
    );
    process.exit(1);
  }

  if (apply && !process.env.BLOB_READ_WRITE_TOKEN) {
    console.error(
      "\n✗ BLOB_READ_WRITE_TOKEN not set. Pull it: `vercel env pull .env.local`\n"
    );
    process.exit(1);
  }
}

async function generateDishJpeg(title: string, heroes: string[]): Promise<Buffer> {
  // Send empty heroes intentionally. Listing ingredients ("flavored with
  // butter, sage, …") makes the model render them as raw components piled
  // alongside the dish — butter cubes, separated sage leaves, dry lentils.
  // The recipe title alone produces a coherent finished dish (sauce as
  // sauce, vegetables as cooked, etc.). `heroes` still computed above for
  // diagnostic logging in dry-run mode.
  void heroes;
  const r = await fetch(`${IMAGE_GEN_URL}/dish`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title,
      hero_ingredients: [],
      width: GEN_WIDTH,
      height: GEN_HEIGHT,
    }),
    signal: AbortSignal.timeout(300_000),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`image-gen ${r.status}: ${text.slice(0, 200)}`);
  }
  return Buffer.from(await r.arrayBuffer());
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const mode = args.apply ? "APPLY" : args.localOnly ? "LOCAL-ONLY" : "dry-run";
  console.log(
    `mode=${mode}` +
      `  force=${args.force}` +
      (args.shuffle ? "  shuffle" : "") +
      (args.limit != null ? `  limit=${args.limit}` : "") +
      (args.ids.length ? `  ids=${args.ids.join(",")}` : "")
  );

  await preflight(args.apply);
  const generate = args.apply || args.localOnly;
  if (generate) await mkdir(LOCAL_DIR, { recursive: true });

  const where = args.ids.length > 0 ? { id: { in: args.ids } } : {};
  const rows = await prisma.parsedRecipe.findMany({
    where,
    select: { id: true, sourceUrl: true, title: true, cardJson: true },
  });

  let targets = rows.filter((r) => {
    const card = r.cardJson as unknown as CookCard;
    if (args.force) return true;
    return !card?.generated_dish_image_url;
  });
  // Skip rows with no real recipe content — articles, link aggregations,
  // empty drafts. The model will produce a generic plate-of-food otherwise.
  targets = targets.filter((r) => {
    const card = r.cardJson as unknown as CookCard;
    return card?.steps?.length > 0;
  });
  if (args.shuffle) {
    for (let i = targets.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [targets[i], targets[j]] = [targets[j], targets[i]];
    }
  }
  if (args.limit != null) targets = targets.slice(0, args.limit);

  console.log(
    `targets: ${targets.length} (of ${rows.length} total parsed recipes${
      args.force ? "" : "; rest already have a photo or no steps"
    })`
  );

  let made = 0;
  let failed = 0;
  for (const row of targets) {
    const card = row.cardJson as unknown as CookCard;
    const heroes = heroesFromCard(card);
    process.stdout.write(`· ${row.title.padEnd(60).slice(0, 60)} `);

    if (!generate) {
      console.log(`would gen w/ heroes=[${heroes.join(", ")}]`);
      continue;
    }

    try {
      const localPath = join(LOCAL_DIR, `${row.id}.jpg`);

      // Reuse cached bytes when present — preserves whatever the user
      // reviewed locally. Caller can pass --force to regenerate from scratch.
      let jpeg: Buffer | undefined;
      if (!args.force) {
        try {
          jpeg = await readFile(localPath);
        } catch {}
      }
      const cached = jpeg !== undefined;
      if (!jpeg) {
        jpeg = await generateDishJpeg(card.title, heroes);
        await writeFile(localPath, jpeg);
      }

      if (args.localOnly) {
        made++;
        console.log(
          `${cached ? "cached" : "local"} ${(jpeg.length / 1024) | 0}K → ${localPath}`
        );
        if (!cached) await new Promise((res) => setTimeout(res, PER_CALL_DELAY_MS));
        continue;
      }

      const blobPath = `${BLOB_PREFIX}${row.id}.jpg`;
      const blob = await put(blobPath, jpeg, {
        access: "public",
        addRandomSuffix: false,
        contentType: "image/jpeg",
        allowOverwrite: true,
      });
      const nextCard: CookCard = {
        ...card,
        generated_dish_image_url: blob.url,
      };
      await prisma.parsedRecipe.update({
        where: { id: row.id },
        data: { cardJson: nextCard as unknown as object },
      });
      made++;
      console.log(
        `${cached ? "uploaded-cached" : "ok"} ${(jpeg.length / 1024) | 0}K → ${blob.url}`
      );
      if (!cached) await new Promise((res) => setTimeout(res, PER_CALL_DELAY_MS));
    } catch (e) {
      failed++;
      console.log(`FAIL ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log(
    `\nDone. ${generate ? "generated" : "would-generate"}=${
      generate ? made : targets.length
    } failed=${failed}`
  );
  await prisma.$disconnect();
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
