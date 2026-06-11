# Task Queue — Recipe Guide (loop cursor)

The loop runner reads and writes **this file** — the single source of truth for "what's next." It is shared by both runners (`PAIR-LOOP.md`, the default; `LOOP-OPS.md`, the full 5-way hackathon) — run one at a time. Features append to the bottom of `### Open`; the loop pulls from the top. **One feature = one contest = one PR = one iteration.**

Each entry is a **feature**, not a micro-task and not an epic — a coherent *product unit* (a surface, a flow, a capability) each builder can fully implement in one sitting and the standing panel can meaningfully compare. Chores (test coverage, verify scripts, backfills) are not contestable: batch them into a `chore batch` entry the runner fixes inline — no pair build, no panel. If a builder can't finish an entry coherently, it was mis-scoped; split it.

**Status tokens** (exactly one per entry, on the `- [token]` line; the loop rewrites them in place):
- `[ ]` — open, not started
- `[wip]` — an iteration is mid-flight (rare; cleared on handoff or crash recovery)
- `[review: #NN]` — won the contest, PR open, merges on Vercel-green (Andrew's veto can override; his 👍 is not required)
- `[done: #NN]` — merged
- `[blocked: <reason>]` — needs a decision or an unmet dependency; the loop skips these

**Entry format** — the token line carries the state; indented lines give the builders their brief:
```
- [ ] <id> — <feature title> · slug:<branch-slug>
      outcome: <1–2 sentences: what's true once shipped>
      done-when: <how the panel/loop verifies done>
      [constraints: <gotchas / scope notes>]                                  (optional)
      [approaches: <two custom pair stances, name: essence; name: essence>]   (optional, pair loop)
```

### Open
<!-- loop pulls the topmost [ ] feature; planning layer appends new features below this comment -->
<!-- Re-cut 2026-06-10 (Andrew-approved): merged Increment-1 small entries upward to pair-loop
     feature altitude; chores batched out of the contest path. The full-loop iteration on
     rel-sprites-core-tests was ended unshipped 2026-06-10; the work moved into chores-batch-1. -->
- [ ] chores-batch-1 — Chore batch: prod-migration verify script + cron-sweep hardening + sprites-core tests · slug:chore/batch-1
      outcome: (1) A read-only script (`npm run verify:prod-migration`) reports per-object whether the 20260429002752_phase2 migration is applied in prod, plus a committed one-command deploy runbook — if not applied it clearly flags that Andrew must run `prisma migrate deploy` himself. (2) Pivot-sweep hardening per panel follow-ups: shared runPivotSweep factoring (route+script share one deletion path), an active-cook-session guard before deleting execution-adjacent rows, a defensive familyId scope clause + tombstone note for future sharing/gifting. (3) The sprite resolver (findSprite / aisleForName / scoring) is unit-tested against the committed sprites/manifest.json (Prisma-free; folded from rel-sprites-core-tests after its full-loop iteration was ended unshipped).
      done-when: npx tsc --noEmit && npx eslint app && npm test (including app/lib/sprites-core.test.ts); verify:prod-migration prints the applied/not-applied report; the runbook is committed.
      constraints: CHORE BATCH — the runner fixes this inline (single agent, no pair build, no panel); READ-ONLY against prod (introspect only, NEVER migrate — `prisma migrate deploy` is Andrew's manual step); keep checks Prisma-free where testable.

### Blocked (needs evidence or a decision — the loop skips these)
- [blocked: needs 3+ months of MealOutcome history] 3.3 — Smart re-ordering
- [blocked: no second family yet] 3.4 — Cross-family RecipeShelf
- [blocked: defer until 2.20 friction observed] 3.5 — Cross-family RecipeGift with lineage
- [blocked: zero documented friends] 3.6 — Friends graph + activity feed

### Backlog (ready, not yet queued — promote into Open next increment)
From the 2026-06-10 planning fan-out; full briefs in the bus payloads. Promote when Open drains — merging small entries upward to feature altitude as was done in the 2026-06-10 re-cut (leftover-tonight → pantry-end-to-end; resolver-snapshot-fallback + cron-sweep-hardening → card-canonical-integrity / chores-batch-1).
- rel-candidate-resilience (M) — Promise.allSettled + maxRetries + partial-success for planner candidate generation
- rel-llm-observability (M) — shared generateObject wrapper: usage logging + structured errors across planner routes
- share-token-gc-and-expiry (M) — enforce expiresAt/revokedAt at read time + a GC sweep on share tokens
- cook-photo-wall (M) — a "Photos" library filter: chronological feed of real CookLog photos
- tts-elevenlabs-provider (M) — swap the prototype Translate TTS for ElevenLabs (needs ELEVENLABS_API_KEY)
- recipegift-token-groundwork (M) — Phase-3.5 groundwork: gift token + lineage snapshot, single-recipient
- planevent-history-fixture (M) — Phase-3.3 groundwork: history seed + Prisma-free reorder-core
- menu-rsvp (L, deferred 2026-06-10 by Andrew) — anonymous token-scoped voting on hosted /menu/[slug]; needs a new model+migration and must be split into a first slice (schema + single up/down vote) before queuing; brushes the cut "recipe comments" line — revisit only with real demand

### Done (most recent first; trimmed periodically)
<!-- the loop appends [done: #NN] lines here as PRs merge -->
- [done: #55] eater-taste-profiles — Read-only per-eater taste panel + same-as-last-time outcome shortcut · pair-loop iteration 3, 3-judge panel: product won 3-0 over minimalist (loser's one-tap replayed verdicts from ANY meal — affordance semantics beat a 2x smaller diff); grafted B's demo-seed extension; follow-up: dish identity beyond title equality
- [done: #53] card-canonical-integrity — Promote kept pivots to canonical + resolver snapshot fallback · pair-loop iteration 2, 3-judge panel: product won 3-0 over minimalist (promote migrates cook history vs cascade-delete; fallback semantics fit the null-frozen data that exists); grafted A's expandPivotedCard cleanup; backfill retirement deferred to post-soak (see #53 body)
- [done: #51] pantry-end-to-end — Pantry as a first-class surface: /pantry CRUD + Tonight near-expiry · pair-loop iteration 1, 3-judge panel: product won 2-1 over minimalist (safer merge-on-re-add semantics + actionable warmth; simplicity dissented on unrequested surface); grafted B's value-prop subtitle + urgency-ordered first paint; follow-up steals in PR body
- [done: #47] rel-aggregate-tests — unit-cover app/lib/aggregate.ts mise/grocery dedupe · 5-judge panel, 1 builder disqualified for an empty branch (architect caught it), 4-way split → D (honest vitest config + worktree-exclude + smallest diff); grafted real Prisma-in-vitest enforcement + WANT-spec tripwires for 2 found grocery bugs (range under-count, clove/cloves desync)
- [done: #45] rel-schema-guard — CI guardrail failing the build on banned LLM-schema Zod constructs (roadmap 1.6) · panel 5–0 no veto, 2–2 D/E tie → E (compiled-z.toJSONSchema + in-runner self-test + pivot coverage), grafted D's single-report .int()
- [done: #41] cron-pivot-sweep — first scheduled cron + abandoned-pivot sweeper (panel 5–0)
- [done: #39] dish-image-override-backfill — backfill generated dish-image URLs into pre-backfill overrides (panel 5–0)
