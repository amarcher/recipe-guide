# Task Queue — Recipe Guide (loop cursor)

The `/loop` runner (see `LOOP-OPS.md`) reads and writes **this file** — the single source of truth for "what's next." The planning layer appends **features** to the bottom of `### Open`; the loop pulls from the top. **One feature = one hackathon = one PR = one iteration.**

Each entry is a **feature**, not a micro-task and not an epic — a coherent unit ~5 lens-builders can each fully implement and the standing panel can meaningfully compare (see "Feature sizing" in `LOOP-OPS.md`). Consistent altitude is what keeps a ~5-way hackathon the right shape; if a builder can't finish it coherently, split it.

**Status tokens** (exactly one per entry, on the `- [token]` line; the loop rewrites them in place):
- `[ ]` — open, not started
- `[wip]` — an iteration is mid-flight (rare; cleared on handoff or crash recovery)
- `[review: #NN]` — won the hackathon, PR open, merges on Vercel-green (Andrew's veto can override; his 👍 is not required)
- `[done: #NN]` — merged
- `[blocked: <reason>]` — needs a decision or an unmet dependency; the loop skips these

**Entry format** — the token line carries the state; indented lines give the builders their brief:
```
- [ ] <id> — <feature title> · slug:<branch-slug>
      outcome: <1–2 sentences: what's true once shipped>
      done-when: <how the panel/loop verifies done>
      [constraints: <gotchas / scope notes>]   (optional)
      [n: <2–5>]                                 (optional; default 5, floor 2 — usually omit, scope to ~5)
```

### Open
<!-- loop pulls the topmost [ ] feature; planning layer appends new features below this comment -->
<!-- Increment 1, populated 2026-06-10 from the 4-scout planning fan-out (see .agents/bus payloads).
     Ordered: safe foundations first, then high-leverage product. -->
- [review: #41] cron-pivot-sweep — First scheduled cron + abandoned-pivot sweeper · slug:chore/cron-pivot-sweep
      outcome: Stale in-progress pivot forks (pivotKept=false, older than 48h) are auto-discarded via the project's first scheduled cron, establishing a reusable cron convention.
      done-when: npx tsc --noEmit && npx eslint app && npm test -- app/lib/pivot/sweep.test.ts; a backdated pivot row is swept and a fresh one survives.
      constraints: add vercel cron config + a CRON_SECRET-guarded POST /api/cron/pivot-sweep (deleteMany on stale rows; cascades MiseCheck/CookLog); sweep predicate in a Prisma-free app/lib/pivot/sweep.ts; npm run pivot-sweep for manual runs. Make the cron scaffolding reusable.
- [ ] rel-schema-guard — CI guardrail failing the build on banned LLM-schema Zod calls (roadmap 1.6) · slug:chore/rel-schema-guard
      outcome: CI fails the build when an LLM schema uses a banned construct (minItems>1, maxItems, number bounds, .int(), .positive()).
      done-when: scripts/validate-llm-schemas.ts flags a deliberately-bad schema in its test; the CI workflow runs it; npx tsc --noEmit green.
      constraints: add the script + a step to .github/workflows/ci.yml; scan the planner schema files + any app/lib LLM schemas.
- [ ] rel-aggregate-tests — Unit-cover app/lib/aggregate.ts (mise/grocery dedupe) · slug:chore/rel-aggregate-tests
      outcome: The load-bearing aggregation module (keying by (slug||item, unit), scaling, pantry merge) has meaningful unit coverage.
      done-when: npm test -- app/lib/aggregate.test.ts green, covering keying, scaling, and pantry merge.
      constraints: pure-function tests only — no Prisma import.
- [ ] rel-sprites-core-tests — Unit-cover app/lib/sprites-core.ts against the committed manifest · slug:chore/rel-sprites-core-tests
      outcome: The sprite resolver (findSprite / aisleForName / scoring) is unit-tested against sprites/manifest.json.
      done-when: npm test -- app/lib/sprites-core.test.ts green.
      constraints: Prisma-free; assert against the committed manifest.
- [ ] pantry-manager — A real /pantry surface + family pantry API · slug:feat/pantry-manager
      outcome: Households can view/add/edit/clear their on-hand pantry items, making the already-shipped mise auto-check and grocery dedupe trustworthy.
      done-when: verify-ui on /pantry (add/edit/clear) && npx tsc --noEmit && npx eslint app; family-scoped CRUD works.
      constraints: PantryItem is already written + read but has NO API/UI — add both; hand-rolled NULL-distinct upsert; never touch the execution layer.
- [ ] pivot-replace-original — Promote a kept pivot's revised card onto the parent recipe · slug:feat/pivot-replace-original
      outcome: After keeping a pivot, the cook can promote its revised card onto the parent recipe's RecipeOverride (parent scope), making the fix canonical instead of a separate pivot tile.
      done-when: npx tsc --noEmit && npx eslint app; verify-ui on /recipe/[id] for a kept pivot → "Replace original" makes the parent show the revised card and the pivot tile is gone.
      constraints: POST /api/recipes/[id]/pivot/promote (hand-rolled NULL-distinct upsert; source_url immutable via validateCardPayload); button on PivotInProgressBanner + promotePivot(id) storage helper.
- [ ] eater-taste-profiles — Read-only per-eater taste panel surfacing ProfilePreference · slug:feat/eater-taste-profiles
      outcome: A read-only per-eater panel surfaces ProfilePreference (RELIABLE / EXPERIMENTING / HARD_NO) and wires MealOutcomePrompt's existing "same as last time" affordance, closing the visible end of the planner's learning loop.
      done-when: verify-ui on the eater panel && npx tsc --noEmit && npx eslint app.
      constraints: READ-ONLY — must NOT become the cut "profile editor UI v1"; surface existing ProfilePreference data only.

### Blocked (needs evidence or a decision — the loop skips these)
- [blocked: contradicts the documented "pivots are always personal-scope" invariant — needs Andrew's sign-off] family-scope-pivots — Allow family-scope mid-cook pivots
- [blocked: tail requires Andrew to run `migrate deploy` against prod Neon] roadmap-prod-enablement — Verify + enable the Phase-2 production migration
- [blocked: L-size + new migration — split into a first slice before queuing] menu-rsvp — Anonymous token-scoped voting on hosted menus
- [blocked: needs 3+ months of MealOutcome history] 3.3 — Smart re-ordering
- [blocked: no second family yet] 3.4 — Cross-family RecipeShelf
- [blocked: defer until 2.20 friction observed] 3.5 — Cross-family RecipeGift with lineage
- [blocked: zero documented friends] 3.6 — Friends graph + activity feed

### Backlog (ready, not yet queued — promote into Open next increment)
From the 2026-06-10 planning fan-out; full briefs in the bus payloads. Promote when Open drains.
- rel-candidate-resilience (M) — Promise.allSettled + maxRetries + partial-success for planner candidate generation
- rel-llm-observability (M) — shared generateObject wrapper: usage logging + structured errors across planner routes
- share-token-gc-and-expiry (M) — enforce expiresAt/revokedAt at read time + a GC sweep on share tokens
- cook-photo-wall (M) — a "Photos" library filter: chronological feed of real CookLog photos
- leftover-tonight (M) — surface near-mustUseBy pantry items on Tonight + badge meals that use them (soft-depends pantry-manager)
- tts-elevenlabs-provider (M) — swap the prototype Translate TTS for ElevenLabs (needs ELEVENLABS_API_KEY)
- recipegift-token-groundwork (M) — Phase-3.5 groundwork: gift token + lineage snapshot, single-recipient
- planevent-history-fixture (M) — Phase-3.3 groundwork: history seed + Prisma-free reorder-core
- resolver-snapshot-fallback (M) — **(panel insight, 2026-06-10)** make card-resolver read a canonical field when the override/snapshot lacks it, so new ParsedRecipe fields stop silently shadowing on frozen RecipeOverride / pivotMeta.revisedCard / MealCandidate.composedCardDraft / MenuItem.snapshotCardJson — retires the need for per-field one-shot backfills
- cron-sweep-hardening (S) — **(panel follow-ups, feature 2)** fold the runner-up's shared `runPivotSweep` factoring (route+script one deletion path); add an active-cook-session guard before any future sweeper deletes execution-adjacent rows; add a defensive `familyId: null` scope clause + a tombstone once recipe sharing/gifting lands

### Done (most recent first; trimmed periodically)
<!-- the loop appends [done: #NN] lines here as PRs merge -->
- [done: #39] dish-image-override-backfill — backfill generated dish-image URLs into pre-backfill overrides (panel 5–0)
