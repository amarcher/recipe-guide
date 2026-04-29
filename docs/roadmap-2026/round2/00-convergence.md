# Round 2 — Convergence

The five lenses (caretaker, plan-execution, visual-design, sharing-network, architect) agree more than the round-1 prompt suggested. This locks in the backlog the next three round-2 agents work from.

## What everyone agrees on

- **A "Tonight" surface is the highest-leverage post-commit affordance.** Caretaker calls it "Plan Execution View"; plan-exec calls it `/plan/[id]/tonight`; visual-design calls it MenuSpread + Peek; sharing-network reuses it for hosted menus. All five converge on *one* tablet-grade surface answering "what are we cooking, who's cooking what, when do I start" without entering `CookCardView`.
- **Eaters become rows, not JSON.** Caretaker (`KidProfile`) and architect (`Profile`) independently arrived at the same primitive — kids stop being a JSON blob in `WeeklyPlan.intake.kidRules` and become longitudinal records that learn. Plan-exec and sharing-network both depend on this for outcome capture and gift attribution.
- **Pantry escapes `WeeklyPlan.intake`.** Caretaker, plan-exec, architect all want a persisted `PantryItem(familyId, …)` table. Grocery → pantry → next-week's intake is a single causal chain that today reboots every Sunday.
- **Candidate tiles are too text-heavy.** Caretaker's "Instagram, less than a database" spark, visual-design's full P0 redesign, and plan-exec's Tonight tile composition all converge on a `RolodexTile`-shaped vignette/photo tile.
- **Menu, not calendar — settled.** Three lenses defended `project_menu_not_calendar.md`; architect demoted day-pinning to advisory P1.
- **Materialization is a publish primitive.** Architect's `publishCandidate(scope)` and sharing-network's hosted-menu snapshotting are the same operation. Refactor while caller count = 1.
- **The cascade is the unifying mental model.** Plan-exec stated it; caretaker (grocery → pantry), architect (event log), sharing-network (gift snapshots) all encode the same `source` enum pattern.
- **Per-family event channel is the right primitive for sync, presence, progress, and notifications.** Spec once.
- **Execution layer (`CookCardView`, `MisePlace`, `StepTimer`, `cook-session.ts`, `timer-state.ts`, `alarm.ts`) stays untouched.** The only proposed carve-out is sharing-network's post-cook share chip on the SaveBar — flagged for Andrew below.

## Where they disagree (and my call)

**1. SSE/realtime now or on second consumer?** Plan-exec implies SSE in P1; architect says wait for the second consumer. **Call:** ship the grocery → mise cascade in Phase 1 via tab-load reconciliation (no live channel); SSE/`LISTEN/NOTIFY` lands Phase 2 when Meezing arrives. *Rationale:* tab-load gets 90% of "I checked olive oil Sunday, mise pre-checks Wednesday"; only presence needs sub-second.

**2. Days vs moods.** Visual-design wants moods; plan-exec wants advisory `targetDay`; architect agrees as P1. **Call:** both — `MoodTag` enum auto-applied on `MealCandidate` at scoring time; `targetDay` set advisory only at Tonight pick. *Rationale:* moods are how Alicia chooses; `targetDay` is how Tonight knows which meal to surface. Different surfaces.

**3. "Just the gist" Alicia render mode.** Caretaker wants it; nobody else asked. **Call:** cut. Tonight IS Alicia's home; tapping Cook drops into Andrew's `CookCardView` as today. Adding a render flag invites drift. *Rationale:* two consumers already share the view peacefully (Alicia ignores timers; Andrew uses them).

**4. Hosted Menu — separate noun or promoted plan?** Sharing-network proposes a full `HostedMenu` table (XL); visual-design wants it rendered from plan data. **Call:** promoted plan. Add `WeeklyPlan.publishedSlug?`, `publishedAt?`, `hostNote?`, `dietaryNote?` plus thin `WeeklyPlanMenuItem(plannedMealId, courseLabel, displayBlurb?, snapshotCardJson)`. `/menu/[slug]` reuses Tonight components in published mode. *Rationale:* sharing-network's own spark #3 says don't build two parallel planners. XL → M.

**5. Friends graph.** Only sharing-network proposed; caveats its own caveat. **Call:** cut. Andrew has zero documented friends in the app; network effect cannot start. Revisit after hosted menus prove publish use.

**6. Inbox + comments.** **Call:** Notification table only (no comments) in Phase 2 — closes gift / hosted-menu / outcome loops; comments stay P3. *Rationale:* comments-on-recipes is Slack-for-cooking risk.

**7. `MiseCheckShared` sibling vs migrate `MiseCheck`.** **Call:** sibling table. Per-user `MiseCheck` stays the fallback. *Rationale:* mirrors the existing `(userId, familyId)` separation in `SavedRecipe` / `RecipeOverride`; lower migration risk on live data.

**8. MealOutcome capture.** Caretaker wants it; plan-exec didn't pick it up. **Call:** ship Phase 2 as the explicit feedback loop into `ProfilePreference` — without it, profiles never learn.

## Cross-pollination sparks

- **`PlanEvent` (architect) + `CookEvent` (plan-exec) + `Notification` (sharing) + Meezing presence are one channel.** Design `FamilyEvent(familyId, kind, planId?, savedRecipeId?, payload, actorId, createdAt)` once. SSE/`LISTEN/NOTIFY` pipes live; the table is truth. Plan events, mise checks, gift acceptances, kid outcomes all fan out from this.
- **A `source` provenance enum is universal.** `MiseCheck.source`, `RecipeOverride.source`, `ProfilePreference.source`, `PantryItem.source` all need it for "why is this thing the way it is" debugging. Adopt cross-table.
- **Published menu, Tonight surface, and candidate peek sheet are one component in three states.** Visual-design's MenuSpread + CandidatePeek + plan-exec's TonightView all render `(meal | candidate, photo|vignette|swatch, sprite cluster, time, eater chip)` from a `composedCardDraft`. Build one `<MealFace />` primitive.
- **`StillLife` (visual-design) is the visual primitive that ties publish artifact, library empty-state, pantry "use me" panel, and OG images together.** Promote `VignetteArea` from `RolodexTile` into a top-level `<StillLife heroes mood>`.
- **The grocery cascade is the offline mirror of Meezing presence.** Same join logic (scope X check propagates to scope Y). The cascade ships Phase 1; presence ships Phase 2; both reuse the join.
- **"Send to a delegated shopper" maps onto `RecipeGift`.** Both: snapshot of structured data + permission token for someone else to act on it. Implement once, parametrize by artifact.

## Grocery automation — placement (NEW USER INPUT)

Andrew's mid-flight note doesn't pull a new feature out of the air; it raises the *ceiling* of an existing P0. Three of five lenses already converge on `PantryItem` + grocery write-back, which is the foundation any automation rides on.

- **Phase 1 (P0):** `PantryItem` + `purchased=true` write-back. Foundational. No external integration yet.
- **Phase 2 (P1):** **Delegate grocery share** — `GroceryListShare(planId, token, sharedWithEmail?, expiresAt?)`. Recipient sees a sprite-driven shopping list (visual-design P1) and marks items purchased, triggering the same write-back. Reuses sharing-network's gift token pattern parametrized for grocery. **L size**, highest-confidence automation.
- **Phase 2 (P1):** **Vendor-agnostic deep-link export** — tap "Send to Instacart" opens a pre-filled deep link; falls back to clipboard. Don't pick a partner; build the schema-out side. **M size.**
- **Phase 3 (P2):** Real Instacart/Walmart/AmazonFresh API integrations — multi-week, partnership-shaped, OAuth-grade. Pick one (Instacart default) only after delegate-share + deep-link work.
- **Phase 3 (P2):** Smart re-ordering (standing pancetta order) — requires 3+ months of `MealOutcome` + `PantryItem` history first. Useless without data.

*Architectural justification:* architect's "build for the second consumer" rule applies. Pantry has consumer 1 (intake seeding), 2 (mise cascade), 3 (delegate share). Three known consumers justify the table; partner integrations are consumer 4 and need their own evidence.

## Foundational schema / migrations to sequence first

Forward-only, file-to-file diff per `CLAUDE.md`.

**Phase 1:**
1. `PlanEvent(planId, kind, payload Json, createdAt, actorId)` indexed `(planId, createdAt)` — wraps every planner POST in `recordPlanEvent()`. No UI v1.
2. `Profile(id, familyId, name, kind, ageBand?, avatarColor?, createdAt)` + `ProfilePreference(profileId, kind, slug?, display, source, lastConfirmedAt, evidenceCount)`. Lazy backfill from `WeeklyPlan.intake.kidRules`.
3. `PantryItem(familyId, slug?, display, unit?, quantity?, mustUseBy?, addedAt, addedById, source)` — hand-rolled upsert on `(familyId, slug, unit)` per the NULL-distinct trap.
4. `MealCandidate.moodTags String[]` + `MoodTag` enum (`FAST_FORGIVING`, `EARNED_EFFORT`, `USE_IT_UP`, `KID_APPROVED`, `LEFTOVER_FRIENDLY`, `ONE_PAN`).
5. `publishCandidate(scope: 'execute' | 'library' | 'menu')` extracted from `materializeCandidate`.
6. `scripts/validate-llm-schemas.ts` CI guardrail — fails build on `.min(2+)`, `.max()`, `.int()`, `.positive()`, numeric `.min/.max` in planner Zod.
7. `loadCanonicalCard()` audit + lint banner across planner read sites.

**Phase 2:**
8. `FamilyEvent(familyId, kind, planId?, savedRecipeId?, payload, actorId, createdAt)` + SSE / `LISTEN/NOTIFY` over Neon.
9. `MiseCheckShared(savedRecipeId, familyId, entryKey, checkedById, checkedAt, source)` sibling table.
10. `MealOutcome(plannedMealId, profileId?, eaterRole, verdict, notes?, createdAt)` feeding `ProfilePreference.evidenceCount`.
11. `WeeklyPlan.publishedSlug?`, `publishedAt?`, `hostNote?`, `dietaryNote?` + `WeeklyPlanMenuItem`.
12. `GroceryListShare(planId, token, sharedWithEmail?, expiresAt?)`.
13. `Notification(userId, type, payload, readAt?, actorUserId?, createdAt)` — no comments.

## The agreed backlog (prioritized)

### P0 — Phase 1 (foundations + planner-feels-alive)

1. **PlanEvent log** *(S, architect)* — append-only mutation log. Unblocks: undo, regression tests, reasoning UI, all observability.
2. **Profile + ProfilePreference** *(M, caretaker + architect)* — eaters as rows. Unblocks: per-profile scoring, MealOutcome learning, kid rotation freshness.
3. **PantryItem + grocery write-back** *(M, caretaker + plan-exec + architect)* — escape `intake.pantry`. Unblocks: cascade, delegate share, smart reorder.
4. **`loadCanonicalCard` audit** *(S, architect)* — enforce planner override-blindness.
5. **`publishCandidate(scope)` refactor** *(S, architect)* — while caller count = 1. Unblocks: hosted menu, library publish, plan templates.
6. **Schema-gotcha CI guardrail** *(S, architect)* — every future planner LLM feature.
7. **MoodTag auto-tagging on candidates** *(S, visual-design)* — replaces day grid as decision signal.
8. **`<MealFace />` primitive** *(M, visual-design + caretaker)* — single component for candidate/meal in photo/vignette/swatch states. Unblocks: #9, #10, #17.
9. **Candidate tile redesign** *(M, visual-design + caretaker)* — replace `MenuView` text blocks with `<MealFace />`. Blocked by: #8.
10. **Tonight surface (`/plan/[id]/tonight`)** *(L, plan-exec + caretaker + visual-design)* — glanceable two-column (split) or one-column day view, one Cook CTA per column. Blocked by: #8.
11. **Mode chooser at plan creation** *(S, caretaker)* — `[Use up] [Explore] [Survival]` pre-fills intake.
12. **Grocery → mise cascade (no SSE)** *(M, plan-exec + caretaker + architect)* — pre-checks via tab-load reconciliation, `source = GROCERY`. Blocked by: #3, sibling table.

### P1 — Phase 2 (connect the household)

13. **FamilyEvent channel + SSE** *(L, all five lenses)* — unified per-family pubsub. Unblocks: #14, presence, on-deck handoff.
14. **Meezing presence + shared mise** *(L, plan-exec + sharing)* — opt-in via `Family.syncExecution`, ribbon in SaveBar slot (not inside CookCardView). Blocked by: #13.
15. **MealOutcome capture + Profile learning** *(M, caretaker + architect)* — kid thumbs after cook → `ProfilePreference` evidence. Blocked by: #2.
16. **Mid-week pivot affordances** *(M, plan-exec)* — Skip / Cooked-from-leftovers / Swap on QueueRow.
17. **Promoted-plan Hosted Menu** *(L, sharing + caretaker + visual-design)* — publish a `WeeklyPlan` to `/menu/[slug]`, OG image, ICS, kid-mode toggle. Blocked by: #5, #8.
18. **Sprite-driven grocery list** *(M, visual-design)* — aisle-grid layout via `MisePlace` tile language, haptic on purchase.
19. **Delegate grocery share** *(L, sharing + NEW user input)* — token-share the grocery list, recipient marks purchased, writes back into pantry. Blocked by: #3.
20. **Public recipe share token** *(M, sharing)* — `RecipeShareToken` + `/r/[token]` for anonymous read with fork CTA.
21. **Notification inbox (no comments)** *(M, sharing)* — gifts, hosted-menu RSVP, kid outcomes. Blocked by: #13 preferred.

### P2 — parked / explicitly deferred

Cross-family `RecipeGift` (defer until #20 ships and friction is observed); vendor-agnostic deep-link grocery export; Profile editor UI (no editor v1); Library Rolodex carousel; motion-language audit; step-claim "on deck" handoff; cross-family `RecipeShelf`; friends graph; real Instacart/Walmart API; smart auto-reorder.

## Phasing — three releases

**Phase 1 — "Make planning feel alive" (~2 weeks).** Items 1–12. *Headline: "the planner remembers my kids, my pantry stops resetting, candidates have faces, and Tonight tells me what to cook in one screen."*

**Phase 2 — "Connect the household" (~3–4 weeks).** Items 13–21. *Headline: "Alicia's grocery purchases pre-check my mise, the kids' thumbs train the planner, our Saturday dinner has a publishable menu my mother-in-law screenshots, and the grocery list goes to whoever's at Costco."*

**Phase 3 — "Compound the network" (~ongoing).** Cross-family shelves, deep-link automation, smart reorders, friends graph (if any). *Headline: "the more we use it, the more it learns; the more we share, the more it grows."*

## Explicit decisions Andrew needs to make

1. **Carve out one post-cook chip from the untouchable rule?** Sharing-network's "share this cook with…" chip on the SaveBar after the photo prompt. *Additive*, slotted into SaveBar (not inside `CookCardView`), but touches the cook-finish flow. Approve / deny so Phase 2 hosting work can plan around it.
2. **Hosted Menu visibility — public-by-token (anyone with URL) or family-only-by-default with explicit publish?** Pick before schema lands.
3. **Grocery automation partner ordering — confirm Instacart as the Phase 3 default, or specify Walmart / AmazonFresh / vendor-agnostic-only.**
4. **Family privacy stance restated.** Architect cut "per-user privacy within a family" hard, citing Andrew's prior position. If the stance has shifted (e.g., kid profile data hidden from non-parental family members), say so before Profile work lands.

## What I cut and why

- **"Just the gist" Alicia render mode** — caretaker only; risks `CookCardView` drift; Alicia already ad-libs by ignoring timers.
- **Voice-driven intake / hands-free cook** — caretaker dissented (Alicia plans with wine, not voice); architect dissented (TTS route is prototype-fragile); execution layer untouchable.
- **Real-time collaborative intake chat** — 90-second flow doesn't justify presence/conflict-resolution machinery; serialized intake (PS messages) is free.
- **Smart auto-substitution in editor** — 1-day-feels-like-2-week trap; insufficient evidence users edit pre-cook.
- **Multi-week planning / plan templates** — violates one-grocery-trip-per-week invariant.
- **Calendar grid view** — settled by `project_menu_not_calendar.md`; `targetDay` advisory at Tonight pick only.
- **Friends graph + activity feed** — no contact-import path, no friends in system, defer indefinitely.
- **RecipeComment threads** — Slack-for-cooking risk; reduced to Notification only.
- **Cross-family `RecipeShelf` in Phase 1/2** — no second family in the system yet.
- **Profile editor UI in Phase 1** — accumulate preferences first; build editor only on user complaint.
- **Step-claim "on deck"** — over-formalization for two adults in one kitchen; build only on async-handoff evidence.
- **Library carousel + motion-language audit** — valuable polish but not roadmap-shaped; ongoing.

The 21 active items + 11 parked items above are canonical for the rest of round 2.
