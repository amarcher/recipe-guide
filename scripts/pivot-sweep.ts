// Manual abandoned-pivot sweep. The same job the Vercel cron runs, but for a
// human at a terminal — `npm run pivot-sweep`.
//
// Dry-run by default: it counts and lists what *would* be swept so you can
// eyeball it before anything is deleted. Pass `--apply` to actually delete.
// This mirrors the dry-run-first convention of the other data scripts
// (backfill-taglines, generate-dish-photos).
//
// Predicate is shared with the cron route via app/lib/pivot/sweep.ts — there
// is exactly one definition of "abandoned", so the script and the scheduled
// job can never drift apart.

import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/app/lib/prisma";
import {
  abandonedPivotScalarWhere,
  PIVOT_SWEEP_WINDOW_HOURS,
} from "@/app/lib/pivot/sweep";

type PivotMetaish = { problemText?: unknown } | null;

function problemTextOf(meta: unknown): string {
  if (meta && typeof meta === "object" && "problemText" in meta) {
    const t = (meta as PivotMetaish)?.problemText;
    if (typeof t === "string" && t.trim()) return t.trim();
  }
  return "(no problem text)";
}

function hoursAgo(d: Date, now: Date): number {
  return Math.round((now.getTime() - d.getTime()) / (60 * 60 * 1000));
}

async function main() {
  const apply = process.argv.includes("--apply");
  const now = new Date();
  const where: Prisma.SavedRecipeWhereInput = {
    ...abandonedPivotScalarWhere(now),
    pivotMeta: { not: Prisma.DbNull },
  };

  const stale = await prisma.savedRecipe.findMany({
    where,
    select: {
      id: true,
      userId: true,
      savedAt: true,
      pivotMeta: true,
      pivotedFromSavedRecipeId: true,
    },
    orderBy: { savedAt: "asc" },
  });

  console.log(
    `Abandoned-pivot sweep — window ${PIVOT_SWEEP_WINDOW_HOURS}h, ${
      apply ? "APPLY" : "dry-run"
    }`
  );
  console.log(`Found ${stale.length} stale pivot fork(s):\n`);
  for (const row of stale) {
    console.log(
      `  ${row.id}  user=${row.userId}  ${hoursAgo(
        row.savedAt,
        now
      )}h old  "${problemTextOf(row.pivotMeta)}"`
    );
  }

  if (!stale.length) {
    console.log("\nNothing to sweep. The library is tidy.");
    await prisma.$disconnect();
    return;
  }

  if (!apply) {
    console.log(
      `\nDry run — nothing deleted. Re-run with --apply to remove these ${stale.length} fork(s).`
    );
    await prisma.$disconnect();
    return;
  }

  const { count } = await prisma.savedRecipe.deleteMany({ where });
  console.log(`\nSwept ${count} abandoned pivot fork(s).`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
