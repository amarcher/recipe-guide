import { describe, expect, it } from "vitest";
import {
  decideLearningOutcome,
  type OutcomeRow,
} from "./outcome-learning";

function row(verdict: OutcomeRow["verdict"], offsetMs = 0): OutcomeRow {
  return { verdict, createdAt: Date.now() - offsetMs };
}

describe("decideLearningOutcome", () => {
  it("noops for empty input", () => {
    expect(decideLearningOutcome([])).toEqual({ kind: "noop" });
  });

  it("noops below the ATE threshold", () => {
    expect(
      decideLearningOutcome([row("ATE"), row("ATE")]),
    ).toEqual({ kind: "noop" });
  });

  it("promotes after three ATEs", () => {
    const d = decideLearningOutcome([row("ATE"), row("ATE"), row("ATE")]);
    expect(d.kind).toBe("promote_reliable_hit");
    if (d.kind === "promote_reliable_hit") {
      expect(d.evidenceCount).toBe(3);
    }
  });

  it("demotes after two REFUSEDs", () => {
    const d = decideLearningOutcome([row("REFUSED"), row("REFUSED")]);
    expect(d.kind).toBe("demote_to_experimenting");
  });

  it("prefers ATE promotion when both thresholds hit", () => {
    const d = decideLearningOutcome([
      row("ATE"),
      row("ATE"),
      row("ATE"),
      row("REFUSED"),
      row("REFUSED"),
    ]);
    expect(d.kind).toBe("promote_reliable_hit");
  });

  it("PICKED counts as neither — passive verdict", () => {
    expect(
      decideLearningOutcome([row("PICKED"), row("PICKED"), row("PICKED")]),
    ).toEqual({ kind: "noop" });
  });
});
