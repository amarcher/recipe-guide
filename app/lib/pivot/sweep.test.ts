import { describe, it, expect } from "vitest";
import {
  PIVOT_SWEEP_WINDOW_HOURS,
  PIVOT_SWEEP_WINDOW_MS,
  pivotSweepCutoff,
  isAbandonedPivot,
  abandonedPivotScalarWhere,
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
    ...overrides,
  };
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

  it("defaults `now` to the current time when omitted", () => {
    const ancient = row(1_000_000);
    expect(isAbandonedPivot(ancient)).toBe(true);
  });
});

describe("abandonedPivotScalarWhere", () => {
  it("encodes the scalar conditions for deleteMany", () => {
    const where = abandonedPivotScalarWhere(NOW);
    expect(where.pivotKept).toBe(false);
    expect(where.savedAt.lt.toISOString()).toBe(
      pivotSweepCutoff(NOW).toISOString()
    );
  });

  it("agrees with isAbandonedPivot on every classified row", () => {
    // Cross-check: the deleteMany filter and the pure predicate must never
    // disagree, or the cron would delete rows the predicate considers safe.
    // The route layers `pivotMeta != null` on top of these scalar conditions
    // via Prisma.DbNull, so we model that here as `c.pivotMeta != null`.
    const cases: SweepCandidate[] = [
      row(72),
      row(1),
      row(48),
      row(1000, { pivotKept: true }),
      row(1000, { pivotMeta: null }),
    ];
    const where = abandonedPivotScalarWhere(NOW);
    for (const c of cases) {
      const matchesWhere =
        c.pivotKept === where.pivotKept &&
        c.pivotMeta != null &&
        c.savedAt.getTime() < where.savedAt.lt.getTime();
      expect(matchesWhere).toBe(isAbandonedPivot(c, NOW));
    }
  });
});
