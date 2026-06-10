// Abandoned-pivot sweep — the predicate, kept Prisma-free so vitest can
// cover it without pulling @/app/lib/prisma into the import graph.
//
// The story: a cook taps "Stuck? Adapt the recipe" mid-cook, gets a revised
// card forked into a personal-scope SavedRecipe with pivotMeta set and
// pivotKept=false. If they never circle back to keep or discard it (dinner
// happened, life happened), that half-finished fork lingers in the library
// wearing a "Pivot in progress" badge forever. This sweep gently clears the
// ones that have clearly been abandoned, so nobody opens their library a
// week later to a pile of stale "in progress" rescues they don't remember.
//
// What counts as abandoned:
//   - pivotMeta is set            → it really is a pivot fork
//   - pivotKept is false          → the cook never chose to keep it
//   - it's older than the window  → enough time has passed that it's stale
//
// Kept pivots (pivotKept=true) are permanent personal recipes and are never
// touched. Non-pivot rows (pivotMeta=null) are never touched.

// 48 hours: long enough to span a missed dinner and the next day's leftovers,
// short enough that a forgotten rescue doesn't haunt the library for a week.
export const PIVOT_SWEEP_WINDOW_HOURS = 48;

export const PIVOT_SWEEP_WINDOW_MS = PIVOT_SWEEP_WINDOW_HOURS * 60 * 60 * 1000;

// The minimal shape the predicate needs. Mirrors the relevant SavedRecipe
// columns without importing the Prisma client.
export type SweepCandidate = {
  pivotKept: boolean;
  pivotMeta: unknown;
  // Row creation time. On SavedRecipe this is the `savedAt` column (the
  // fork's birth), which for pivot rows is also when the rescue happened.
  savedAt: Date;
};

// The cutoff instant: rows born strictly before this are old enough to sweep.
export function pivotSweepCutoff(
  now: Date = new Date(),
  windowMs: number = PIVOT_SWEEP_WINDOW_MS
): Date {
  return new Date(now.getTime() - windowMs);
}

// Pure decision: should this row be swept? A single source of truth that both
// the Prisma `deleteMany` filter and the tests agree on.
export function isAbandonedPivot(
  row: SweepCandidate,
  now: Date = new Date(),
  windowMs: number = PIVOT_SWEEP_WINDOW_MS
): boolean {
  if (row.pivotKept) return false;
  if (row.pivotMeta == null) return false;
  return row.savedAt.getTime() < pivotSweepCutoff(now, windowMs).getTime();
}

// The scalar half of the SavedRecipe.deleteMany filter — everything that
// doesn't need Prisma's JSON-null sentinel. Kept Prisma-free (no imports) so
// this module stays test-loadable. The caller layers on the `pivotMeta` "is
// not null" JSON filter (which needs `Prisma.DbNull`) at the DB boundary; see
// `app/api/cron/pivot-sweep/route.ts`. Keeping the predicate, the cutoff, and
// these scalar conditions in one module means the DB filter and
// isAbandonedPivot() can never drift apart.
export function abandonedPivotScalarWhere(
  now: Date = new Date(),
  windowMs: number = PIVOT_SWEEP_WINDOW_MS
): {
  pivotKept: boolean;
  savedAt: { lt: Date };
} {
  return {
    pivotKept: false,
    savedAt: { lt: pivotSweepCutoff(now, windowMs) },
  };
}
