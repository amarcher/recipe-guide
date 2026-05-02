// Backfills `composedCardDraft.generated_dish_image_url` on MealCandidate
// rows. Two-pass:
//
//   Pass 1 — source_url match: if the candidate's composedCardDraft.source_url
//            matches a ParsedRecipe.sourceUrl that already has a generated dish
//            photo, reuse that URL. Free hit; no generation needed. In practice
//            most candidates use synthetic `generated://plan/…` URLs so this
//            pass mostly misses, but it's cheap to try.
//
//   Pass 2 — generate: call the local image-gen server at IMAGE_GEN_URL/dish
//            with the candidate's title, upload the result to Vercel Blob at
//            `dishes/candidate/{candidateId}.jpg`, merge URL into the
//            composedCardDraft.
//
// Modes mirror generate-dish-photos.ts:
//   (default)      dry-run — list candidates that would be generated
//   --local-only   write JPEGs to ./out/candidate-dish-photos/{id}.jpg only
//   --apply        full pipeline: source_url match OR generate, upload to Blob,
//                  update DB. Cached local JPEGs reused on --apply.
//
// Usage:
//   npm run candidate-dish-photos
//   npm run candidate-dish-photos -- --apply
//   npm run candidate-dish-photos -- --local-only --shuffle --limit 1
//   npm run candidate-dish-photos -- --apply --force <candidateId>...

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { put } from "@vercel/blob";
import { prisma } from "@/app/lib/prisma";
import type { CookCard } from "@/app/types";

const IMAGE_GEN_URL = process.env.IMAGE_GEN_URL || "http://127.0.0.1:8000";
const BLOB_PREFIX = "dishes/candidate/";
const LOCAL_DIR = join("out", "candidate-dish-photos");
const PER_CALL_DELAY_MS = 200;
const GEN_WIDTH = 1024;
const GEN_HEIGHT = 768;

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

async function preflight(apply: boolean): Promise<void> {
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

async function generateDishJpeg(title: string): Promise<Buffer> {
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
  const rows = await prisma.mealCandidate.findMany({
    where,
    select: { id: true, title: true, composedCardDraft: true },
  });

  let targets = rows.filter((r) => {
    const card = r.composedCardDraft as unknown as CookCard | null;
    if (args.force) return true;
    return !card?.generated_dish_image_url;
  });
  if (args.shuffle) {
    for (let i = targets.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [targets[i], targets[j]] = [targets[j], targets[i]];
    }
  }
  if (args.limit != null) targets = targets.slice(0, args.limit);

  console.log(
    `targets: ${targets.length} (of ${rows.length} candidates total${
      args.force ? "" : "; rest already have a photo"
    })`
  );

  let made = 0;
  let reused = 0;
  let failed = 0;
  let wouldReuse = 0;
  let wouldGenerate = 0;

  for (const row of targets) {
    const card = row.composedCardDraft as unknown as CookCard | null;
    if (!card) {
      failed++;
      console.log(`· ${row.title.padEnd(60).slice(0, 60)} FAIL no composedCardDraft`);
      continue;
    }
    process.stdout.write(`· ${row.title.padEnd(60).slice(0, 60)} `);

    if (!generate) {
      // Pass-1 lookup is free even in dry-run — it tells us how many would
      // be reuse vs fresh-generate.
      const match = card.source_url
        ? await prisma.parsedRecipe.findFirst({
            where: { sourceUrl: card.source_url },
            select: { cardJson: true },
          })
        : null;
      const matchUrl =
        (match?.cardJson as unknown as CookCard | null)
          ?.generated_dish_image_url ?? null;
      if (matchUrl) {
        wouldReuse++;
        console.log("would reuse from ParsedRecipe");
      } else {
        wouldGenerate++;
        console.log("would generate fresh");
      }
      continue;
    }

    try {
      // Pass 1 — try source_url match against an existing ParsedRecipe.
      let url: string | null = null;
      if (card.source_url) {
        const match = await prisma.parsedRecipe.findFirst({
          where: { sourceUrl: card.source_url },
          select: { cardJson: true },
        });
        url =
          (match?.cardJson as unknown as CookCard | null)
            ?.generated_dish_image_url ?? null;
      }

      if (url) {
        // Free hit — no generation, no Blob upload.
        const nextCard: CookCard = { ...card, generated_dish_image_url: url };
        if (args.apply) {
          await prisma.mealCandidate.update({
            where: { id: row.id },
            data: { composedCardDraft: nextCard as unknown as object },
          });
        }
        reused++;
        console.log(`reused ${url}`);
        continue;
      }

      // Pass 2 — generate fresh.
      const localPath = join(LOCAL_DIR, `${row.id}.jpg`);
      let jpeg: Buffer;
      let cached = false;
      try {
        await stat(localPath);
        jpeg = await readFile(localPath);
        cached = true;
      } catch {
        jpeg = await generateDishJpeg(card.title);
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
      await prisma.mealCandidate.update({
        where: { id: row.id },
        data: { composedCardDraft: nextCard as unknown as object },
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

  if (generate) {
    console.log(`\nDone. generated=${made} reused=${reused} failed=${failed}`);
  } else {
    console.log(
      `\nDone. would-generate=${wouldGenerate} would-reuse=${wouldReuse} (total ${targets.length})`
    );
  }
  await prisma.$disconnect();
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
