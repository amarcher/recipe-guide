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
     feature altitude; chores batched out of the contest path. rel-sprites-core-tests is owned by
     the in-flight FULL-loop iteration — other sessions must not pick it up. -->
- [wip] rel-sprites-core-tests — Unit-cover app/lib/sprites-core.ts against the committed manifest · slug:chore/rel-sprites-core-tests
      outcome: The sprite resolver (findSprite / aisleForName / scoring) is unit-tested against sprites/manifest.json.
      done-when: npm test -- app/lib/sprites-core.test.ts green.
      constraints: Prisma-free; assert against the committed manifest. (Pre-re-cut entry, mid-flight in the full loop — leave its token to that session.)
- [ ] pantry-end-to-end — Pantry as a first-class surface: /pantry CRUD + Tonight near-expiry · slug:feat/pantry-end-to-end
      outcome: Households can view/add/edit/clear their on-hand pantry items on a real /pantry surface, and Tonight surfaces near-mustUseBy pantry items + badges meals that use them — making the already-shipped mise auto-check and grocery dedupe trustworthy end to end. (Merges former pantry-manager + backlog leftover-tonight.)
      done-when: verify-ui on /pantry (add/edit/clear) and on Tonight's near-expiry surfacing && npx tsc --noEmit && npx eslint app && npm test; family-scoped CRUD works.
      constraints: PantryItem is already written + read but has NO API/UI — add both; hand-rolled NULL-distinct upsert; never touch the execution layer.
- [ ] card-canonical-integrity — Promote kept pivots to canonical + resolver snapshot fallback · slug:feat/card-canonical-integrity
      outcome: After keeping a pivot, the cook can promote its revised card onto the parent recipe's RecipeOverride (parent scope), making the fix canonical instead of a separate pivot tile; and the card-resolver reads the canonical field when an override/snapshot lacks it, so new ParsedRecipe fields stop silently shadowing on frozen RecipeOverride / pivotMeta.revisedCard / MealCandidate.composedCardDraft / MenuItem.snapshotCardJson — retiring per-field one-shot backfills. (Merges former pivot-replace-original + backlog resolver-snapshot-fallback, panel insight 2026-06-10.)
      done-when: npx tsc --noEmit && npx eslint app && npm test; verify-ui on /recipe/[id] for a kept pivot → "Replace original" makes the parent show the revised card and the pivot tile is gone; a unit test proves resolver fallback for a field missing from a frozen snapshot.
      constraints: POST /api/recipes/[id]/pivot/promote (hand-rolled NULL-distinct upsert; source_url immutable via validateCardPayload); button on PivotInProgressBanner + promotePivot(id) storage helper; resolver fallback is read-time only — no data migration, no backfill.
- [ ] eater-taste-profiles — Read-only per-eater taste panel surfacing ProfilePreference · slug:feat/eater-taste-profiles
      outcome: A read-only per-eater panel surfaces ProfilePreference (RELIABLE / EXPERIMENTING / HARD_NO) and wires MealOutcomePrompt's existing "same as last time" affordance, closing the visible end of the planner's learning loop.
      done-when: verify-ui on the eater panel && npx tsc --noEmit && npx eslint app.
      constraints: READ-ONLY — must NOT become the cut "profile editor UI v1"; surface existing ProfilePreference data only.
- [ ] chores-batch-1 — Chore batch: prod-migration verify script + cron-sweep hardening · slug:chore/batch-1
      outcome: (1) A read-only script (`npm run verify:prod-migration`) reports per-object whether the 20260429002752_phase2 migration is applied in prod, plus a committed one-command deploy runbook — if not applied it clearly flags that Andrew must run `prisma migrate deploy` himself. (2) Pivot-sweep hardening per panel follow-ups: shared runPivotSweep factoring (route+script share one deletion path), an active-cook-session guard before deleting execution-adjacent rows, a defensive familyId scope clause + tombstone note for future sharing/gifting.
      done-when: npx tsc --noEmit && npx eslint app && npm test; verify:prod-migration prints the applied/not-applied report; the runbook is committed.
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
- [done: #47] rel-aggregate-tests — unit-cover app/lib/aggregate.ts mise/grocery dedupe · 5-judge panel, 1 builder disqualified for an empty branch (architect caught it), 4-way split → D (honest vitest config + worktree-exclude + smallest diff); grafted real Prisma-in-vitest enforcement + WANT-spec tripwires for 2 found grocery bugs (range under-count, clove/cloves desync)
- [done: #45] rel-schema-guard — CI guardrail failing the build on banned LLM-schema Zod constructs (roadmap 1.6) · panel 5–0 no veto, 2–2 D/E tie → E (compiled-z.toJSONSchema + in-runner self-test + pivot coverage), grafted D's single-report .int()
- [done: #41] cron-pivot-sweep — first scheduled cron + abandoned-pivot sweeper (panel 5–0)
- [done: #39] dish-image-override-backfill — backfill generated dish-image URLs into pre-backfill overrides (panel 5–0)
