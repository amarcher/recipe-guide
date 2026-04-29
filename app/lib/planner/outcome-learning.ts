// Roadmap item 2.15 — Profile learning helpers, Prisma-free so vitest can
// import without the path-alias trap.
//
// The promotion rules: 3+ ATEs in the recent window promote a slug to
// RELIABLE_HIT (or refresh evidenceCount on an existing one). 2+ REFUSEDs
// demote a slug to EXPERIMENTING — we NEVER auto-create HARD_NO from
// outcomes. Hard-nos are only authored via intake (so a kid pushing
// broccoli around twice doesn't ban it forever).
//
// Outcome rows are family-scoped and stay around for history; the rules
// run over the recent N outcomes per (profileId, slug) tuple.

export type OutcomeVerdict = "ATE" | "PICKED" | "REFUSED";

export type OutcomeRow = {
  verdict: OutcomeVerdict;
  createdAt: number;
};

export type LearningDecision =
  | { kind: "promote_reliable_hit"; evidenceCount: number }
  | { kind: "demote_to_experimenting"; evidenceCount: number }
  | { kind: "noop" };

const RELIABLE_HIT_THRESHOLD = 3;
const DEMOTE_REFUSAL_THRESHOLD = 2;

export function decideLearningOutcome(
  outcomes: OutcomeRow[],
): LearningDecision {
  const ates = outcomes.filter((o) => o.verdict === "ATE").length;
  const refusals = outcomes.filter((o) => o.verdict === "REFUSED").length;
  if (ates >= RELIABLE_HIT_THRESHOLD) {
    return { kind: "promote_reliable_hit", evidenceCount: ates };
  }
  if (refusals >= DEMOTE_REFUSAL_THRESHOLD) {
    return { kind: "demote_to_experimenting", evidenceCount: refusals };
  }
  return { kind: "noop" };
}
