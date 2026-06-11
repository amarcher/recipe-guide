// The ONE deletion path for the abandoned-pivot sweep. Both callers — the
// Vercel cron route (app/api/cron/pivot-sweep) and the manual script
// (scripts/pivot-sweep.ts) — go through runPivotSweep, so what the dry-run
// lists is exactly what an apply deletes, and the filter can never fork
// between the two. Predicate pieces live Prisma-free in ./sweep; this module
// is the DB boundary that composes them with the Prisma-only bits
// (Prisma.DbNull for "pivotMeta is set").

import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/app/lib/prisma";
import {
  abandonedPivotScalarWhere,
  pivotActivityGuardWhere,
} from "@/app/lib/pivot/sweep";

export type StalePivotRow = {
  id: string;
  userId: string;
  savedAt: Date;
  pivotMeta: unknown;
  pivotedFromSavedRecipeId: string | null;
};

export type PivotSweepResult = {
  stale: StalePivotRow[];
  swept: number;
};

export async function runPivotSweep(opts: {
  apply: boolean;
  now?: Date;
}): Promise<PivotSweepResult> {
  const now = opts.now ?? new Date();
  const where: Prisma.SavedRecipeWhereInput = {
    ...abandonedPivotScalarWhere(now),
    ...pivotActivityGuardWhere(now),
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

  if (!opts.apply || stale.length === 0) {
    return { stale, swept: 0 };
  }

  // Delete by the ids just listed (not by re-running the filter) so the
  // report and the deletion can never diverge, even if rows change between
  // the two queries.
  const { count } = await prisma.savedRecipe.deleteMany({
    where: { id: { in: stale.map((r) => r.id) } },
  });
  return { stale, swept: count };
}
