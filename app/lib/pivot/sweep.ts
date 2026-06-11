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
//   - personal scope only         → familyId is null (see tombstone below)
//   - no recent activity          → no CookLog or MiseCheck touch inside the
//     window (see the activity guard below)
//
// Kept pivots (pivotKept=true) are permanent personal recipes and are never
// touched. Non-pivot rows (pivotMeta=null) are never touched.
//
// Activity guard: cook sessions live in client localStorage, so the server
// cannot see a live "someone is cooking this right now" signal. The
// server-observable proxy is recent execution-adjacent writes — a CookLog
// (cookedAt) or a MiseCheck (checkedAt) inside the sweep window means a human
// touched this fork recently, so we spare it this pass. A genuinely abandoned
// fork goes quiet and gets swept on a later run once the window has elapsed
// with no activity.
//
// TOMBSTONE — familyId scope clause: pivot forks are personal-scope by
// invariant today (the pivot endpoint always creates familyId=null rows), so
// `familyId: null` in the filter is defensive, not load-bearing. If family-
// scope pivots, recipe sharing, or gifting ever produce family-owned rows
// with pivotMeta set, this sweep deliberately refuses to touch them — a
// shared rescue or a gifted recipe must never vanish from someone else's
// library because the original cook went quiet. Revisit the predicate before
// lifting the personal-scope invariant.

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
  familyId: string | null;
  // Most recent execution-adjacent touch: max(CookLog.cookedAt,
  // MiseCheck.checkedAt) across the row, or null when neither exists.
  lastActivityAt: Date | null;
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
  if (row.familyId != null) return false;
  const cutoff = pivotSweepCutoff(now, windowMs).getTime();
  if (row.lastActivityAt != null && row.lastActivityAt.getTime() >= cutoff) {
    return false;
  }
  return row.savedAt.getTime() < cutoff;
}

// The scalar half of the SavedRecipe filter — everything that doesn't need
// Prisma's JSON-null sentinel or relation traversal. Kept Prisma-free (no
// imports) so this module stays test-loadable. The caller layers on the
// `pivotMeta` "is not null" JSON filter (which needs `Prisma.DbNull`) at the
// DB boundary; see `app/lib/pivot/sweep-run.ts`. Keeping the predicate, the
// cutoff, and these conditions in one module means the DB filter and
// isAbandonedPivot() can never drift apart.
export function abandonedPivotScalarWhere(
  now: Date = new Date(),
  windowMs: number = PIVOT_SWEEP_WINDOW_MS
): {
  pivotKept: boolean;
  familyId: null;
  savedAt: { lt: Date };
} {
  return {
    pivotKept: false,
    familyId: null,
    savedAt: { lt: pivotSweepCutoff(now, windowMs) },
  };
}

// The relation half of the filter — the DB shape of the activity guard
// (`lastActivityAt` in isAbandonedPivot). Structurally a
// Prisma.SavedRecipeWhereInput fragment, written out by hand to stay
// Prisma-free here.
export function pivotActivityGuardWhere(
  now: Date = new Date(),
  windowMs: number = PIVOT_SWEEP_WINDOW_MS
): {
  cookLogs: { none: { cookedAt: { gte: Date } } };
  miseChecks: { none: { checkedAt: { gte: Date } } };
} {
  const cutoff = pivotSweepCutoff(now, windowMs);
  return {
    cookLogs: { none: { cookedAt: { gte: cutoff } } },
    miseChecks: { none: { checkedAt: { gte: cutoff } } },
  };
}
