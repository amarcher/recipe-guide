import { describe, it, expect } from "vitest";
import {
  PIVOT_SWEEP_WINDOW_HOURS,
  PIVOT_SWEEP_WINDOW_MS,
  pivotSweepCutoff,
  isAbandonedPivot,
  abandonedPivotScalarWhere,
  pivotActivityGuardWhere,
  type SweepCandidate,
} from "./sweep";

const NOW = new Date("2026-06-10T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;

// Helper: a SavedRecipe-shaped pivot row born `agoHours` before NOW.
function row(
  agoHours: number,
  overrides: Partial<SweepCandidate> = {}
): SweepCandidate {
  return {
    pivotKept: false,
    pivotMeta: { problemText: "added too much paste", createdAt: 0 },
    savedAt: new Date(NOW.getTime() - agoHours * HOUR),
    familyId: null,
    lastActivityAt: null,
    ...overrides,
  };
}

function hoursBeforeNow(agoHours: number): Date {
  return new Date(NOW.getTime() - agoHours * HOUR);
}

describe("window constants", () => {
  it("is a 48-hour window", () => {
    expect(PIVOT_SWEEP_WINDOW_HOURS).toBe(48);
    expect(PIVOT_SWEEP_WINDOW_MS).toBe(48 * HOUR);
  });
});

describe("pivotSweepCutoff", () => {
  it("is exactly the window before now", () => {
    expect(pivotSweepCutoff(NOW).toISOString()).toBe(
      "2026-06-08T12:00:00.000Z"
    );
  });
});

describe("isAbandonedPivot", () => {
  it("sweeps a backdated, unkept pivot (older than 48h)", () => {
    expect(isAbandonedPivot(row(72), NOW)).toBe(true);
  });

  it("spares a fresh pivot (younger than 48h)", () => {
    expect(isAbandonedPivot(row(1), NOW)).toBe(false);
  });

  it("spares a pivot at exactly the 48h boundary (strictly-less-than)", () => {
    expect(isAbandonedPivot(row(48), NOW)).toBe(false);
  });

  it("sweeps a pivot just past the boundary", () => {
    const justPast: SweepCandidate = {
      ...row(0),
      savedAt: new Date(NOW.getTime() - PIVOT_SWEEP_WINDOW_MS - 1),
    };
    expect(isAbandonedPivot(justPast, NOW)).toBe(true);
  });

  it("never sweeps a kept pivot, however old", () => {
    expect(isAbandonedPivot(row(1000, { pivotKept: true }), NOW)).toBe(false);
  });

  it("never sweeps a non-pivot row (pivotMeta null), however old", () => {
    expect(isAbandonedPivot(row(1000, { pivotMeta: null }), NOW)).toBe(false);
  });

  it("treats undefined pivotMeta as a non-pivot row", () => {
    expect(isAbandonedPivot(row(1000, { pivotMeta: undefined }), NOW)).toBe(
      false
    );
  });

  it("never sweeps a family-scope row, however stale (tombstone guard)", () => {
    expect(isAbandonedPivot(row(1000, { familyId: "fam_1" }), NOW)).toBe(
      false
    );
  });

  it("spares an old pivot with recent execution activity", () => {
    expect(
      isAbandonedPivot(row(72, { lastActivityAt: hoursBeforeNow(2) }), NOW)
    ).toBe(false);
  });

  it("spares activity at exactly the cutoff (gte)", () => {
    expect(
      isAbandonedPivot(row(72, { lastActivityAt: pivotSweepCutoff(NOW) }), NOW)
    ).toBe(false);
  });

  it("sweeps an old pivot whose only activity predates the window", () => {
    expect(
      isAbandonedPivot(row(200, { lastActivityAt: hoursBeforeNow(100) }), NOW)
    ).toBe(true);
  });

  it("defaults `now` to the current time when omitted", () => {
    const ancient = row(1_000_000);
    expect(isAbandonedPivot(ancient)).toBe(true);
  });
});

describe("abandonedPivotScalarWhere", () => {
  it("encodes the scalar conditions for the sweep filter", () => {
    const where = abandonedPivotScalarWhere(NOW);
    expect(where.pivotKept).toBe(false);
    expect(where.familyId).toBeNull();
    expect(where.savedAt.lt.toISOString()).toBe(
      pivotSweepCutoff(NOW).toISOString()
    );
  });
});

describe("pivotActivityGuardWhere", () => {
  it("excludes rows with a CookLog or MiseCheck inside the window", () => {
    const where = pivotActivityGuardWhere(NOW);
    const cutoff = pivotSweepCutoff(NOW).toISOString();
    expect(where.cookLogs.none.cookedAt.gte.toISOString()).toBe(cutoff);
    expect(where.miseChecks.none.checkedAt.gte.toISOString()).toBe(cutoff);
  });
});

describe("DB filter / predicate agreement", () => {
  it("agrees with isAbandonedPivot on every classified row", () => {
    // Cross-check: the deleteMany filter and the pure predicate must never
    // disagree, or the cron would delete rows the predicate considers safe.
    // The runner layers `pivotMeta != null` on top of these conditions via
    // Prisma.DbNull, so we model that here as `c.pivotMeta != null`; the
    // relation `none` guards are modeled via `lastActivityAt`.
    const cases: SweepCandidate[] = [
      row(72),
      row(1),
      row(48),
      row(1000, { pivotKept: true }),
      row(1000, { pivotMeta: null }),
      row(1000, { familyId: "fam_1" }),
      row(72, { lastActivityAt: hoursBeforeNow(2) }),
      row(72, { lastActivityAt: pivotSweepCutoff(NOW) }),
      row(200, { lastActivityAt: hoursBeforeNow(100) }),
    ];
    const scalar = abandonedPivotScalarWhere(NOW);
    const guard = pivotActivityGuardWhere(NOW);
    for (const c of cases) {
      const matchesWhere =
        c.pivotKept === scalar.pivotKept &&
        c.familyId === scalar.familyId &&
        c.pivotMeta != null &&
        c.savedAt.getTime() < scalar.savedAt.lt.getTime() &&
        (c.lastActivityAt == null ||
          c.lastActivityAt.getTime() <
            guard.cookLogs.none.cookedAt.gte.getTime());
      expect(matchesWhere).toBe(isAbandonedPivot(c, NOW));
    }
  });
});
