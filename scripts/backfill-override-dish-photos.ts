// Backfills `cardJson.generated_dish_image_url` onto RecipeOverride rows that
// predate the dish-photo backfill (scripts/generate-dish-photos.ts).
//
// Why this exists (the caretaker's case):
//   A RecipeOverride is a full-card snapshot frozen at fork/edit time. The
//   recipes a family bothered to SAVE AND TWEAK — Alicia renaming a step,
//   re-scaling for the kids — are exactly the ones they care about, and they're
//   the ones stuck showing the bland vignette/swatch fallback because their
//   frozen copy predates `generated_dish_image_url`. Meanwhile the parent
//   ParsedRecipe got a warm AI dish photo. This closes that gap so the recipes
//   a household loves look as appetizing as the rest of the library.
//
// Two modes:
//   (default)   dry-run — count + list what WOULD be filled, no writes
//   --apply     shallow-merge the parent's URL onto each eligible override
//
// The merge is conservative (see app/lib/dish-image-merge.ts): it only fills
// overrides that LACK a URL, copies ONLY that one field, and never clobbers
// anything else the user edited.
//
// Usage:
//   npm run backfill:override-dish-photos                 # dry-run, list candidates
//   npm run backfill:override-dish-photos -- --limit 1    # dry-run, cap the list
//   npm run backfill:override-dish-photos -- --apply      # write all eligible
//   npm run backfill:override-dish-photos -- --apply --limit 1   # write one (verify)
//   npm run backfill:override-dish-photos -- --apply <overrideId>...  # specific rows
//
// Env vars (read from .env.local via `node --env-file=.env.local`):
//   DATABASE_URL / DATABASE_URL_UNPOOLED   production Neon (already in .env.local)

import { prisma } from "@/app/lib/prisma";
import type { CookCard } from "@/app/types";
import { mergeDishImageIntoOverride } from "@/app/lib/dish-image-merge";

type Args = {
  apply: boolean;
  limit: number | null;
  ids: string[];
};

function parseArgs(argv: string[]): Args {
  const args = argv.slice(2);
  const apply = args.includes("--apply");
  const limitIdx = args.findIndex((a) => a === "--limit");
  const limit =
    limitIdx >= 0 && args[limitIdx + 1] ? parseInt(args[limitIdx + 1], 10) : null;
  const ids = args.filter((a, i) => !a.startsWith("--") && i !== limitIdx + 1);
  return { apply, limit, ids };
}

function short(url: string): string {
  return url.length > 56 ? `${url.slice(0, 53)}…` : url;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  console.log(
    `mode=${args.apply ? "APPLY" : "dry-run"}` +
      (args.limit != null ? `  limit=${args.limit}` : "") +
      (args.ids.length ? `  ids=${args.ids.join(",")}` : "")
  );

  const where = args.ids.length > 0 ? { id: { in: args.ids } } : {};
  const overrides = await prisma.recipeOverride.findMany({
    where,
    select: {
      id: true,
      parsedRecipeId: true,
      userId: true,
      familyId: true,
      cardJson: true,
      parsedRecipe: { select: { title: true, cardJson: true } },
    },
  });

  let eligible = 0;
  let alreadySet = 0;
  let parentMissing = 0;
  let filled = 0;
  let failed = 0;
  let listed = 0;

  for (const row of overrides) {
    const overrideCard = row.cardJson as unknown as CookCard;
    const parentCard = row.parsedRecipe.cardJson as unknown as CookCard;
    const result = mergeDishImageIntoOverride(overrideCard, parentCard);

    if (!result.changed) {
      if (result.reason === "override-already-set") alreadySet++;
      else parentMissing++;
      continue;
    }

    eligible++;
    const scope = row.familyId ? `family:${row.familyId}` : `user:${row.userId}`;

    if (!args.apply) {
      if (args.limit == null || listed < args.limit) {
        console.log(
          `· ${row.parsedRecipe.title.padEnd(48).slice(0, 48)} ${scope.padEnd(28).slice(0, 28)} ← ${short(result.url)}`
        );
        listed++;
      }
      continue;
    }

    if (args.limit != null && filled >= args.limit) continue;

    try {
      await prisma.recipeOverride.update({
        where: { id: row.id },
        data: { cardJson: result.card as unknown as object },
      });
      filled++;
      console.log(
        `✓ ${row.parsedRecipe.title.padEnd(48).slice(0, 48)} ${scope.padEnd(28).slice(0, 28)} ← ${short(result.url)}`
      );
    } catch (e) {
      failed++;
      console.error(`✗ ${row.id}: ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log(
    `\nScanned ${overrides.length} override(s). ` +
      `eligible=${eligible} (already-set=${alreadySet}, parent-has-no-image=${parentMissing}).`
  );
  if (args.apply) {
    console.log(`Filled ${filled}${failed ? `, failed ${failed}` : ""}.`);
  } else {
    console.log(
      `Dry-run: would fill ${eligible}. Re-run with --apply to write` +
        (args.limit != null ? ` (or drop --limit to do all).` : ".")
    );
  }

  await prisma.$disconnect();
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
