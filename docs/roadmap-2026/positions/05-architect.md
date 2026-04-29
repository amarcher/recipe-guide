# Architect & Pragmatist — position

## Lens

I'm optimizing for **throughput across the next four roadmap items, not the elegance of any single one**. Every "yes" pre-pays a maintenance bill; every well-placed "no" buys a quarter of velocity. My job here is to (a) flag the schema and primitive moves that, if delayed, force later features to double back; (b) find the smallest version of every "L"/"XL" idea the other agents propose; and (c) keep the execution layer (CookCardView, MisePlace, StepTimer, cook-session) genuinely untouchable while the planner around it grows. The codebase has real, named constraints — Anthropic's structured-output complexity budget, NULL-distinct unique constraints in Postgres, the vitest "no Prisma in import graph" wall, the prototype-fragile Translate TTS, sprite generation cost — and I want this roadmap to respect them on purpose, not by accident.

## Prioritization framework (proposed for the team)

A feature is **P0** if and only if it satisfies *at least two* of: (1) it unblocks ≥2 other proposed features, (2) it removes a known sharp edge that already costs us in production (e.g. NULL-distinct workarounds, override resolution at every read), (3) it is required to keep a UNTOUCHABLE invariant intact while the surface area grows (cook-execution, single grocery trip, family scoping). **P1** features have clear standalone user value but don't unblock others — ship them after P0 settles. **P2** features are elegant but solve a problem we don't have yet (kid privacy isolation, multi-week planning, social sharing) — write them down, do not build them.

Cuts apply at the *sub-feature* level too: every L/XL gets a forced "what's the M version?" question. If the M version captures ≥70% of user value, the L version is P2 unless someone produces the missing 30% of evidence. Anything requiring a new LLM schema gets a complexity-budget review before it ships.

## Top features (prioritized, P0–P2)

### 1. [P0] Plan-scoped event log + observability primitive  *(M, 2-3d)*

**Pitch.** Add a single `PlanEvent(planId, kind, payload, createdAt, actorId)` table that every planner mutation writes to (skeleton generated, candidate ranked, candidate committed, candidate decommitted, grocery rebuilt, meal cooked). One write per state change, append-only, JSON payload.

**Why it unlocks downstream work.** "Why did the planner suggest X?", "what changed when I tuned the skeleton?", undo, plan-history view, regression tests against real plans, A/B prompt comparison, and the synthesis agent's "show me the rationale tree" UX all collapse to a single read. Without this, every one of those features re-derives state by diffing JSON columns or re-running LLM calls — that's how planners rot.

**Sketch.** New Prisma model with `@@index([planId, createdAt])`. Wrap the four POST handlers under `app/api/plans/[id]/**` in a `recordPlanEvent()` helper. Build no UI in v1 — just `/api/plans/[id]/events` returning the list. The event-stream UI is P1.

**Risks.** None significant. JSON column means no schema-evolution pain. The trap to avoid: do not try to make `PlanEvent` the source of truth for derived state — it stays a *log*, not a substitute for `PlannedMeal.status`.

---

### 2. [P0] Profiles entity (kids and adults as first-class records)  *(M, 2-3d)*

**Pitch.** Promote eaters from prompt-text into rows. `Profile(id, familyId, name, kind: ADULT|KID, createdAt)` plus `ProfilePreference(profileId, kind: RELIABLE_HIT | HARD_NO | ASPIRATION, display, slug?)`. The intake extractor writes structured rows; the skeleton/candidate prompts read them back.

**Why it unlocks downstream work.** Today `kidRules.reliableHits` and `kidRules.hardNos` are JSON inside `WeeklyPlan.intake`. That means: kid prefs reset per plan, can't be mined across weeks for "the kids haven't had X in 3 weeks", can't be edited outside the intake chat, can't power a "kid-fit" scoring signal that learns. Profiles unlock per-kid candidate scoring, kid-rotation freshness, kid lunch packing as a future surface, and proper history when families gain a third profile (allergic guest, baby weaning).

**Sketch.** New Prisma models. Migrate intake extractor to `upsertProfilesFromIntake(intake, familyId)` — additive only, never deletes. Skeleton/candidate prompts pull from profiles, fall back to intake JSON. *No UI in v1* — preferences just accumulate. Profile editor is P1.

**Risks.** Tempting to over-design (per-profile auth, privacy, allergy severity). Cut all of it. Andrew has explicitly said don't isolate within the household.

---

### 3. [P0] `loadCanonicalCard` everywhere planner reads recipe content  *(S, <1d, audit-driven)*

**Pitch.** Audit the planner pipeline (`app/lib/planner/history.ts:41` already reads `r.parsedRecipe.cardJson` directly — good — but `scoring.ts` and any future per-recipe reasoning must too) and ensure every planner-side recipe read goes through `loadCanonicalCard()` from `app/lib/card-resolver.ts`. Add a lint rule or a comment-banner test.

**Why it unlocks downstream work.** Per-scope `RecipeOverride` is already a sharp edge: planner code that reasons about "the recipe" must reason about the *parsed* recipe, never an applied override, or the same dish scored against family-A's renamed ingredients gets a different score than the same dish for family-B. The `card-resolver.ts` module documents this distinction; we just need to enforce it.

**Sketch.** Grep audit, fix any leak, add a vitest snapshot test on a fake-Prisma layer (or — given the vitest no-Prisma rule — extract a pure helper in `card-scope.ts`-style and test that). Add a `// PLANNER: canonical-only` banner to relevant files.

**Risks.** The trap is treating this as already-done because the resolver exists. The whole point of `card-resolver.ts` is that the *call site* has to choose; choosing wrong is a silent correctness bug.

---

### 4. [P0] Pantry as a persisted `Family` resource, not a per-plan blob  *(M, 2d)*

**Pitch.** Move `intake.pantry[]` out of `WeeklyPlan.intake` JSON and into a `PantryItem(familyId, slug?, display, mustUseBy?, addedAt, addedById)` table. Grocery purchases (P1) update pantry; pantry seeds the next plan's intake automatically.

**Why it unlocks downstream work.** Two of the next things any planner-shipping team will want — "carry pantry across weeks" and "groceries you bought become pantry" — both die without this. It's also the natural home for the cascading-mise-from-purchases signal in `project_synchronized_execution.md`. With this in place, the next plan's intake chat can open with "I see you've still got the harissa and bell peppers from last week — using those?" instead of asking from scratch.

**Sketch.** Prisma model + migration. Intake extractor writes pantry rows; intake chat seeds opener from existing rows. Skeleton prompt reads from the new table. Cleanup of `WeeklyPlan.intake.pantry` deferred to a P1 backfill — leave the JSON shape intact for now to avoid breaking old plans.

**Risks.** Schema-migrations-against-prod gotcha (`CLAUDE.md` workflow section). Watch the NULL-distinct trap on `(familyId, slug)` if we add a unique constraint — slug is optional, so it's hand-rolled upsert territory like `SavedRecipe`.

---

### 5. [P1] Day-pinning with the *menu-not-calendar* invariant intact  *(M, 2d)*

**Pitch.** Add `targetDay?` (already on the model) UI surface, but resist the urge to make day assignment authoritative. Day pinning is *advisory*; commitment remains menu-shaped. Surface the day hint in QueueView and Grocery view ("the chicken wants to be cooked early in the week").

**Why it ranks lower.** It's a UX win, not a structural one. The schema field already exists. Easy to ship after P0s.

**Sketch.** PATCH `/api/plans/[id]/meals/[mealId]` accepts `targetDay`. QueueView renders a chip. Drag-to-reorder is P2.

**Risks.** Scope creep into "calendar mode." Reread `project_menu_not_calendar.md` before coding. The whole point is *not* having a Mon-Fri grid.

---

### 6. [P1] Pre-flight prompt + schema validator script  *(S, <1d)*

**Pitch.** A `scripts/validate-llm-schemas.ts` that fails CI if any Zod schema in `app/lib/planner/schemas.ts` reintroduces `.min(2)`, `.max(N)`, `.int()`, `.positive()`, or numeric `.min/.max` — the four documented Anthropic gotchas. Also fails if a prompt file mutates without a corresponding schema-snapshot test.

**Why.** The schema gotchas are tribal knowledge today. Without enforcement, the next agent who adds a planner feature will rediscover them in production. This is the cheapest insurance available.

**Sketch.** Walk the Zod tree via `_def`, assert allowed shapes only. Wire into `npm test` (vitest can run plain TS without a Prisma import — it qualifies under the path-alias rule).

**Risks.** Tiny. The Zod internals API is mildly unstable across versions, so pin the check to specific Zod 4 fields.

---

### 7. [P2 — explicitly defer] Public share-link with anonymous viewing, request-edit, per-user grants

**Pitch.** Phase-2 from `CLAUDE.md` (token public links, anonymous viewing, request-edit-access).

**Why deferred.** No user is asking. Building this pulls in token rotation, abuse prevention, anonymous-rate-limit policy, public-card SEO. The fork-by-link path covers the "share a recipe with a friend" case today.

## Sparks (3 cross-cutting provocations)

1. **The "Meezing" sync layer (memory: `project_synchronized_execution.md`) and the planner candidate-pool layer want the same primitive: a per-group, per-resource opt-in event channel.** When that connection becomes load-bearing — Andrew checks an item off the grocery list and Alicia's mise screen updates — both surfaces want the *same* eventually-consistent broadcast. Build it once. The `PlanEvent` table is half of it; SSE/server-sent over a per-family channel is the other half. *Spec the channel before you ship the second consumer.*

2. **The menu artifact and the saved recipe library should share a publish primitive.** Today `materializeCandidate()` (in the cook handler) builds a `ParsedRecipe` from a `composedCardDraft`. Tomorrow you'll want "publish this candidate to the family library before cooking it" or "save the whole week's menu as a reusable plan template." Both are the same operation: candidate-or-meal → ParsedRecipe + RecipeOverride. Refactor `materializeCandidate` into a `publishCandidate(scope: 'execute' | 'library' | 'template')` helper *now* while there's exactly one caller.

3. **Kid-fit is a feature of a profile, not a candidate.** Right now `kidFitTag: RELIABLE | STRETCH | NEW` lives on `MealCandidate`. That's wrong directionality — it'll be different per kid the moment we have two kids with divergent palates. Move kid-fit to a `(candidateId, profileId) → fit` derivation computed at scoring time. The Profiles primitive (P0 #2) makes this trivial.

## Dissent / pushback

- **"Multi-week planning / plan-template library."** Cut. The single-grocery-trip invariant is per-week. A multi-week planner is a different product; building it now forces premature abstractions on `WeeklyPlan` and the grocery rollup. Defer until at least 5 plans per family per quarter exist as evidence.

- **"Voice-first intake / Whisper transcription / hands-free cook mode."** Shrink. Intake-by-voice is a UI flourish over the existing chat — fine in P2. *Cook-mode hands-free* is a temptation that touches the execution layer, which is untouchable. Concretely: TTS is already a prototype-fragile route (`/api/tts/route.ts` proxies undocumented Translate TTS). Don't double down on voice until that route is replaced with a real provider — that's the M version: "swap TTS provider," ship it, *then* talk about voice features.

- **"Real-time collaborative intake chat" (Andrew + Alicia in the same intake conversation simultaneously).** Cut. The intake is one conversation that produces one extraction. Two simultaneous editors of one intake is high-cost (presence, conflict resolution, message ordering) for a flow that takes 90 seconds. M version: serialized intake — Alicia opens the intake, Andrew sees it as read-only, can append a "PS" message, Alicia re-extracts. That's free.

- **"Smart auto-substitution in the editor"** (any agent proposing "if you don't have shallots, swap to onion"). Defer. This sounds like a 1-day feature and is a 2-week feature once you account for unit math, ratio-aware substitution, and the LLM call. M version: just put a suggest button next to ingredients that opens a preset substitutions list. P2 unless evidence shows users actually edit ingredients pre-cook.

- **"Per-user privacy within a family."** Hard cut. Andrew has been explicit: don't isolate within the household. Anything that proposes per-user notes hidden from a spouse, or kid profiles only some adults can edit, gets pushed to P2 *and* requires explicit Andrew sign-off.

## Foundational migrations that should happen BEFORE other roadmap items

These are ordered by *dependency*. Each one, if delayed, forces the next to either work around it or migrate twice.

1. **`PlanEvent` table.** (P0 #1) Without it, every "explain the planner's reasoning" or "undo this" feature re-derives state. Ship first; it's append-only and additive.

2. **`Profile` and `ProfilePreference` tables.** (P0 #2) Eater identity needs to exist as a row before any feature that scores per-eater, learns from history, or surfaces per-eater UI. Build the table; don't build the editor yet.

3. **`PantryItem` table.** (P0 #4) Grocery-becomes-pantry, pantry-seeds-intake, and pantry-cascade-mise all want pantry as a row, not a JSON blob. Ship the table; backfill from existing `WeeklyPlan.intake.pantry` lazily.

4. **A per-family event channel primitive (SSE).** Not on the P0 list above — too speculative until two consumers exist — but the *moment* the second consumer surfaces (synchronized execution OR planner-progress live updates), do this before building either. Building two ad-hoc polling layers is the failure mode.

5. **`publishCandidate(scope)` helper extracted from `materializeCandidate`.** Refactor at zero cost while there is exactly one caller. The day a second caller appears, the helper is already there.

6. **Schema-gotcha CI guardrail.** (P1 #6) Cheap. Ship this before you ship a third LLM schema, not after.

These six unlock, between them, every P1 feature in the rest of the roadmap *and* keep the execution layer untouched (none of them mutate `app/components/Cook*.tsx`, `MisePlace.tsx`, `StepTimer.tsx`, or `app/lib/timer-state.ts`, `cook-session.ts`, `alarm.ts`).

## What I want to read in others' positions

- **From the UX/elegance agent:** which P0 of mine should they push *back* on as gold-plating? I want to be challenged on whether `PlanEvent` is over-engineered for v1.
- **From the planner-pipeline agent:** what specific failure modes of the current intake → skeleton → candidates pipeline do *they* see that profiles wouldn't fix? If the answer is "the prompts are wrong," that's a higher-leverage P0 than my schema work.
- **From the AI/LLM-perspective agent:** is there a candidate-scoring or learning loop they want to build that *requires* `PlanEvent`? If yes, that confirms P0 #1; if no, I want to know what they'd build instead.
- **From whoever owns "Meezing" / synchronized cooking:** do they want the per-family event channel built now or after one more concrete feature accumulates evidence? My instinct is "after"; theirs may legitimately be "now."
- **From everyone:** which of my dissents (multi-week planning, voice-first, real-time intake, auto-substitution) do they think I'm wrong to cut? Make the case.
