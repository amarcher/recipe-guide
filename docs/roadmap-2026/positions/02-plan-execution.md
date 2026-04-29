# Plan Execution UX — position

## Lens

There is a chasm between commit and CookCardView. Today the post-commit surface (`app/plan/[id]/page.tsx` → `MenuView` → `QueueView`) is a static rolodex of titles with a green Cook button that fires `POST /api/plans/[id]/meals/[mealId]/cook` and dumps the user into `/recipe/[savedRecipeId]`. That handoff is technically clean (idempotent materialization → existing execution stack) but emotionally it's a cliff — the user goes from "we're a household with a week of plans" to "I'm one person staring at a single recipe page" with no transition, no glanceable "what's tonight," no awareness that someone else might be cooking the kid track in parallel, no way for grocery purchases to pre-warm mise, no mid-week "we changed our minds." The execution layer is untouchable; the planning layer is solved. **My territory is the connective tissue that makes a committed menu feel like a living week.** I treat `CookCardView` as a destination, not the home — the home is a Tonight surface that stays on a tablet on the counter, knows whose turn it is, and shrinks to a glance when nothing's happening.

## Top features (prioritized, P0–P2)

### P0 — Tonight surface (`/plan/[id]/tonight`)

A second rendered view of the same plan, optimized for the moment Alicia walks into the kitchen at 5pm. It answers, in this order: *what are we cooking, who's cooking what, when do we need to start, what still needs buying.*

- **Pitch:** A glanceable single-screen "tonight" view with two columns when there's a split (adults / kids), one column otherwise, plus a bottom strip for grocery gaps and a "start in N minutes" countdown for whichever meal has the longer cook time. Each column has one big `Cook this now` CTA that drops into `CookCardView` exactly like today.
- **Why it matters:** The user explicitly called out the static-UI problem. The Tonight surface is the answer to "execution view to allow us to recall what meals we were going to cook for adults and potentially share with the children." It also reframes the kitchen tablet as a household device, not a recipe reader.
- **Sketch:**
  - New route `app/plan/[id]/tonight/page.tsx`. Server component, queries `plan.meals.where(status: QUEUED)` ordered by `targetDay` then `slot`, picks today's bucket. If none, shows `Pick tonight` chooser (queued list, tap to set `targetDay = today`).
  - New client component `TonightView` composes hero-ingredient sprites (already on `MealCandidate.heroIngredientSlugs`), `approxCookMinutes`, the kid-fit chip, and a `Start cooking` button per column. Reuses `startCookingSession` from `app/lib/cook-session.ts` — but extended to take an *array* of `(localId, savedId)` (see Two-track session below).
  - Backfill `targetDay` only at "pick tonight" time — preserves the menu-not-calendar invariant; no scheduling in advance.
- **Size:** L (3-5d). Most of the cost is design polish + the route plumbing; the data model needs nothing new.
- **Risks:** Risk of Alicia treating Tonight as the home and never visiting `/plan/[id]` for tuning. That's actually fine if we cross-link well; flag for confirmation if it nudges her away from the menu surface entirely.

### P0 — Two-track cook session (parallel adult + kid)

The cook session model in `app/lib/cook-session.ts` is single-tenant: one `CookSession` localStorage row, one wake-lock, one timer namespace. The Option B schema decision (two `PlannedMeal` rows on split nights) means we **always** want two simultaneous CookCardViews open — adult salmon on one tab, kid quesadilla on another — with their own independent timer namespaces, both alive.

- **Pitch:** Promote `CookSession` from singleton to `CookSession[]` (max 2-3, indexed by `localId`). Wake lock and the SaveBar Start/Finish toggle survive untouched per-recipe; the only change is the read-side guard — `isAnotherCooking` becomes "another *of this recipe* is cooking," not "any session anywhere."
- **Why it matters:** Without this, the split-slot decision is half-implemented — the schema admits parallel cooks but the runtime state forbids them. Andrew or Alicia has to "Finish cook" the kid quesadilla before they can start their own salmon, which is the literal opposite of what the household needs at 6pm.
- **Sketch:**
  - `app/lib/cook-session.ts` — change `mirror: CookSession | null` to `mirror: Map<string, CookSession>` keyed by `localId`. Storage key becomes `cookcard:v1:session:<localId>` (versioned-prefix-safe — won't collide with timers since those have a numeric step suffix).
  - Existing `useIsCookingNow(localId)` keeps its signature; `useAnyActiveSessions()` returns the array for Tonight/header chrome.
  - Wake lock acquired if *any* session active; released only when *all* end.
  - `/plan/[id]/tonight` Cook buttons can each open the recipe in a different tab/window; mobile flow uses a "switch cook" affordance in Tonight (tap the other column to swap focus).
- **Size:** M (1-3d). Mostly mechanical; the test coverage from `vitest` (storage event, isolated-key hashing) is the main work.
- **Risks:** Mobile screen real-estate. Two parallel CookCardViews don't fit on a phone at once — the answer is the Tonight switcher card, not split-screen recipe rendering.

### P1 — Meezing presence + shared mise (group sync, opt-in)

The `Family.syncExecution` flag exists (`schema.prisma:84`) but isn't wired through. This is the headline collaboration feature from the synchronized-execution memory — when on, mise-tile checks broadcast to other family members in seconds, and the SaveBar shows "Andrew is meezing the salmon."

- **Pitch:** When `Family.syncExecution = true` and the recipe is family-scoped, `MiseCheck` becomes group-keyed instead of user-keyed. Real-time sync via SSE channel keyed on `(savedRecipeId)`, broadcasting `{ entryKey, checked, byUserId, at }`. A presence ribbon at the top of `CookCardView` (or, more correctly, slotted *into* the SaveBar slot since the execution layer is untouchable) shows who else is currently in this card.
- **Why it matters:** The memory explicitly names "Meezing" as the verb and as the point of the product. It's also the lowest-cost way to demonstrate the household-utility direction without changing the cook flow.
- **Sketch:**
  - **Schema sibling** (avoid migrating `MiseCheck` itself — it's the per-user fallback): add `MiseCheckShared(savedRecipeId, familyId, entryKey, checkedById, checkedAt)` with `@@unique([savedRecipeId, familyId, entryKey])`. The storage helper picks which table based on the saved recipe's family + family flag.
  - **Live channel:** SSE route `app/api/recipes/[id]/presence/route.ts` (`runtime: "nodejs"`, no edge — Prisma adapter). Subscribers receive `{ type: "mise" | "presence" | "timer", payload }`. Backed by a Redis pubsub or — for v1 — a Postgres `LISTEN/NOTIFY` channel since we already pay for Neon. **Vercel serverless caveat:** open SSE doesn't survive Fluid timeout; chunk to 60s reconnects, push every event through DB so reconnection re-syncs from `where checkedAt > lastSeenAt`.
  - **UI hooks:** `useMiseChecks(recipeId)` (in `storage.ts`) gains a `mode` arg `"personal" | "shared"`; the SaveBar reads `viewerAccess` + `family.syncExecution` to decide which.
  - **Reset semantics:** Per the memory, resettable mid-cook. Add a "Reset shared mise" button to the SaveBar overflow — soft-deletes `MiseCheckShared` rows for `(savedRecipeId, familyId)` *only*, never personal.
- **Size:** L (3-5d). The schema piece is small; live sync infra is the bulk.
- **Risks:** SSE on Vercel is annoying. Fallback: 5s polling with `If-Modified-Since` against an aggregate version key. Cheap to ship, ugly but functional.

### P1 — Grocery-purchase cascade into mise pre-checks

The synchronized-execution memory's clearest behavioral promise: when the user marks "olive oil" purchased on the grocery list, every queued meal that uses olive oil shows it pre-checked in mise. No re-tapping per recipe.

- **Pitch:** Turn `GroceryItem.purchased = true` into a join: for each queued `PlannedMeal` whose materialized card uses an ingredient with that slug, write a `MiseCheckShared` row (or `MiseCheck` if family sync is off) marked `source: "grocery"`. UI distinguishes grocery-prechecks from manual checks with a basket glyph so users know it's "cascade" not "I personally pulled it out."
- **Why it matters:** Direct user request shape ("inventory in their house" + the synchronization memory). Closes the loop between Sunday shopping and Wednesday cooking without making either tedious.
- **Sketch:**
  - Hook into `PATCH /api/plans/[planId]/grocery/[id]` (visible in `GroceryList.tsx:79`). After the purchase write, `await rebuildMiseCascadeForPlan(planId)` resolves slug → all queued meals' canonical cards' ingredient `entryKey`s, then upserts cascade rows.
  - Cascade rows need `source` to distinguish from manual checks (so unchecking a grocery item later cleanly reverses the cascade without clobbering a "I actually counted them" check). Add `source MiseCheckSource` enum: `MANUAL | GROCERY | LEFTOVER`.
  - In `MisePlace`, render cascaded checks with a basket icon overlay; tapping reveals "checked because olive oil was purchased Sun."
  - **Materialization timing:** the cascade can only resolve `entryKey` after the candidate's `composedCardDraft` is materialized — already true for committed meals (the `cook` route runs idempotent materialization, but `composedCardDraft` is the source today). Use the draft directly; we don't need a `SavedRecipe` to exist yet for the lookup.
- **Size:** M (1-3d).
- **Risks:** Slug normalization mismatch — grocery aggregation and mise both use `(slug || normalized item, unit)` per CLAUDE.md, so should align. Tests in `aggregate.ts` need extension to cover the cascade path; this is exactly the kind of pure-function unit test vitest is set up for.

### P1 — Mid-week pivot affordances on the menu

Today, leaving the menu as-is mid-week means the queued list keeps growing stale. Users need three actions that don't exist: **Skip**, **Cooked from leftovers**, **Swap for another candidate**.

- **Pitch:** Three small buttons on each `QueueRow`. Skip → status `SKIPPED`, ghosted in queue, `cookedAt` null. Cooked-from-leftovers → status `COOKED`, `cookedAt = now`, `notes = "leftovers"`, no SavedRecipe materialization. Swap → opens a sheet showing same-slot/same-eaters candidates and lets them recommit without going to the full menu page.
- **Why it matters:** The menu-not-calendar memory implicitly assumes mid-week pivots; the schema even has `SKIPPED`. It's just unwired in the UI. Without it, Wednesday-night reality breaks the model.
- **Sketch:**
  - `PATCH /api/plans/[id]/meals/[mealId]` — already supports status changes (verify); add `notes` passthrough if missing.
  - `MenuView.tsx` `QueueRow` component grows a small overflow menu (Lucide `MoreHorizontal`).
  - Swap sheet reuses the existing `MealCandidate` rows for that `(slot, eaters)` group. Needs a "show non-committed candidates" query; no schema change.
  - Grocery rollup on swap: re-run `rebuildGroceryForPlan` (mentioned in CLAUDE.md). On Skip, same — un-sums those ingredients. **Important:** if the cascade pre-checked mise on a now-skipped meal, leave the grocery item purchased but the mise cascade row dies with the meal.
- **Size:** M (1-3d).
- **Risks:** "Cooked from leftovers" without materializing a SavedRecipe means no CookLog row — but the user might still want to upload a photo of how the leftover plate looked. Decision: allow CookLog creation without SavedRecipe by attaching to `PlannedMeal` directly (small schema change: `PlannedMeal.cookLogId?`).

### P2 — "On deck" handoff signal between cooks

In a Meezing scenario, when two people are pre-prepping for the same meal there's currently no signal that says "I'm starting the onions, you take the chicken." Today they text.

- **Pitch:** Each step in `CookCardView` gets a "claim" from the SaveBar slot (not from inside the step itself — execution layer is untouchable). Live channel broadcasts `{ stepNumber, byUserId, at }`; other family members see "Andrew is on step 3."
- **Why it matters:** The memory explicitly calls out this coordination friction. Modest implementation if the SSE channel from Meezing is already up.
- **Sketch:**
  - `StepClaim(savedRecipeId, familyId, stepNumber, userId, claimedAt)` — soft, ephemeral, expires after 30 min.
  - Channel reuse: the same SSE bus carries claim events.
  - UI: a single line above the SaveBar's existing chrome — "Alicia just claimed step 4." Tap-to-claim presents an "I'll do this one" button that injects into the same channel.
- **Size:** S (<1d) on top of Meezing infra; standalone L because the bus is the cost.
- **Risks:** Over-formalization. If Andrew and Alicia are in the same kitchen they don't need digital claims — they just talk. This feature is for asynchronous handoff (one preps after work, the other finishes at dinner). Default it OFF and surface only when family members are on different devices in different sessions.

### P2 — Guest mode for cook-night

User explicitly named this: "share with the children and maybe guests." A guest at dinner shouldn't have to sign in to see what's cooking; conversely the host might want to share a kid-friendly read-only "here's what's on the menu" link.

- **Pitch:** Per-plan share token (existing pattern from share-by-link recipe forks, see commit `bb82812`). Guest URL shows the Tonight view in read-only mode with photos, hero sprites, and "ready in N min" countdowns. No mise, no timers, no controls.
- **Why it matters:** Closes the "share across families/users" arc the user described, low cost, and gives the kids something to look at on the iPad.
- **Sketch:**
  - `WeeklyPlanShare(planId, token, expiresAt, viewerType: "GUEST" | "KID")` — TTL-based, revocable.
  - Read-only `/plan/share/[token]/tonight` page; reuses Tonight component with a `readOnly` prop.
- **Size:** M (1-3d).
- **Risks:** Privacy on the shared cook history — strip `cookHistory` like we do in `GET /api/recipes/[id]` for guests today. Pattern already exists.

## Sparks (3 cross-cutting provocations)

1. **The plan is a kitchen device, not a phone app.** Tonight surface should be the default home for any session that ran a cook in the last 7 days, on any device whose UA looks tablet-y. The phone gets the menu; the tablet on the counter gets Tonight. That's two surfaces, one app.
2. **Cooks are events, not records.** `CookLog` is post-hoc; the missing model is `CookEvent` — a live, ephemeral row that exists only while a cook is in flight, holds the SSE channel id, and dies into a `CookLog` on finish. This makes Meezing presence trivial (subscribe to all `CookEvent.familyId = X`) without scanning timer state.
3. **Cascade is the unifying mental model.** Grocery purchase → mise. Mise check → step ready. Step done → next-step claim. Cook finish → CookLog → photo prompt → library tile. Every commit feeds something else. Make this explicit in the data layer (`source` enums, audit trail) and the product becomes legible without a tutorial.

## Dissent / pushback

1. **Don't let the conversational/AI agents own the cook surface.** Other agents will likely propose "Claude as a sous-chef in the kitchen" or "voice-driven cook coaching." The execution layer is untouchable per memory and serves Andrew specifically; injecting LLM-driven banter into a moment where he's anxious about searing the steak is a regression. Keep AI on the planning side. Tonight surface can use AI for *suggestions* ("you committed three meals using shallots — sauté once, split between Tuesday and Thursday?") but not in-flight execution.
2. **Resist a calendar.** Some agent will pitch a "drag meals onto Tuesday" UI. Read `project_menu_not_calendar.md` — that's been decided against. `targetDay` is advisory and only set at Tonight pick time. Don't reintroduce calendar grid as the primary post-commit surface.
3. **Don't sync timers in a way that fires alarms on every device.** Synchronized-execution memory is explicit: alarm default is starter-only. If another agent pitches "every family member's phone beeps when the timer ends," that's wrong — push back to the opt-in-per-timer model.

## What I want to read in others' positions

- The **planning** agent's take on whether intake should explicitly prompt about *who's cooking* this week — that determines whether two-track sessions are the default or the exception.
- The **kids/inventory** agent on how kid preferences and pantry inventory should preload mise pre-checks (parallel to the grocery cascade — leftover pantry stock is the same pattern).
- The **multi-family/sharing** agent on whether `WeeklyPlanShare` tokens should be reciprocal (you share my Tonight; I see yours) or one-way. That changes the schema for Guest mode.
- The **realtime/infra** agent on whether we commit to SSE-on-Vercel or escalate to a managed pubsub — Meezing's whole UX hinges on which.
