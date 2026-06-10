# Recipe Guide — Execution Plan

**For future Claude sessions.** This is the operational handoff after the 9-agent roadmap exercise on 2026-04-28. It points at the durable artifacts and tells you how to pick up work.

## Read these first, in this order

1. **`docs/roadmap-2026/ONE-PAGER.md`** — the bet, the cuts, Andrew's open decisions (~700 words)
2. **`docs/roadmap-2026/ROADMAP.md`** — canonical 21-item backlog with per-item Pitch / Why / Sketch / Size / Unblocks / Risks
3. **`docs/roadmap-2026/round2/00-convergence.md`** — adjudications from the 5-lens debate, with rationales for why we cut what we cut
4. **`CLAUDE.md`** — current architecture (always reread; this evolves)
5. **`docs/roadmap-2026/positions/0[1-5]-*.md`** — only when you need the *why* behind a backlog item

The HTML deck `presentation.html` is for stakeholder communication, not engineering reference.

## Hard constraints (non-negotiable)

- **Execution layer is untouchable.** `CookCardView`, `MisePlace`, `Timeline`, `StepIcon`, `StepTimer`, `cook-session.ts`, `timer-state.ts`, `alarm.ts` — do not modify in service of new features. New work *layers on top*. The only proposed carve-out is open decision #1 below; do not pre-commit to it.
- **Week is a menu, not a calendar.** No grid. `targetDay` is advisory at Tonight pick time only.
- **One grocery trip per week** is the forcing function — features that imply mid-week shops are wrong.
- **Synchronized execution is opt-in at the family level**, alarm default is starter-only.
- **Anthropic schema gotchas**: no `minItems > 1`, no `maxItems`, no number bounds (`.int()`, `.positive()`, `.min/.max`). See `app/lib/planner/schemas.ts` for the established pattern. The Phase 1 CI guardrail (item 1.6) enforces this.
- **Postgres NULL-distinct trap**: any unique constraint involving `(userId, familyId)` or similar nullable scope columns must hand-roll `findFirst → create | update`, not trust Prisma upserts.
- **Vitest has no path-alias setup.** Tests cannot import anything that pulls `@/app/lib/prisma`. Pattern: extract Prisma-free helpers (see `app/lib/card-scope.ts` next to `card-resolver.ts`).
- **Next.js 16 has breaking changes.** Read `node_modules/next/dist/docs/` before reaching for App Router APIs from memory.

## Decisions settled (2026-04-28)

All four answered. Build with these as fixed constraints.

1. **Post-cook share chip on SaveBar — APPROVED.** Slot into SaveBar after the photo prompt. Do not modify `CookCardView`. Phase 2 hosting share UX builds on this carve-out.
2. **Hosted Menu — PUBLIC-BY-TOKEN.** `/menu/[slug]` requires no auth. Schema: `WeeklyPlan.publishedSlug` generated only on explicit publish. Slugs are not reusable post-revoke. Inherits content-moderation responsibility — see ROADMAP risk register.
3. **Grocery automation Phase 3 default — AMAZONFRESH.** `3.2` targets AmazonFresh first. `3.1` (vendor-agnostic deep-link) ships independently as universal fallback; design the export surface to be partner-swappable.
4. **Family privacy — UNCHANGED.** No per-user privacy within a family. `Profile` and `ProfilePreference` (1.2) carry no scope columns; `MealOutcome` (2.15) is family-readable. `MiseCheck` stays per-user only because it's an in-flight execution detail.

## Phase 1 execution order ("Make planning feel alive", ~2 weeks)

The architect's foundations come first because every later item depends on them. Do these in order; some can parallelize but only after the foundations land.

| # | Item | First commit looks like |
|---|------|-------------------------|
| 1.1 | `PlanEvent` log | New table + `recordPlanEvent()` helper, wrapped around every existing planner POST handler. No UI. |
| 1.6 | Schema-gotcha CI guardrail | `scripts/validate-llm-schemas.ts` + a CI step. Fails build on banned Zod calls. Ship before any new planner LLM feature. |
| 1.4 | `loadCanonicalCard` audit | Grep planner read sites; replace any `resolveCard` calls in scoring/aggregation paths with `loadCanonicalCard`. Add a lint banner comment to `card-resolver.ts`. |
| 1.5 | `publishCandidate(scope)` refactor | Extract from current `materializeCandidate` — single caller today. Add `scope: 'execute' \| 'library' \| 'menu'`. |
| 1.2 | `Profile` + `ProfilePreference` | Schema + lazy backfill from `WeeklyPlan.intake.kidRules`. No editor UI v1; no scope columns (privacy decision). |
| 1.3 | `PantryItem` + grocery write-back | Schema + `PATCH /api/plans/[id]/grocery/[id]` writes through to pantry on `purchased=true`. Hand-rolled upsert per NULL-distinct rule. |
| 1.7 | `MoodTag` auto-tagging | Enum + populate at scoring time. No UI yet; replaces any "what day" affordance. |
| **1.13** | **Transparent-bg sprite regen (gpt-image-1)** | Swap `scripts/generate-sprites.mjs` to OpenAI `gpt-image-1` with `background: "transparent"`. Regenerate manifest in batches; verify visually. **Must ship before 1.8.** |
| 1.8 | `<MealFace />` primitive | New component in `app/components/MealFace.tsx`. Composes `RolodexTile`'s photo/vignette/swatch logic for both saved meals and unsaved candidates. Promote `VignetteArea` to a top-level `<StillLife>` while you're in there. **Debuts with transparent sprites from 1.13.** |
| 1.9 | Candidate tile redesign | Replace `MenuView` candidate cards with `<MealFace />`. Blocked by 1.8. |
| 1.11 | Mode chooser | `[Use up] [Explore] [Survival]` quick-pick at plan creation; pre-fills intake. S-size, can land any time. |
| 1.10 | Tonight surface | New route `app/plan/[id]/tonight/page.tsx`. Two-column when a slot is split, one-column otherwise. Cook button per column drops into existing flow. Blocked by 1.8. |
| 1.12 | Grocery → mise cascade | `MiseCheck.source` enum (`MANUAL \| GROCERY`), tab-load reconciliation (no SSE in Phase 1). Blocked by 1.3. |

**Ship checkpoint after Phase 1**: kid profiles backfilled, pantry persists across plans, planner candidates have visual faces, Tonight surface is live, grocery purchases pre-check mise.

## Phase 2 execution order ("Connect the household", ~3-4 weeks)

Order: 2.13 first (everything else uses the channel), then 2.14 + 2.15 in parallel, then 2.17 + 2.19 + 2.20, then 2.16 + 2.18 + 2.21.

Decision-blocked: 2.17 (open #2), share-related UX in 2.17/2.20 (open #1).

**Status (2026-04-29):** all nine items shipped in skeleton form pending
production migration deploy. Migration `prisma/migrations/20260429002752_phase2`
covers every schema addition (FamilyEvent, MiseCheckShared, MealOutcome +
EaterRole + MealVerdict enums, WeeklyPlan publish columns,
WeeklyPlanMenuItem, RecipeShareToken, GroceryListShare, Notification, plus
PlannedMealStatus enum value `COOKED_FROM_LEFTOVERS` and PlannedMeal.cookLogId).

| # | Item | Status |
|---|------|--------|
| 2.13 | FamilyEvent + SSE + polling fallback + `recordFamilyEvent` helper | shipped (build-time only; deploy migration to enable) |
| 2.14 | Meezing presence + `MiseCheckShared` + SaveBar ribbon | shipped |
| 2.15 | MealOutcome capture + post-cook prompt + ProfilePreference learning | shipped |
| 2.16 | Mid-week pivots (Skip / Leftovers / Swap) + PATCH meal route | shipped |
| 2.17 | Hosted Menu publish + `/menu/[slug]` + ICS + OG | shipped |
| 2.18 | Sprite-driven aisle grocery grid + Shop/List toggle | shipped |
| 2.19 | Delegate grocery share + `/grocery/[token]` + share controls | shipped |
| 2.20 | Recipe share token + `/r/[token]` + post-cook ShareCookChip | shipped |
| 2.21 | Notification table + `/inbox` + header badge + fan-out helpers | shipped |

## Phase 3 — partial (deeplink groundwork shipped 2026-04-28)

| # | Item | Status |
|---|------|--------|
| 3.1 | Vendor-agnostic deep-link grocery export | shipped (adapter + UI button + event log) |
| 3.2 | Real partner API integration (AmazonFresh) | shipped (deeplink only; partner API deferred) |
| 3.3 | Smart re-ordering | parked (needs 3+ months of MealOutcome history) |
| 3.4 | Cross-family `RecipeShelf` | parked (no second family yet) |
| 3.5 | Cross-family `RecipeGift` with lineage | parked (defer until 2.20 friction observed) |
| 3.6 | Friends graph + activity feed | parked (zero documented friends) |

**3.1 + 3.2 implementation notes:**

- Vendor adapter at `app/lib/grocery-vendors.ts` — pure, Prisma-free, vitest-loadable. Three adapters (AmazonFresh, Instacart, Walmart); only AmazonFresh wired into the UI per the 2026-04-28 decision. Promoting another vendor is a one-line UI change once we have a real preference signal.
- AmazonFresh URL shape: `https://www.amazon.com/s?k=<top-N items>&i=amazonfresh`. Single deeplink primes the first ~5 items (search relevance handles the rest); the full list lands on the clipboard so the user can paste-add the remainder. URL-length guardrail caps the encoded query at ~1500 chars.
- UI: `<GroceryExportButton />` in `app/plan/[id]/GroceryExportButton.tsx`, slotted below `GroceryShareControls` on `/plan/[id]`. Reuses the inline-section styling from delegate-share so it doesn't fork a new visual idiom.
- Events: `grocery.exported` added to `PLAN_EVENT_KINDS` and `FAMILY_EVENT_KINDS`. The thin route `POST /api/plans/[id]/grocery/export` records both. Family fan-out lets item 2.21 surface the export in the inbox once the inbox is connected to this kind.
- Out of scope (explicitly): OAuth / partner API integration, schema changes, per-family vendor preference, multi-vendor toggles in the UI, mobile share-sheet integration. All deferred until we have evidence.

## What we cut — do not propose these without new evidence

Voice intake, calendar grid, multi-week planning, friends graph, recipe comments, "Just the gist" Alicia render mode, real-time collaborative intake chat, smart auto-substitution, profile editor UI v1, library carousel, motion-language audit. Rationales in `round2/00-convergence.md` "What I cut and why."

## Cross-cutting primitives — when you build one, design for the others

- **`<MealFace />` (1.8)** is used by 1.9 candidate tiles, 1.10 Tonight surface, 2.17 Hosted Menu rendering. Build once.
- **`<StillLife>`** is used by 1.8, 2.17, library empty-state, OG images. Promote out of `RolodexTile` while shipping 1.8.
- **`FamilyEvent` channel (2.13)** carries Meezing presence (2.14), notifications (2.21), plan-progress events. Spec it once for all three consumers.
- **`source` provenance enum** appears on `MiseCheck`, `RecipeOverride`, `ProfilePreference`, `PantryItem`. Reuse the pattern.
- **Token-share + snapshot pattern** (2.19 delegate grocery, 2.20 public recipe link, 3.5 cross-family gift) is one primitive parametrized by artifact.

## Workflow reminders

- Schema changes: edit `prisma/schema.prisma`, generate SQL via file-to-file diff (`npx prisma migrate diff --from-schema /tmp/prev.prisma --to-schema prisma/schema.prisma --script`), drop into `prisma/migrations/<UTC>_<slug>/migration.sql`, apply with `npx prisma migrate deploy`. Never `migrate dev` against production.
- After schema change, restart the dev server so it picks up new types.
- Type-check: `npx tsc --noEmit`. Lint: `npx eslint app`. Tests: `npm test`.
- PR workflow per memory: after PR opens, squash-merge as soon as the Vercel check goes SUCCESS.

## Task Queue (loop cursor)

The `/loop` runner (see `LOOP-OPS.md`) reads and writes **this section** — the single source of truth for "what's next." The planning layer appends **features** to the bottom of `### Open`; the loop pulls from the top. **One feature = one hackathon = one PR = one iteration.**

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
- [ ] dish-image-override-backfill — Backfill generated dish-image URLs into pre-backfill RecipeOverride rows · slug:chore/dish-image-override-backfill
      outcome: Users whose RecipeOverride predates the dish-photo backfill see the canonical AI dish image instead of the vignette/swatch fallback.
      done-when: npx tsc --noEmit && the merge-helper *.test.ts green; dry-run prints a count, --apply on one override → /recipe/[id] renders the generated image with the ✨ badge.
      constraints: one-shot scripts/backfill-override-dish-photos.ts (dry-run default + --apply/--limit); shallow-merge generated_dish_image_url from the parent ParsedRecipe.cardJson ONLY where the override lacks it (never clobber other fields); merge logic in a Prisma-free helper for vitest.
- [ ] cron-pivot-sweep — First scheduled cron + abandoned-pivot sweeper · slug:chore/cron-pivot-sweep
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

### Done (most recent first; trimmed periodically)
<!-- the loop appends [done: #NN] lines here as PRs merge -->

## When in doubt

The convergence doc adjudicated 8 disagreements with rationales. If you're proposing something the roadmap rejected, re-read `round2/00-convergence.md` first — odds are the team already debated it. If the situation has genuinely changed, document the change before deviating.
