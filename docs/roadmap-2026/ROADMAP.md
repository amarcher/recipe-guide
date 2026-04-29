# Recipe Guide — Roadmap (drafted 2026-04-28)

Canonical artifact from the 9-agent roadmap exercise. Inputs: five round-1 lens papers + round-2 convergence note. Where convergence adjudicated, that call stands; see `docs/roadmap-2026/round2/00-convergence.md` for argument trail.

## Vision

Recipe Guide started as a single-recipe execution surface — paste a URL, get a calm one-screen guide that sears the steak without the user panicking. It stays that. The arc from here: single-recipe execution → weekly planner that *remembers the household* → coordinated cook nights with Alicia → menus and recipes that travel across families → a household-to-household cookbook protocol. The cast is concrete: Andrew (executor, anxious about new techniques), Alicia (decision-maker, ad-libs the cook, plans Sunday with a glass of wine), two picky kids whose preferences are *the* feedback loop the planner has been missing. The execution layer (`CookCardView`, `MisePlace`, `StepTimer`, `cook-session.ts`, `timer-state.ts`, `alarm.ts`) is sacred and stays — every direction below layers on top.

## Anchors (constraints we accept up front)

- **Execution layer is untouchable.** New features land in `SaveBar` slots, in sibling routes, or in the planner — never inside `CookCardView`. The single carve-out under consideration (post-cook share chip) is item #1 in Open Decisions. See `feedback_execution_layer_untouchable.md`.
- **Week is a menu, not a calendar.** Three lenses defended this independently. Committed meals are a pickable menu; day assignment is advisory at "pick tonight" time only. Grocery rollup fires on commit, not scheduling. See `project_menu_not_calendar.md` and `project_slot_schema_decision.md` (Option B: two `PlannedMeal` rows on split nights).
- **Opt-in synchronized execution with starter-only alarms.** Live mise + presence ("Meezing") gated by `Family.syncExecution`. Alarms stay starter-only — no fanning beeps to every device. See `project_synchronized_execution.md`.
- **Anthropic structured-output complexity budget is real.** No `minItems > 1`, no `maxItems`, no numeric `.min/.max/.int/.positive` on planner Zod schemas. `CookCardDraft` → `expandDraft()` (`app/lib/planner/card-expand.ts`) is the model: slim LLM schema, fill defaults server-side. CI guardrail (1.6) enforces this.
- **One weekly grocery trip is the forcing function.** Multi-week planning, plan templates, standing orders all violate this. Pantry, mid-week pivots, and the cascade all express "the trip is fixed; the week flexes around it."

## Settled decisions (2026-04-28)

All four answered by Andrew the day this roadmap was drafted.

1. **Post-cook share chip on the SaveBar — APPROVED.** A "Share this cook with…" chip is a permitted carve-out, slotted into the SaveBar after the photo prompt. Additive only; **does not** modify `CookCardView` itself. Phase 2 hosting work plans against this. *Unblocks: 2.17, 2.21, 2.15.*

2. **Hosted Menu visibility — PUBLIC-BY-TOKEN.** A published `WeeklyPlan` is reachable by anyone with the URL; no auth wall. `WeeklyPlan.publishedSlug` is the public handle, generated only on explicit publish action. Revocation invalidates the slug; do not reuse slugs. Implies content-moderation responsibility on the platform — see Risk register.

3. **Grocery automation Phase 3 default — AMAZONFRESH.** Replaces convergence's tentative Instacart default. `3.2 — Real partner API integration` targets AmazonFresh first; vendor-agnostic deep-link (3.1) ships independently as the universal fallback. Keep the deep-link surface partner-shaped so a second integration is a swap, not a rewrite.

4. **Family privacy stance — UNCHANGED.** No per-user privacy within a family. Kid `Profile` data is visible to all family members; `MealOutcome` rows are family-readable; `MiseCheck` stays per-user only because it's an in-flight execution detail, not a privacy boundary. 1.2 schema lands without scope columns on `Profile`/`ProfilePreference`.

## Phase 1 — "Make planning feel alive" (~2 weeks effort)

*Headline outcome the user will feel: the planner remembers my kids, my pantry stops resetting every Sunday, candidates have faces instead of paragraphs, and Tonight tells me what to cook in one screen.*

### 1.1 — PlanEvent log

- **Pitch.** Append-only mutation log for the planner pipeline. Every skeleton/candidate/commit/grocery write goes through `recordPlanEvent()`. No UI in v1.
- **Why now.** Foundation for undo, regression tests, "show me why" UX, and all observability. Without it, every future feature re-derives state from JSON columns.
- **Owner lens.** Architect (P0 #1).
- **Implementation sketch.** `PlanEvent(planId, kind, payload Json, createdAt, actorId)` indexed `(planId, createdAt)`. Wrap the four POST handlers under `app/api/plans/[id]/**`. Read-only endpoint at `/api/plans/[id]/events`. UI lands Phase 2 with FamilyEvent.
- **Size.** S.
- **Unblocks.** 2.13, 2.15, future reasoning UI.
- **Risks.** Drift into PlanEvent as source-of-truth. It stays a *log*; `PlannedMeal.status` remains authoritative.

### 1.2 — Profile + ProfilePreference

- **Pitch.** Promote eaters from `WeeklyPlan.intake.kidRules` JSON into longitudinal rows that accumulate preferences across weeks.
- **Why now.** Today kid prefs reset every plan. Without rows, the planner can't learn from cook outcomes — Alicia retypes "Ezra hates onions" every Sunday.
- **Owner lens.** Caretaker (P0) + architect (P0 #2).
- **Implementation sketch.** `Profile(id, familyId, name, kind: ADULT|KID, ageBand?, avatarColor?, createdAt)` and `ProfilePreference(profileId, kind: RELIABLE_HIT|HARD_NO|ASPIRATION|EXPERIMENTING, slug?, display, source, lastConfirmedAt, evidenceCount)`. Lazy backfill — intake extractor calls `upsertProfilesFromIntake(intake, familyId)` (additive only). Skeleton/candidate prompts in `app/lib/planner/prompts.ts` read from new tables, fall back to intake JSON. `kidFitTag` on `MealCandidate` becomes a computed `(candidateId, profileId) → fit` derivation. `hardFilterReason` in `scoring.ts` reads `ProfilePreference.kind = HARD_NO`. No editor UI in v1.
- **Size.** M.
- **Unblocks.** 2.15, per-profile scoring, kid-rotation freshness.
- **Risks.** Gold-plating into a palate matrix or per-profile auth. Convergence cut both.

### 1.3 — PantryItem + grocery write-back

- **Pitch.** Pantry escapes `WeeklyPlan.intake.pantry` JSON into a `Family`-scoped table. Marking a `GroceryItem` purchased upserts into `PantryItem`; next Sunday's intake seeds from existing rows.
- **Why now.** Three of five lenses converged. Foundational for the cascade (1.12), delegate share (2.19), and any smart-reorder later. Direct user ask.
- **Owner lens.** Caretaker (P0) + plan-execution (P1) + architect (P0 #4).
- **Implementation sketch.** `PantryItem(id, familyId, slug?, display, unit?, quantity?, mustUseBy?, addedAt, addedById, source: GROCERY|MANUAL|COOK_DEDUCT)`. Hand-rolled upsert on `(familyId, slug, unit)` per the NULL-distinct trap. `GroceryItem.purchased = true` triggers upsert with `source = GROCERY`. `mustUseBy` heuristic per slug class. Skeleton prompt reads `PantryItem` as an injected block; `mustUseHits` in `scoring.ts` reads `PantryItem.mustUseBy < weekEnd`. `/family/pantry` page optional in P1.
- **Size.** M.
- **Unblocks.** 1.12, 2.19, 3.3.
- **Risks.** Inventory rot if unused. Mitigation: pantry is signal, never a hard constraint; grocery write-back is the only auto-update path.

### 1.4 — `loadCanonicalCard` audit

- **Pitch.** Grep + banner pass enforcing every planner-side recipe read goes through `loadCanonicalCard()` from `app/lib/card-resolver.ts`. Planner reasons about the *parsed* recipe, never an applied override.
- **Why now.** Per-scope `RecipeOverride` is a sharp edge. Same dish scored against family-A's renamed ingredients gets a different score than family-B's — silent correctness bug.
- **Owner lens.** Architect (P0 #3).
- **Implementation sketch.** Audit `app/lib/planner/history.ts` (already correct), `app/lib/planner/scoring.ts`, `app/api/plans/[id]/skeleton/route.ts`, `.../candidates/route.ts`. Add `// PLANNER: canonical-only` banners. Extract testable helpers into a Prisma-free module (mirror `card-scope.ts` next to `card-resolver.ts`).
- **Size.** S.
- **Unblocks.** Every future planner reasoning feature.
- **Risks.** Treating it as already-done because the resolver exists.

### 1.5 — `publishCandidate(scope)` refactor

- **Pitch.** Extract `materializeCandidate` from the cook handler into a `publishCandidate(scope: 'execute' | 'library' | 'menu')` helper while caller count is exactly one.
- **Why now.** Phase 2 hosted menu (2.17) and future plan templates both want this same operation. Refactor at zero cost now.
- **Owner lens.** Architect (P0 #5, spark #2).
- **Implementation sketch.** Pull materialize logic from `app/api/plans/[id]/meals/[mealId]/cook/route.ts` into `app/lib/planner/publish.ts`. Cook handler becomes a thin caller with `scope: 'execute'`. Library/menu scopes inert in Phase 1.
- **Size.** S.
- **Unblocks.** 2.17, future plan templates.
- **Risks.** None significant.

### 1.6 — Schema-gotcha CI guardrail

- **Pitch.** `scripts/validate-llm-schemas.ts` walks the Zod tree in `app/lib/planner/schemas.ts` and fails CI on `.min(2+)`, `.max(N)`, `.int()`, `.positive()`, or numeric `.min/.max`.
- **Why now.** The four Anthropic gotchas are tribal knowledge. Next agent rediscovers in production without enforcement. Cheapest insurance available.
- **Owner lens.** Architect (P1 #6).
- **Implementation sketch.** Walk Zod `_def` internals. Wire into `npm test` — Prisma-free, qualifies under vitest path-alias rule.
- **Size.** S.
- **Unblocks.** Every future planner LLM feature.
- **Risks.** Zod 4 internals are mildly unstable; pin to specific fields.

### 1.7 — MoodTag auto-tagging on candidates

- **Pitch.** `MealCandidate.moodTags String[]` from a fixed `MoodTag` enum (`FAST_FORGIVING`, `EARNED_EFFORT`, `USE_IT_UP`, `KID_APPROVED`, `LEFTOVER_FRIENDLY`, `ONE_PAN`). Replaces day grid as decision signal.
- **Why now.** Alicia chooses by mood, not day. `targetDay` stays advisory at Tonight pick only.
- **Owner lens.** Visual-design (P0).
- **Implementation sketch.** `moodTags` column on `MealCandidate`. `scoreAndRankPlan` derives tags from existing signals (cook-time → FAST_FORGIVING, mustUseHits → USE_IT_UP, kid streak → KID_APPROVED). No LLM call. Renders as small-caps Fraunces eyebrows, max one per tile.
- **Size.** S.
- **Unblocks.** 1.9, filter chips on MenuView.
- **Risks.** Scope creep into LLM-driven inference — resist.

### 1.8 — `<MealFace />` primitive

- **Pitch.** Single shared component for any meal-shaped object (candidate, planned meal, menu item) in `photo | vignette | swatch` states. Promoted from `RolodexTile`'s mode logic.
- **Why now.** Three lenses converged on the same component. Build once or maintain three siblings later.
- **Owner lens.** Visual-design + caretaker.
- **Implementation sketch.** New `app/components/MealFace.tsx`. Props: `{ subject: { photoUrl?, heroIngredientSlugs, title, tagline?, moodTag? }, size: 'tile' | 'spread' | 'peek' }`. Reuses `VignetteArea` algorithm (rotated overlapping sprites, ochre drop shadows). Caption ladder: title in `font-serif text-[18px]`, tagline italic, mood tag small-caps eyebrow.
- **Size.** M.
- **Unblocks.** 1.9, 1.10, 2.17.
- **Risks.** Asymmetric tile heights breaking grid — solve with masonry or fixed-aspect. Vignette quality depends on hero-slug coverage; planner already calls `discoverSprites` for misses.

### 1.9 — Candidate tile redesign

- **Pitch.** Replace `MenuView`'s text-block candidate cards with `<MealFace />` tiles. One mood eyebrow, one tagline, hero-sprite vignette, no badge soup.
- **Why now.** Andrew: candidates today have *"no preview ability of what the meal might look like or feel like."* Choosing dinner is a desire problem.
- **Owner lens.** Visual-design (P0) + caretaker (spark #3).
- **Implementation sketch.** New `app/plan/[id]/CandidateTile.tsx` composes `<MealFace size="tile" />`. Replaces text blocks in `MenuView.tsx`. Long-press triggers peek sheet with View Transitions API morph; falls back to Framer-Motion shared-layout. Commit becomes a ribbon-fold microinteraction.
- **Size.** M.
- **Unblocks.** 1.10, 2.17.
- **Risks.** Long-press conflicts with mobile scroll — provide explicit preview affordance.

### 1.10 — Tonight surface (`/plan/[id]/tonight`)

- **Pitch.** Second view of the same plan, optimized for 5pm. Two columns on split nights, one otherwise. Each column is `<MealFace size="spread" />` with a Cook CTA. Bottom strip: grocery gaps + "start in N min" countdown.
- **Why now.** Most-named friction in round 1 — the post-commit cliff between `/plan/[id]` and `/recipe/[id]`.
- **Owner lens.** Plan-execution (P0) + caretaker (P0) + visual-design (P0).
- **Implementation sketch.** Server route `app/plan/[id]/tonight/page.tsx` queries `plan.meals.where(status: QUEUED)` ordered by `targetDay` then `slot`. Falls back to "Pick tonight" chooser that sets `targetDay = today` on tap. Client `TonightView` composes `<MealFace />` per column + `startCookingSession`. Tapping Cook drops into existing `CookCardView` (no render-mode fork). Tablet UA defaults here after first cook.
- **Size.** L.
- **Risks.** Mobile two-column real estate — single-column with "switch cook" affordance, not split-screen.

### 1.11 — Mode chooser at plan creation

- **Pitch.** One-tap chooser before intake: `[Use up] [Explore] [Survival]`. Pre-fills intake and skips half the questions.
- **Why now.** Alicia named the three modes (`stakeholders.md`). Cheapest UX win in Phase 1.
- **Owner lens.** Caretaker (promoted by convergence).
- **Implementation sketch.** `WeeklyPlan.mode: PlanMode` enum (`USE_UP|EXPLORE|SURVIVAL`). Chooser before intake chat. Pre-seed `IntakeMessage` with a synthetic user message ("survival week — fast and forgiving, kid-friendly") so existing extraction pipeline keeps working.
- **Size.** S.
- **Risks.** None significant.

### 1.12 — Grocery → mise cascade (no SSE)

- **Pitch.** `GroceryItem.purchased = true` → every queued `PlannedMeal` whose canonical card uses that slug shows pre-checked in mise. Basket glyph distinguishes from manual; `source = GROCERY`.
- **Why now.** Direct line from `project_synchronized_execution.md`. Convergence: ship via tab-load reconciliation in Phase 1, not SSE — sub-second presence isn't needed for Sunday-purchase / Wednesday-cook.
- **Owner lens.** Plan-execution (P1) + caretaker (P0) + architect (spark #1).
- **Implementation sketch.** `MiseCheckShared(savedRecipeId, familyId, entryKey, checkedById, checkedAt, source: MANUAL|GROCERY|LEFTOVER)` as sibling to `MiseCheck` (convergence's call — don't migrate per-user table). Hook into `PATCH /api/plans/[planId]/grocery/[id]`; after purchase, run `rebuildMiseCascadeForPlan(planId)` resolving slug → queued meals' canonical `entryKey`s. `MisePlace` renders cascaded checks with basket overlay. Reads on tab load.
- **Size.** M.
- **Blocked by.** 1.3 + sibling table.
- **Unblocks.** 2.13, 2.14.
- **Risks.** Slug normalization with three callers — Vitest coverage in Prisma-free helpers.

### 1.13 — Transparent-background sprite regeneration (gpt-image-1)

- **Pitch.** Swap the sprite generation pipeline from Gemini 2.5 Flash Image (white-background photoreal, `scripts/generate-sprites.mjs`) to OpenAI `gpt-image-1` with `background: "transparent"`. Regenerate all 222 manifest sprites so still-life compositions become *ingredients floating on cream paper, shadows mingling* — not overlapping white squares on a wash.
- **Why now.** Foundational visual upgrade added by Andrew on 2026-04-28. Ships *before* 1.8 `<MealFace />` so the new component debuts with the new aesthetic. Without it, the visual designer's "still life as a first-class compositional language" spark is undermined: hard white sprite edges fight every shadow and overlap. Also raises the ceiling on 2.17 Hosted Menu — the most visually load-bearing surface in the roadmap.
- **Owner lens.** Visual-design (user-elevated 2026-04-28).
- **Implementation sketch.**
  - Modify (or fork) `scripts/generate-sprites.mjs`. Replace the Gemini REST call with `images.generate({ model: "gpt-image-1", background: "transparent", size: "1024x1024", prompt })` from `openai` SDK. Reuse the existing `style_prompt` + per-entry `label`/`aliases` from `sprites/manifest.json`. Add to the prompt: *"isolated subject, no background, no surface, no shadow"* — composition shadows live in CSS `drop-shadow` so they can mingle.
  - Same Blob layout: `sprites/{slug}.png` (display 512px, downscaled), `sprites/originals/{slug}.png` (1024 original). Manifest fields `url` + `original_url` rewritten on success.
  - `/api/sprites/discover` (Vercel function) gets the same provider swap so on-demand sprites match.
  - Run regeneration in batches of ~30; sample-verify visually before full backfill. Keep the existing Gemini sprite blob keys until all new sprites verified, then promote.
  - **Translucent-ingredient handling.** Some entries (broth, milk, vinegar, oil) won't render well as fully transparent. Mark these in the manifest with `compose: "carafe"` or `compose: "puddle"` so the prompt asks for a contained vessel/puddle and CSS still drop-shadows correctly.
- **Size.** M (1-3d).
- **Blocked by.** OpenAI API key + billing in `.env.local` and the Vercel project. ~$30-50 one-time regen cost across the catalog.
- **Unblocks.** 1.8 `<MealFace />` aesthetic, 1.9 candidate tile redesign, 2.17 Hosted Menu artifact, every still-life surface.
- **Risks.** Style coherence drift across the regenerated catalog — calibrate with one anchor sprite, eyeball the next 5, then batch. Some translucent ingredients need the `compose` annotation above. Keep originals so we can rollback per-slug if needed. Provider lock-in is real but reversible — the manifest already abstracts which model produced the file.

## Phase 2 — "Connect the household" (~3-4 weeks effort)

*Headline outcome the user will feel: Alicia's grocery purchases pre-check my mise, the kids' thumbs train the planner, our Saturday dinner has a publishable menu my mother-in-law screenshots, and the grocery list goes to whoever's at Costco.*

### 2.13 — FamilyEvent channel + SSE

- **Pitch.** Per-family event bus. One table, one SSE channel. Plan events, mise checks, gift acceptances, kid outcomes, presence pings fan out.
- **Why now.** Phase 1 ships first consumer (cascade); Phase 2 brings three more. Architect's "build for the second consumer" rule kicks in.
- **Owner lens.** All five lenses.
- **Implementation sketch.** `FamilyEvent(familyId, kind, planId?, savedRecipeId?, payload, actorId, createdAt)` indexed `(familyId, createdAt)`. SSE route `app/api/families/[id]/events/route.ts` (`runtime: "nodejs"`). Postgres `LISTEN/NOTIFY` over Neon. Chunk to 60s reconnects; reconnect re-syncs from `where createdAt > lastSeenAt`. 5s polling fallback ships side-by-side.
- **Size.** L.
- **Unblocks.** 2.14, 2.15, 2.21.
- **Risks.** SSE on Vercel is annoying — polling fallback is not optional.

### 2.14 — Meezing presence + shared mise

- **Pitch.** When `Family.syncExecution = true`, mise checks broadcast in seconds. Presence ribbon on the SaveBar shows who else is in the card. Alarms stay starter-only.
- **Why now.** Headline collaboration feature from `project_synchronized_execution.md`. Wires the existing `Family.syncExecution` flag. Lives in SaveBar slot — does not touch `CookCardView`.
- **Owner lens.** Plan-execution (P1) + sharing.
- **Implementation sketch.** `useMiseChecks(recipeId)` in `app/lib/storage.ts` gains `mode: "personal" | "shared"`; SaveBar decides via `viewerAccess` + `family.syncExecution`. `MiseCheckShared` (from 1.12) is the storage. Live channel via 2.13. Reset mid-cook via SaveBar overflow — soft-deletes shared rows only. Cascaded grocery checks visually distinct from manual shared checks (basket glyph vs actor-avatar pulse).
- **Size.** L.
- **Blocked by.** 2.13.
- **Risks.** A remote check popping a tile while you're looking at it is disorienting — use ghost border / actor pulse, not a silent flip.

### 2.15 — MealOutcome capture + Profile learning

- **Pitch.** Post-cook 5-second per-eater thumbs prompt slotted into the photo-prompt flow on the SaveBar. Persists as `MealOutcome` rows feeding `ProfilePreference.evidenceCount`.
- **Why now.** Without it, Profiles never learn. Caretaker's whole P0 case rests on this loop closing.
- **Owner lens.** Caretaker (P1) + architect.
- **Implementation sketch.** `MealOutcome(plannedMealId, profileId?, eaterRole: ADULT|KID, verdict: ATE|PICKED|REFUSED, notes?, createdAt)`. UI hooks into `CookPhotoPrompt` placement — not inside `CookCardView`. 3× ATE → promote slug to `RELIABLE_HIT`; 2× REFUSED → demote to `EXPERIMENTING` (never auto-create `HARD_NO`). Slugs sourced from `composedCardDraft` via existing `findSprite` matcher.
- **Size.** M.
- **Blocked by.** 1.2.
- **Risks.** Friction. Skippable, default-collapsed, "same as last time" one-tap. Andrew won't use it — Alicia's loop.

### 2.16 — Mid-week pivot affordances

- **Pitch.** Three overflow actions on each `QueueRow`: **Skip**, **Cooked from leftovers**, **Swap for another candidate**.
- **Why now.** Schema has `SKIPPED`; UI doesn't expose it. Without these, Wednesday-night reality breaks the model.
- **Owner lens.** Plan-execution (P1).
- **Implementation sketch.** `PATCH /api/plans/[id]/meals/[mealId]` already accepts status changes; add `notes` passthrough. `QueueRow` grows a Lucide `MoreHorizontal` overflow. Swap sheet reuses `MealCandidate` rows for the `(slot, eaters)` group. On Skip/Swap, re-run `rebuildGroceryForPlan`. If the cascade pre-checked mise on a now-skipped meal, leave the grocery item purchased but the cascade row dies with the meal. "Cooked from leftovers" needs `PlannedMeal.cookLogId?` for leftover-photo attach.
- **Size.** M.
- **Risks.** State sprawl on `PlannedMeal.status` — keep enum tight.

### 2.17 — Promoted-plan Hosted Menu

- **Pitch.** Publish a `WeeklyPlan` to `/menu/[slug]` as a typeset shareable artifact: Fraunces titles, ingredient vignettes, "from the kitchen of [family], the week of April 28," kid-mode toggle, OG image, ICS export. *Promoted plan*, not a separate noun (convergence demoted XL `HostedMenu` table to M).
- **Why now.** Direct user ask: "publishing a menu for guests." Forces the system to handle a public read-only object as a first-class noun.
- **Owner lens.** Sharing (P0) + caretaker (P2) + visual-design (P1).
- **Implementation sketch.** `WeeklyPlan.publishedSlug?`, `publishedAt?`, `hostNote?`, `dietaryNote?` + thin `WeeklyPlanMenuItem(plannedMealId, courseLabel, displayBlurb?, snapshotCardJson)`. Snapshot at publish time via 1.5's `publishCandidate(scope: 'menu')`. Route `/menu/[slug]/page.tsx` (public, no auth). Reuses Tonight components in published mode. OG via `next/og`. ICS at `/menu/[slug].ics`. Kid-mode: same data, bigger sprites, simplified copy from a small LLM call.
- **Size.** L.
- **Blocked by.** 1.5, 1.8.
- **Unblocks.** 2.20.
- **Risks.** Visibility default is Open Decision #2. Content moderation — see Risk register #3. Scope creep into RSVP — resist.

### 2.18 — Sprite-driven grocery list

- **Pitch.** Convert `GroceryList.tsx` from a vertical checkbox list to a shop-aisle grid mirroring `MisePlace`'s tile layout — 60px sprites, aisle eyebrows, haptic tap-to-cart.
- **Why now.** Grocery list is the most-used surface *outside the home*. Today it's the most utilitarian; it deserves to be the most visceral.
- **Owner lens.** Visual-design (P1).
- **Implementation sketch.** Refactor `app/plan/[id]/GroceryList.tsx` to compose `MisePlace`'s tile layout, gated on Shop/List toggle (default Shop). Aisle grouping in `app/lib/taxonomy.ts` (`AISLES`, `AISLE_LABEL`); rollup endpoint returns `aisle`. `navigator.vibrate(15)` via existing `vibrate` helper. Default-collapse purchased items per aisle.
- **Size.** M.
- **Unblocks.** 2.19.
- **Risks.** Scroll length — aisle collapse handles it.

### 2.19 — Delegate grocery share

- **Pitch.** Token-share the grocery list (Alicia at Costco, babysitter at Whole Foods). Recipient sees the sprite list, marks purchased on their phone; writes flow back into pantry + cascade.
- **Why now.** Convergence's NEW USER INPUT placement — highest-confidence grocery automation. Reuses gift-token pattern parametrized for grocery.
- **Owner lens.** Sharing + NEW user input.
- **Implementation sketch.** `GroceryListShare(planId, token unique, sharedWithEmail?, expiresAt?, revokedAt?)`. Anonymous read+write at `/grocery/[token]` reuses 2.18 grid. Purchase writes go through `PATCH /api/plans/[planId]/grocery/[id]` logic — idempotent on entryKey.
- **Size.** L.
- **Blocked by.** 1.3, 2.18.
- **Unblocks.** 3.1.
- **Risks.** Token leakage. Optional expiry, one-click revoke. Vercel edge limits + opaque tokens cover v1.

### 2.20 — Public recipe share token

- **Pitch.** `RecipeShareToken` + `/r/[token]` for anonymous read with fork CTA. Friends don't have to sign up.
- **Why now.** `CLAUDE.md` Phase 2 deferred section. Convergence reactivated because 2.17 is opening public-read anyway.
- **Owner lens.** Sharing (P0).
- **Implementation sketch.** `RecipeShareToken(savedRecipeId, token unique, createdById, expiresAt?, revokedAt?, viewCount)`. `GET /api/share/[token]` resolves to the existing guest-branch payload of `GET /api/recipes/[id]` (override-applied card, no cookHistory). `/r/[token]` reuses `CookCardView` + "Save to your library — sign in" CTA. **Don't mutate `requireUser()` on `/api/recipes/[id]` itself** — keep token-scoped reads on a separate route.
- **Size.** M.
- **Unblocks.** Phase 3 cross-family discovery.
- **Risks.** Token leakage — same mitigation as 2.19.

### 2.21 — Notification inbox (no comments)

- **Pitch.** Inbox at `/inbox` surfaces gifts, hosted-menu RSVPs, "Alicia tuned the planner," kid outcomes, photo notifications. Each item links to the artifact. **No threaded comments** — convergence cut them as Slack-for-cooking risk.
- **Why now.** Closes gift / menu / outcome loops without falling back to email.
- **Owner lens.** Sharing (P1, scoped down by convergence).
- **Implementation sketch.** `Notification(userId, type enum, payload Json, readAt?, actorUserId?, createdAt)` indexed `(userId, readAt, createdAt)`. Server-side fan-out on source artifacts' write paths. In-app badge + optional email digest — **no web push**.
- **Size.** M.
- **Blocked by.** 2.13 preferred but not strict.
- **Risks.** Becomes Slack-for-cooking. Hard cap: per-event, no threading, no DMs.

## Phase 3 — "Compound the network" (ongoing)

*Headline outcome the user will feel: the more we use it, the more it learns; the more we share, the more it grows.*

Phase 3 is evidence-gated — each item ships only when the previous's adoption justifies the next. None start before Open Decision #3 is answered.

### 3.1 — Vendor-agnostic deep-link grocery export

- **Pitch.** "Send to Instacart / Walmart / AmazonFresh" opens a pre-filled deep link; clipboard fallback.
- **Why now.** Pantry consumer #4. Build the schema-out side once; 3.2 reuses it.
- **Owner lens.** Convergence — NEW user input.
- **Implementation sketch.** `app/lib/grocery-export.ts` maps `GroceryItem[]` → per-vendor URL templates. UI: "Send to…" dropdown on grocery view.
- **Size.** M.
- **Risks.** Vendor templates drift; pin and document.

### 3.2 — Real partner API integration (default pending Open Decision #3)

- **Pitch.** OAuth-grade integration with the chosen partner: cart hand-off, order status, optional re-order from past plans.
- **Why now.** Only after 2.19 + 3.1 prove the use case. Partnership-shaped, multi-week.
- **Size.** XL+.
- **Risks.** Exit cost is high; pick deliberately.

### 3.3 — Smart re-ordering

- **Pitch.** "You buy pancetta every other week — auto-add?" Requires 3+ months of `MealOutcome` + `PantryItem` history.
- **Why now.** Useless without data.
- **Size.** M (algorithm) + L (UI).
- **Risks.** Surprises in the cart erode trust — confirmation UX is the problem.

### 3.4 — Cross-family `RecipeShelf` ("family of families")

- **Pitch.** Two family libraries link at a recipe-set level — a shared shelf, not a merged family.
- **Why now.** No second family in the system today. Phase 3 if adoption brings one.
- **Implementation sketch.** `RecipeShelf(id, name, createdById)` + `ShelfMember(shelfId, familyId)` + `ShelfRecipe(shelfId, parsedRecipeId, addedByUserId, addedFromFamilyId, addedAt)`. New resolver branch in `card-resolver.ts`. Watch NULL-distinct trap.
- **Size.** L.
- **Risks.** Permission-model proliferation. Document precedence in `card-resolver.ts` once.

### 3.5 — Cross-family `RecipeGift` with lineage

- **Pitch.** One-tap gift with in-app accept and override snapshot at gift time.
- **Why now.** Defer until 2.20 ships and four-step text-it-paste-it friction is observed.
- **Size.** L.
- **Risks.** Email enumeration — require a shared family or prior gift before email-gifting works.

### 3.6 — Friends graph + activity feed

- **Pitch.** Asymmetric follow relationship. Per-`CookLog` `visibility: PRIVATE | FRIENDS | PUBLIC`. Feed unions friend cooks + Hosted Menus.
- **Why now.** Andrew has zero documented friends in the app today. Phase 3 only if hosted menus prove publish use *and* a contact-import path is committed.
- **Size.** L.
- **Risks.** Privacy regressions are catastrophic. Default PRIVATE; per-artifact visibility, never per-user flags.

## What we explicitly cut

Documented here so future sessions don't re-litigate. See convergence doc for fuller argument.

- **"Just the gist" Alicia render mode** — risks `CookCardView` drift; Alicia ad-libs by ignoring timers anyway.
- **Voice-driven intake / hands-free cook** — Alicia plans with wine, not voice; TTS route is prototype-fragile; execution layer untouchable.
- **Real-time collaborative intake chat** — 90-second flow doesn't justify presence/conflict-resolution; serialized "PS" appends cover it.
- **Smart auto-substitution in editor** — 2-week feature once unit math is real; insufficient evidence users edit pre-cook.
- **Multi-week planning / plan templates** — violates one-grocery-trip-per-week invariant.
- **Calendar grid view** — `targetDay` advisory at Tonight pick only.
- **Friends graph / activity feed (Phase 1-2)** — no friends in the system. Reactivated as Phase 3 with a contact gate.
- **`RecipeComment` threads** — Slack-for-cooking risk; reduced to Notification only.
- **Cross-family `RecipeShelf` (Phase 1-2)** — no second family yet. Phase 3 when adoption justifies.
- **Profile editor UI (Phase 1)** — accumulate preferences first; build editor only on user complaint.
- **Step-claim "on deck"** — over-formalization for two adults in one kitchen.
- **Library Rolodex carousel + motion-language audit** — polish, not roadmap-shaped.

## Risk register

1. **SSE on Vercel doesn't survive Fluid timeout.** Ship 2.13 with a 5s polling fallback against an aggregate version key, side-by-side from day one.
2. **NULL-distinct unique-constraint trap on `(userId, familyId)` schemas.** Every new scoped table does hand-rolled `findFirst → create | update`, never naive `upsert`. Don't pre-emptively migrate to `RecipeOverrideScope` — only if 3.4 ships.
3. **Content moderation once public artifacts ship (2.17, 2.20).** Takedown policy + explicit publish gate (Open Decision #2) before Phase 2 lands. Family-only-by-default ships unmoderated; public-by-token needs a content-review path.
4. **Anthropic schema complexity creep.** 1.6 ships in Phase 1 before any new planner LLM schema. Future agents read `app/lib/planner/schemas.ts` comments first.
5. **Sprite generation cost on candidate regeneration.** Reuse cached `MealCandidate` slugs; on miss, `discoverSprites` runs at parse time, not per regen. Monitor via `DASHBOARD_DATABASE_URL`.
6. **Translate TTS is prototype-fragile.** Any new TTS consumer (kid-mode read-aloud, Tonight narration) blocks on swapping `app/api/tts/route.ts` to a real provider first.

## Test & observability strategy

**Today.** Vitest is set up (`*.test.ts` colocated). Unit tests cover `scale.ts` and `duration.ts` (commit `8ad272f`). Critical constraint: **Vitest has no path-alias setup; anything importing `@/app/lib/prisma` fails to load.** Pattern: extract Prisma-free helpers into sibling modules (e.g., `card-scope.ts` next to `card-resolver.ts`), test those. No integration tests; observability is `console.log` and Vercel request logs.

**Phase 1 additions.** 1.4 extracts a Prisma-free helper for snapshot tests. 1.6 ships as a Prisma-free guardrail in `npm test`. 1.12 extends `aggregate.test.ts` for cascade slug-normalization. **1.1 (PlanEvent) is the observability primitive** — every planner mutation writes one event; `/api/plans/[id]/events` is the read path for regression tests, A/B prompt comparison, and future "show me why" UX.

**Phase 2 additions.** 2.13 (FamilyEvent) extends the PlanEvent pattern household-wide. Cascade tests grow to cover purchase → unpurchase round-trip via a new `app/lib/cascade-core.ts` (Prisma-free). 2.17 snapshot-at-publish gets a golden test on the snapshot transformer. 2.21 — write-path tests on fan-out only.

**Phase 3.** 3.3 needs `prisma/seed-history.ts` for realistic 12-week histories. 3.4 cross-family resolver branches get golden snapshot tests per scope-precedence path.

Pattern across phases: **extract a Prisma-free pure-function module next to every Prisma-bound module** (`*-core.ts` / `*-scope.ts`), test the core, keep the Prisma-bound layer a thin shell.

## Cross-cutting patterns we'll reuse

**`<MealFace />` (1.8).** Shared component for any meal-shaped object in `photo | vignette | swatch` states. Used by 1.9 (candidate tile), 1.10 (Tonight `size="spread"`), 2.17 (hosted menu published mode), 3.6 if it ships. Replaces ad-hoc `RolodexTile` clones, the sprite-thumbnail row in current `MenuView`, the `SwatchCopy` fallback.

**`<StillLife>` (promoted from `RolodexTile.VignetteArea`, visual-design spark #2).** Takes hero ingredient slugs + mood; renders the rotated-overlapping-sprites-with-warm-shadows aesthetic. Used by: vignette mode of `<MealFace />`, 2.17 hero compositions, 2.18 aisle headers, library empty state, OG images for 2.17 and 2.20. Replaces inline vignette code and ad-hoc sprite clusters in three places.

**Per-family event channel (architect's spark + plan-execution's #2/#3).** One `FamilyEvent` table, one SSE stream, multiple consumers — 2.13 (channel), 2.14 (Meezing), 2.15 (MealOutcome attribution), 2.21 (Notification fan-out), 3.6 (if it ships). Replaces every ad-hoc polling layer that would otherwise grow up per-consumer. PlanEvent (1.1) is the single-plan precursor; FamilyEvent extends household-wide when the second consumer surfaces.

**`source` provenance enum on every cascade-fed table.** `MiseCheckShared.source`, `RecipeOverride.source`, `ProfilePreference.source`, `PantryItem.source`. Adopt cross-table so "why is this thing the way it is" is always answerable.

## Glossary (for future Claude sessions)

- **Meezing.** Live, shared mise — when one family member checks "got the olive oil out," the rest see it. Opt-in via `Family.syncExecution`. From `project_synchronized_execution.md`.
- **MealFace.** Phase 1 component (1.8). Shared rendering of any meal-shaped object in photo / vignette / swatch states.
- **PlanEvent.** Phase 1 table (1.1). Append-only mutation log scoped to one `WeeklyPlan`. The observability primitive; extends to FamilyEvent in Phase 2.
- **RecipeOverrideScope (proposed refactor).** Sharing-network spark #2. Replaces the `(userId, familyId)` NULL-distinct nullable-pair with a `RecipeOverrideScope(overrideId, scopeType enum, scopeId)` label-set model. **Not in Phase 1 or 2.** Reactivate only if 3.4 ships.
- **HostedMenu.** Convergence demoted the original XL `HostedMenu` table to "promoted plan" — `WeeklyPlan.publishedSlug` + `WeeklyPlanMenuItem`. User-facing concept stays "hosted menu"; schema is plan-shaped.
- **The 3 modes (use-up / explore / survival).** Alicia's three planning vibes from `stakeholders.md`. Surfaced as 1.11.
- **Tonight surface.** `/plan/[id]/tonight` (1.10). Post-commit answer to "what are we cooking, who's cooking what, when do I start." Alicia's home; tablets default here after first cook.
- **Two-track cook session.** Plan-execution's round-1 P0 #2, absorbed into 1.10's sketch and 2.14's presence work. Current `cook-session.ts` is singleton; on Option B split nights we want two `CookCardView` instances alive with independent timer namespaces. Lands when Phase 1 Cook CTAs surface the constraint.
- **Cascade.** Plan-execution spark #3, adopted across all five lenses. Mental model: grocery purchase → mise pre-check → step ready → cook finish → CookLog → photo → library tile. Phase 1 ships the first link (1.12); Phase 2 makes it live; Phase 3 connects outcomes back into next week's plan.

---

This file and `docs/roadmap-2026/round2/00-convergence.md` are the canonical pair. When in doubt: this file wins on plan, convergence wins on argument, CLAUDE.md wins on current architecture.
