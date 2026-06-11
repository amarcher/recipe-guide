# Judges' Memo — Recipe Guide (pair-loop panel)

The pair loop's standing panel's **durable memory** (the full loop's 5-judge panel keeps its own `judges-evolution-memo.md`). A long-lived session eventually compacts or restarts; this file is what survives. Each judge **reads its section on spawn** (to rehydrate its taste) and the loop **appends each judge's dated memoNote after every feature** (judges return the note; the loop writes serially to avoid races). Append-only — never rewrite history; the trail of sharpening taste *is* the value.

Andrew can read this anytime to see how the panel sees the app evolving. Read it before drafting the next increment of the queue.

---

## Shipped ledger (append-only)
One line per judged feature: `YYYY-MM-DD · <feature-id> · winner approach + tally (one-line why) · #PR [state]`.
<!-- the loop appends here -->
2026-06-10 · pantry-end-to-end · product won 2-1 over minimalist (safer merge-on-re-add semantics + actionable warmth beat the smaller diff; simplicity dissented on unrequested surface) · #51 [merged]
2026-06-10 · card-canonical-integrity · product won 3-0 over minimalist (promote migrated cook history where the loser cascade-deleted it; fallback semantics chosen against the data that exists — existing snapshots froze explicit nulls) · #53 [merged]
2026-06-11 · eater-taste-profiles · product won 3-0 over minimalist (loser's "same as last time" replayed verdicts from ANY meal — affordance semantics beat a 2x smaller diff; winner anchored to same-dish history with pre-tap visibility) · #55 [merged]

---

## judge-correctness — evolving taste

**North star.** Code health and safety: tsc/eslint/tests green, sound structure, the execution layer (CookCardView, MisePlace, Timeline, StepIcon, StepTimer, cook-session.ts, timer-state.ts, alarm.ts) untouched, codebase gotchas respected (Anthropic structured-output limits, Postgres NULL-distinct upserts, Prisma-free vitest helpers).

**Observations (append-only)**
<!-- append: YYYY-MM-DD · feature-id · what this taught me -->
2026-06-10 · pantry-end-to-end · Hand-rolled NULL-distinct upserts diverge most in merge semantics — check what an omitted field does to existing data (overwrite-with-null is silent data loss); also watch for `new Date()` hidden in default args of render-path helpers, which dodges the purity lint but not the hydration mismatch.
2026-06-10 · card-canonical-integrity · On fold-back/promote actions, check what cascades on delete — cook logs and photos are user-earned data, and the safer candidate migrated them; also: absent-vs-null fallback semantics must be validated against what existing expanders actually froze, not just what future ones will write.
2026-06-11 · eater-taste-profiles · The smallest diff isn't the safest when an affordance's semantics write data: B's "last verdict from any meal" one-tap would quietly pollute the learning loop, while A's same-dish lookup costs more code but records the truth — check what a convenience button actually persists, not just that it POSTs 200.

---

## judge-product — evolving taste

**North star.** Product feel: the version a family cook actually wants to live with on a busy weeknight — low-friction, warm, trustworthy.

**Observations (append-only)**
<!-- append: YYYY-MM-DD · feature-id · what this taught me -->
2026-06-10 · pantry-end-to-end · A won me on actionable warmth (one-tap "used it", merge feedback, urgency-sorted Tonight tracks) — a pantry that only lists items is a chore, one that closes the loop is a habit; watch for trimmed-diff JSX as a recurring blind spot.
2026-06-10 · card-canonical-integrity · The decisive product test for "merge/promote/fold" features is what happens to the user's accumulated history — B migrated cook logs/photos/checks while A silently cascade-deleted them; also: absent-vs-null semantics must be judged against the data that actually exists, not the data an ideal writer would have written.
2026-06-11 · eater-taste-profiles · For one-tap data-entry shortcuts the semantics ARE the product: "same as last time" must mean this dish and show what it will record before the tap — and evidence hidden in hover tooltips doesn't exist for the phone-bound family cook.

---

## judge-simplicity — evolving taste

**North star.** Smallest clean diff: the full outcome with the least new surface area and no scope creep.

**Observations (append-only)**
<!-- append: YYYY-MM-DD · feature-id · what this taught me -->
2026-06-10 · pantry-end-to-end · Server-component + router.refresh beat a client-state mirror for a CRUD surface; also: a trimmed diff hiding a candidate's largest file is a reviewability red flag I should keep penalizing.
2026-06-10 · card-canonical-integrity · The smaller, purer rule (absent-only fallback) lost because the production rows carry materialized nulls — pick merge semantics against the data you have, and never delete the old tool until the new one covers its cases.
2026-06-11 · eater-taste-profiles · A smaller diff that wires a one-tap convenience to write noisy data into a learning loop isn't "clean" — affordance semantics beat a 2x size gap; but title-string dish identity is the next fragility.
