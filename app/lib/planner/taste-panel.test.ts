import { describe, expect, it } from "vitest";
import {
  groupPreferences,
  latestVerdictsByRole,
  previousVerdictSummary,
  recencyLabel,
  sourceLabel,
  tasteSummary,
  type OutcomeSnapshot,
  type TastePref,
} from "./taste-panel";

let nextId = 0;
function pref(overrides: Partial<TastePref> = {}): TastePref {
  nextId++;
  return {
    id: `p${nextId}`,
    kind: "RELIABLE_HIT",
    slug: "pasta",
    display: "pasta",
    source: "intake",
    lastConfirmedAt: 1_000,
    evidenceCount: 1,
    ...overrides,
  };
}

describe("groupPreferences", () => {
  it("routes each kind to its bucket", () => {
    const b = groupPreferences([
      pref({ kind: "RELIABLE_HIT" }),
      pref({ kind: "EXPERIMENTING" }),
      pref({ kind: "HARD_NO" }),
      pref({ kind: "ASPIRATION" }),
    ]);
    expect(b.reliable).toHaveLength(1);
    expect(b.experimenting).toHaveLength(1);
    expect(b.hardNos).toHaveLength(1);
    expect(b.aspirations).toHaveLength(1);
  });

  it("sorts within a bucket by evidence, then recency, then name", () => {
    const weak = pref({ display: "broccoli", evidenceCount: 1 });
    const strong = pref({ display: "pasta", evidenceCount: 5 });
    const recent = pref({
      display: "rice",
      evidenceCount: 1,
      lastConfirmedAt: 9_000,
    });
    const alpha = pref({
      display: "apples",
      evidenceCount: 1,
      lastConfirmedAt: 1_000,
    });
    const b = groupPreferences([weak, alpha, strong, recent]);
    expect(b.reliable.map((p) => p.display)).toEqual([
      "pasta",
      "rice",
      "apples",
      "broccoli",
    ]);
  });
});

describe("tasteSummary", () => {
  it("returns empty string when nothing is known", () => {
    expect(tasteSummary([])).toBe("");
    expect(tasteSummary([pref({ kind: "ASPIRATION" })])).toBe("");
  });

  it("pluralizes and omits empty buckets", () => {
    expect(
      tasteSummary([
        pref({ kind: "RELIABLE_HIT" }),
        pref({ kind: "HARD_NO" }),
        pref({ kind: "HARD_NO" }),
      ]),
    ).toBe("1 reliable hit · 2 hard nos");
  });

  it("includes experimenting in the middle", () => {
    expect(
      tasteSummary([
        pref({ kind: "RELIABLE_HIT" }),
        pref({ kind: "RELIABLE_HIT" }),
        pref({ kind: "EXPERIMENTING" }),
      ]),
    ).toBe("2 reliable hits · 1 experimenting");
  });
});

describe("recencyLabel", () => {
  const DAY = 86_400_000;
  const now = 100 * DAY;

  it("handles today and yesterday", () => {
    expect(recencyLabel(now, now)).toBe("today");
    expect(recencyLabel(now - DAY / 2, now)).toBe("today");
    expect(recencyLabel(now - DAY, now)).toBe("yesterday");
  });

  it("uses days under two weeks", () => {
    expect(recencyLabel(now - 5 * DAY, now)).toBe("5d ago");
    expect(recencyLabel(now - 13 * DAY, now)).toBe("13d ago");
  });

  it("uses weeks, then months, then over a year", () => {
    expect(recencyLabel(now - 14 * DAY, now)).toBe("2w ago");
    expect(recencyLabel(now - 45 * DAY, now)).toBe("6w ago");
    expect(recencyLabel(now - 90 * DAY, now)).toBe("2mo ago");
    expect(recencyLabel(now - 400 * DAY, now)).toBe("over a year ago");
  });
});

describe("sourceLabel", () => {
  it("maps known sources", () => {
    expect(sourceLabel("intake")).toBe("from your intake chat");
    expect(sourceLabel("outcome")).toBe("learned from meal check-ins");
  });

  it("passes unknown sources through", () => {
    expect(sourceLabel("import")).toBe("from import");
  });
});

function snap(
  eaterRole: OutcomeSnapshot["eaterRole"],
  verdict: OutcomeSnapshot["verdict"],
  createdAt: number,
): OutcomeSnapshot {
  return { eaterRole, verdict, createdAt };
}

describe("latestVerdictsByRole", () => {
  it("returns nulls for empty input", () => {
    expect(latestVerdictsByRole([])).toEqual({
      adult: null,
      kid: null,
      recordedAt: null,
    });
  });

  it("picks the most recent verdict per role", () => {
    const got = latestVerdictsByRole([
      snap("ADULT", "PICKED", 50),
      snap("ADULT", "ATE", 200),
      snap("KID", "REFUSED", 100),
      snap("KID", "ATE", 30),
    ]);
    expect(got.adult).toBe("ATE");
    expect(got.kid).toBe("REFUSED");
    expect(got.recordedAt).toBe(200);
  });

  it("handles a single-role history", () => {
    const got = latestVerdictsByRole([snap("KID", "PICKED", 77)]);
    expect(got).toEqual({ adult: null, kid: "PICKED", recordedAt: 77 });
  });
});

describe("previousVerdictSummary", () => {
  it("formats both roles", () => {
    expect(previousVerdictSummary({ adult: "ATE", kid: "REFUSED" })).toBe(
      "Adults loved it · Kids refused it",
    );
  });

  it("formats one role alone", () => {
    expect(previousVerdictSummary({ adult: null, kid: "PICKED" })).toBe(
      "Kids picked at it",
    );
  });

  it("returns empty when nothing recorded", () => {
    expect(previousVerdictSummary({ adult: null, kid: null })).toBe("");
  });
});
