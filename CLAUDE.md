@AGENTS.md

# Recipe Guide — project notes for Claude

A Next.js 16 app that turns any recipe URL into a one-screen "recipe guide": a mise en place, a step timeline, per-step countdown timers, and ingredients re-attached to the step that uses them.

## Architecture

- **`app/api/parse/route.ts`** — POST { url } → strips HTML, sends to Claude (`claude-opus-4-7`) with a system prompt that returns a strict JSON shape matching `app/types.ts`. Re-attaches each ingredient to the step that actually uses it. Picks one of 12 step icon enum values.
- **`app/types.ts`** — `CookCard`, `Step`, `Ingredient`, `StepIcon`. The schema returned by the parser and consumed everywhere. `CookCard.tagline` is an optional, LLM-generated one-liner (Alison Roman voice, ≤12 words) used as the pull-quote on library rolodex swatch tiles and as a subtitle under the title on photo/vignette tiles. Older cached recipes predate it — backfill via `npm run backfill:taglines`.
- **`app/components/CookCardView.tsx`** — top-level recipe renderer. Composes `Scaler`, `MisePlace`, `Timeline`, `StepIcon`, `StepTimer`. Holds the `factor` (scale) and `doneSteps` state for one card.
- **`app/components/MisePlace.tsx`** — aggregated ingredient grid. Each tile is a button that toggles a "got it out" check (persisted per-recipe via `useMiseChecks`).
- **`app/components/Timeline.tsx`** — proportional segment bar; click a segment to scroll to that step.
- **`app/components/StepTimer.tsx`** — Start/Pause/Reset countdown backed by `timer-state.ts`. State is persisted per (recipeId, stepNumber); remaining time is always computed from wall clock so the timer keeps counting across reloads and in other tabs. Range durations fire two alerts (low end → "checking" state, high end → "done"). On expiry: WebAudio beep + Vibration + browser Notification + TTS + optional Cast announcement + auto-scroll to next step.
- **`app/lib/timer-state.ts`** — per-step timer store at `cookcard:v1:timer:<recipeId>:<step>`, cross-tab via the `storage` event. `clearTimersForRecipe` is called on cook session finish.
- **`app/lib/cook-session.ts`** — single active cooking session (`cookcard:v1:session`). Starting acquires a Screen Wake Lock (re-acquired on `visibilitychange` since browsers drop it when the tab hides); finishing calls `markCooked` + clears that recipe's timers and returns `{ cookLogId }` so the SaveBar can surface the post-cook photo prompt. The `SaveBar` Start cooking / Finish cook toggle is the UI entry point — there is no retrospective "I cooked this" button.
- **`app/lib/alarm.ts`** — shared unlocked `AudioContext` + `primeAudio()` (called from the Start button so later beeps survive the mobile autoplay gate), `playBeep`, `vibrate`, `speakText` (Web Speech), `notify` (Notification). `playBeep` returns `false` when the context is blocked so the caller can log a diagnostic.
- **`app/lib/cast.ts`** + **`app/components/CastButton.tsx`** — Google Cast Web Sender prototype using the Default Media Receiver (`CC1AD845`). Namespacing gotcha: `CastContext`, `SessionState`, and event-type enums live under `cast.framework.*`; everything else (`AutoJoinPolicy`, `MediaInfo`, `LoadRequest`, `MetadataType`, `GenericMediaMetadata`) lives under `chrome.cast.*`. When connected, `StepTimer` calls `speakOnCast()` alongside local alarms.
- **`app/api/tts/route.ts`** — Node route that proxies Google Translate TTS → `audio/mpeg`, chunked to <200 chars per segment. **Prototype-fragile**: Translate TTS is undocumented and can break without warning. Swap for a real TTS provider (ElevenLabs, Google Cloud TTS, Polly) before relying on this in production.
- **`app/lib/storage.ts`** — client-side data boundary. Dual-mode: when a NextAuth session exists it reads/writes the server via `/api/recipes*`; unauthenticated falls back to the localStorage mirror (`cookcard:v1:recipes`, `cookcard:v1:mise:<id>`). The local recipe id is a stable hash of `(source_url, title)` (`recipeIdFor`) so the same id works in both modes. Exports (`saveRecipe`, `getRecipe`, `markCooked`, `useSavedRecipes`, `useSavedRecipe`, `useMiseChecks`, `refreshSavedRecipes`) remain the only thing the UI should touch. `useSavedRecipe` self-heals via `GET /api/recipes/[id]` when a lookup misses the mirror (e.g. immediately after the planner materializes a candidate) — holds `loaded=false` until the single-row fetch settles, so the page shows "Loading…" instead of flashing "not saved".
- **`app/lib/scale.ts`** — fraction parsing/formatting. Handles vulgar fractions (½, ⅓, ¼, …), mixed numbers (`1 1/2`), ranges (`8-10`), and decimals.
- **`app/lib/duration.ts`** — `parseMinutesRange` returns `{ low, high }` minutes from strings like `10-15 minutes`, `1 hour`, `30 sec`.
- **`app/lib/aggregate.ts`** — sums ingredients across steps + pantry into mise entries, keyed by `(slug || normalized item, unit)`.
- **`app/lib/sprites-core.ts`** — pure, server-safe sprite lookup (`findSprite`, `spriteUrl`, `aisleForName`, etc.). Imported by server code (grocery rollup, candidate scoring) and by the client wrapper.
- **`app/lib/sprites.ts`** — `"use client"` wrapper around `sprites-core` that adds the React hooks (`useSpriteUrl`) and runtime discovery (`discoverSprites`). Never import from here in server code — use `sprites-core` directly.

## Weekly Meal Planner (`/plan`)

A second surface layered on top of the recipe-execution app. Answers "what are we eating this week and what do we need to buy?" rather than "how do I cook this recipe right now?" Critically: it does not replace or dilute the execution UI — committed meals hand off to the existing `CookCardView` via materialization.

**Pipeline stages** (each is an LLM call, each can be re-run):

1. **Intake chat** — `/plan/[id]/intake` → `POST /api/plans/[id]/intake/chat` streams a conversation via AI SDK v6 `useChat` + Claude Sonnet 4.6 (`intakeChatModel`). A hardcoded opener is seeded client-side so the first bubble doesn't wait on a round-trip. Each user/assistant turn is persisted as an `IntakeMessage` row. The agent calls the `signal_intake_complete` tool when it's heard enough.
2. **Extract** — `POST /api/plans/[id]/intake/extract` runs `generateObject` on the whole transcript against the `PlanIntake` schema (Opus 4.7). Writes to `WeeklyPlan.intake` and flips status to `INTAKE_COMPLETE`. `weekOf` is set from the extraction's date.
3. **Skeleton** — `POST /api/plans/[id]/skeleton` produces the week's *thesis* (hero ingredients, themes, rationale) in one LLM call. Accepts `{ guidance?: string }` — when a previous skeleton exists it's sent as reference so the model preserves what the user didn't flag.
4. **Candidates** — `POST /api/plans/[id]/candidates` generates 3–5 meal options per `(slot, eaters)` combo in parallel. Each candidate includes a slimmed `CookCardDraft` (see gotcha below). Accepts `{ slot?, eaters?, guidance? }` for per-section tuning — scoped regeneration only wipes non-committed candidates in that one combo. Scoring + ranking runs at the end via `scoreAndRankPlan`.
5. **Commit** — `POST /api/plans/[id]/meals` creates a `PlannedMeal` pointing at a candidate. Commit triggers `rebuildGroceryForPlan` which unions ingredients across all committed meals.
6. **Cook** — `POST /api/plans/[id]/meals/[mealId]/cook` materializes the committed candidate's `composedCardDraft` into `ParsedRecipe` + `SavedRecipe` rows (idempotent on source_url). Client redirects to `/recipe/[savedRecipeId]` — the existing execution flow takes over.

**Schema additions**:
- `WeeklyPlan` — plan metadata; `intake`, `skeleton` are JSON columns. Status enum tracks pipeline stage.
- `IntakeMessage(planId, role, content, createdAt)` — chat transcript.
- `MealCandidate` — per-slot option with `composedCardDraft` (full `CookCard`) + scoring metadata.
- `PlannedMeal(planId, chosenCandidateId, status)` — committed meals; status `QUEUED` / `COOKED` / `SKIPPED`.
- `GroceryItem(planId, entryKey, display, unit, quantityText, userPurchasedById?)` — aggregated line items, dedupe key `(slug || normalized item, unit)` mirroring the execution layer's mise aggregation.

**Prompts** live in `app/lib/planner/prompts.ts`. Each prompt explicitly tells the model the count ranges (e.g. "3-5 candidates") because we strip Zod `.min()/.max()` from arrays (see Anthropic gotcha below).

**UI surface** (`app/plan/[id]`):
- Top: `PipelineControls` (tune skeleton / tune candidates) with optional guidance inputs.
- Skeleton rationale in an amber narrative panel.
- `QueueView` at the top when meals are committed — each row has a **Cook** button that materializes → navigates to `/recipe/[id]`.
- `MenuView` grouped by `(slot, eaters)`. Kid-only sections are wrapped in a warm amber panel for visual separation. Each section header has its own "Tune this section" button + per-section guidance input. Each card shows hero-ingredient sprites in an overlapping cluster.
- `EaterTastePanel` — read-only `<details>` panel on family-scoped plans (between skeleton rationale and `MenuView`) surfacing each family `Profile`'s `ProfilePreference` rows as per-eater bucket chips (reliable hits / experimenting / hard nos / aspirations) with sprites, evidence counts, and source+recency tooltips. Strictly read-only — preferences accumulate from intake + outcomes only, no editor. Grouping/recency/summary helpers live Prisma-free in `app/lib/planner/taste-panel.ts` (vitest-covered).
- Post-cook learning loop close: `GET /api/plans/[id]/meals/[mealId]/outcomes` returns `{ recorded, previous }` (latest per-role verdicts for this meal / for the most recent earlier cook of the same dish title within plan scope). `MealOutcomePrompt` uses it to (a) collapse to an "Already noted" line on reload instead of nagging twice and (b) render the one-tap "Same as last time" affordance that submits both roles' previous verdicts.

**Design documents**:
- `design-slot-split.html` — the decision deck for the two-row-per-split-slot schema (adults + kids).
- `design-planner-walkthrough.html` — walkthrough of the full intake→skeleton→candidates→commit→grocery→cook loop.

## Cook Logs & Photos

- **`CookLog(savedRecipeId, userId, cookedAt, photoUrl?, photoUploadedAt?, notes?)`** — one row per "I cooked this" event. Created inside `POST /api/recipes/[id]/cooked` alongside the `cookCount` increment; the response returns `cookLogId` so the SaveBar can immediately open the photo prompt pointed at that log.
- **`POST /api/cook-logs/[id]/photo`** — multipart upload. `sharp` resizes to max 1600px and re-encodes as JPEG before uploading to Vercel Blob at `cooklogs/{cookLogId}.jpg` (deterministic key, `allowOverwrite: true`).
- **`POST /api/recipes/[id]/photo`** — the library-side upload path. Upserts the photo onto the user's latest `CookLog` for that recipe, or creates a "photo-only" log (no cookCount bump) if none exists. Lets users add a photo anytime without pretending they just cooked it.
- **`CookPhotoPrompt`** (`app/components/CookPhotoPrompt.tsx`) — post-finish-cook affordance on the SaveBar. Amber panel with camera-capable file input; on upload flips to an emerald confirmation with the thumbnail.
- **`RolodexTile`** (`app/library/RolodexTile.tsx`) — a library tile. Three render modes: `photo` (uploaded photoUrl, full-bleed), `vignette` (hero ingredient sprites collaged on a colored wash when no photo exists), `swatch` (fallback — title as a serif italic pull-quote on a colored wash). The whole tile is a drag-drop target for image uploads, with an inline "Add photo" / "Change" affordance in the corner. `router.refresh()` after upload.
- `/api/recipes` GET includes `cookLogs: { where: { photoUrl: not null }, orderBy: { photoUploadedAt: desc }, take: 1 }` to hydrate `photoUrl` on each row without an extra round-trip.

## Accounts, Families, Persistence

- **Auth: NextAuth v5 (beta) + Google OAuth, database sessions.** Config in `auth.ts`; adapter is `@auth/prisma-adapter`. Server-side guard is `requireUser()` in `app/lib/server-auth.ts` — it returns `{ userId, session }` or `null`. Every `/api/*` route that touches user data calls it and 401s on null.
- **DB: Neon Postgres via Prisma.** Driver adapter `@prisma/adapter-neon` + `@neondatabase/serverless`; client in `app/lib/prisma.ts`. Generated client lives at `app/generated/prisma/` (non-standard output path — import from `@/app/generated/prisma`, not `@prisma/client`).
- **Env vars**: `DATABASE_URL` (pooled), `DATABASE_URL_UNPOOLED`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`. `DASHBOARD_DATABASE_URL` is used by `/api/parse` + `/api/sprites/discover` for separate logging/metrics — do not conflate with `DATABASE_URL`.
- **Schema (`prisma/schema.prisma`)**:
  - Auth.js required: `User`, `Account`, `Session`, `VerificationToken`.
  - `Family` + `FamilyMember` (role: OWNER/ADMIN/MEMBER) + `FamilyInvite` (code, expiresAt, usedAt) — multi-user shared recipe libraries.
  - `ParsedRecipe` — cross-user cache keyed by `sourceUrl` (unique); `cardJson` holds the `CookCard` JSON. Any user pasting the same URL hits the cache and skips the Claude parse.
  - `SavedRecipe(userId, parsedRecipeId, familyId?)` — a single recipe can live in a user's personal library AND in multiple families simultaneously, each with its own `cookCount` / `lastCookedAt`. Postgres treats NULL as distinct in unique constraints, so personal-scope dedupe is hand-rolled (`findFirst` → `create`) in `app/api/recipes/route.ts`.
  - `MiseCheck(savedRecipeId, userId, entryKey)` — per-user, even inside a shared family recipe.
  - `CookLog(savedRecipeId, userId, cookedAt, photoUrl?, photoUploadedAt?, notes?)` — per-cook history; see the Cook Logs section above.
  - `RecipeOverride(parsedRecipeId, userId? | familyId?, cardJson, forkedFromUserId?, updatedAt, updatedById)` — per-scope edits layered on top of `ParsedRecipe.cardJson`. See the Recipe editing & sharing section below.
  - Planner: `WeeklyPlan`, `IntakeMessage`, `MealCandidate`, `PlannedMeal`, `GroceryItem` — see the Weekly Planner section above.
- **Server-persisted today**: recipes CRUD (`/api/recipes`, `/api/recipes/[id]`, `.../cooked`, `.../mise`, `.../photo`), cook log photos (`/api/cook-logs/[id]/photo`), families (`/api/families`, `/api/families/[id]`), invites (`/api/invites/[code]`), and the full planner API tree under `/api/plans`.
- **Still localStorage-only**: per-step timers (`cookcard:v1:timer:*`) and the single active cook session (`cookcard:v1:session`). These are device-local by design — a timer running on the phone in the kitchen shouldn't follow you to the laptop.
- **Prisma workflow**: `npx prisma migrate dev --name <slug>` for schema changes; `npx prisma generate` after pulling if the client is stale. Migrations in `prisma/migrations/`.

## Recipe editing & sharing

`ParsedRecipe.cardJson` is a *global* cache keyed by `sourceUrl` and is meant to be canonical / read-only at runtime — only the parser writes it. User-driven edits go into `RecipeOverride`, layered on top per scope.

- **Schema**: `RecipeOverride(parsedRecipeId, userId? | familyId?, cardJson, forkedFromUserId?, updatedAt, updatedById)`. Exactly one of `(userId, familyId)` is set:
  - **Personal-scope** save → override keyed by `(parsedRecipeId, userId, familyId=null)`. Visible only to the saver.
  - **Family-scope** save → override keyed by `(parsedRecipeId, userId=null, familyId)`. Shared across all family members. Last write wins.
- The unique constraint `@@unique([parsedRecipeId, userId, familyId])` is Postgres-NULL-distinct (same trap as `SavedRecipe`); upserts hand-roll `findFirst → create | update` in the PATCH/fork handlers instead of trusting it.

**Resolver helpers (`app/lib/card-resolver.ts`)** — codify the "which card do I show?" decision so it's never implicit at call sites:
- `resolveCard(saved)` — single SavedRecipe; returns `{ card, overrideUpdatedAt, overrideUpdatedById }` with override applied.
- `resolveCardsForSavedRecipes(rows)` — batched for the library list endpoint; one Prisma query for all relevant overrides.
- `loadCanonicalCard(parsedRecipe)` — bypasses overrides. Use this from planner/scoring/aggregation code that should reason about the recipe-as-parsed (`app/lib/planner/history.ts`, etc.).
- `overrideScopeFor(saved)` — pure helper, lives in `app/lib/card-scope.ts` so it stays unit-testable without pulling Prisma into vitest's import graph.
- `applyCanonicalFallback(snapshot, canonical)` — Prisma-free, in `app/lib/card-fallback.ts` (unit-tested). Read-time fallback for frozen card snapshots: enrichment fields the snapshot is missing (absent / null / blank) fall through to the canonical `ParsedRecipe.cardJson`, so new card fields stop silently shadowing on RecipeOverride / `pivotMeta.revisedCard` / `MenuItem.snapshotCardJson` — retiring per-field one-shot backfills. Snapshot-owned structure (title, steps, ingredients, equipment, servings, times, source_url) is NEVER resurrected. Wired into both resolvers and the hosted-menu page/ICS (snapshot ← candidate draft).

**Endpoints**:
- `GET /api/recipes/[id]` — auth required, but **does not 404 for non-members**. Returns `viewerAccess: "owner" | "family" | "guest"`. Guests get a read-only, override-applied card with `cookHistory: []`, `cookCount: 0`, and `lastCookedAt: null` (scope-private fields are stripped). The `/recipe/[id]` page renders a "Save a copy" CTA for guests.
- `PATCH /api/recipes/[id]` — owner (personal scope) or any family member (family scope). Body is a full `CookCard`; `validateCardPayload` (in `app/lib/card-validate.ts`) rejects any change to `source_url` (the canonical key into `ParsedRecipe`). Concurrency: client sends `If-Match: <overrideUpdatedAt-ms>`; server returns 409 + `currentUpdatedAt` on mismatch so the second writer can prompt for reload before clobbering.
- `DELETE /api/recipes/[id]/override` — reset to canonical. Idempotent (deletes via `deleteMany`).
- `POST /api/recipes/[id]/fork` — "save a copy to my library." Creates a personal-scope `SavedRecipe` for the viewer + seeds a personal `RecipeOverride` with the visible (resolved) card so the fork lands looking exactly like what the visitor was viewing. Idempotent on `(viewer, parsedRecipeId, familyId=null)` — re-forking returns the existing id with `alreadyExisted: true`.
  - Subtle: if the source recipe has no override (canonical view), the fork starts canonical too — no override row created. Future canonical mutations would propagate; we currently never mutate `ParsedRecipe.cardJson` post-parse, so this is benign. If we ever need stronger fork-isolation, switch to "always seed an override on fork."

**Mise-check orphaning on ingredient edits** is expected behavior: `entryKey` (`${slug ?? item.toLowerCase()}|${unit.toLowerCase()}`) shifts when a user renames or re-units an ingredient, so existing `MiseCheck` rows for the old key orphan and the new key starts unchecked. Same as real life — if you change the ingredient, you re-fetch it. Don't migrate.

**Editor UI**: `app/components/CookCardEditor.tsx` is the inline-edit mirror of `CookCardView`. Owner/family viewers see an "Edit recipe" button on `/recipe/[id]` that flips render to the editor. Debounced autosave (~500ms) → `patchRecipe` → tri-state status pill (saving / saved / conflict). "Reset to original" calls the override DELETE. Source URL is hidden in the editor — fork to change it. Steps + ingredients reorder via up/down buttons (no drag-drop yet).

**Storage helpers (`app/lib/storage.ts`)**: `patchRecipe(id, card, ifMatch?)`, `forkRecipe(id)`, `resetRecipeOverride(id)`. `SavedRecipe` gained optional `viewerAccess` and `overrideUpdatedAt` fields populated by single-fetch (the library list never returns guest rows).

Token-based public links, anonymous viewing, request-edit-access, and per-user edit grants distinct from family membership are deferred to Phase 2.

## Mid-cook Pivot

The "Stuck? Adapt the recipe" mid-cook escape hatch. The cook is mid-execution, something's gone wrong (added too much paste, missing an ingredient, missed a step), and an executive-chef AI rewrites the rest of the recipe to absorb the misstep with minimum deviation. Forks into a personal-scope SavedRecipe marked as a pivot-in-progress until the cook decides at end-of-cook whether to keep or discard it.

**Trigger surface**: `app/components/PivotSheet.tsx` opens from a small amber "Stuck? Adapt the recipe" chip in `CookCardView` that's only visible when `useCookSession()` matches the current recipe. Sheet phases: input (textarea + Cmd-Enter submit) → loading → result (chef's narrative + bullet diff + Discard / Use this version) → error.

**Two-pass LLM** (Claude Opus 4.7 via the existing `plannerModel`):
1. **Revise** — `app/lib/pivot/{schemas,prompts}.ts` define a `PivotedCard` slim shape (planner-style, dodges Anthropic's complexity budget) and the system prompt that pushes hard on "preserve original > be clever". Server expands the draft to a full `CookCard` via `expandPivotedCard`, copying through `source_url`, `provenance`, `tagline`, top-level dish image, and per-step `equipment` from the original.
2. **Re-state** — same model, separate call. Given the original card, revised card, and the cook's progress markers (doneSteps + checked mise entryKeys), produce `{ newDoneSteps, newCheckedEntryKeys, aiNotes, changes }`. Two passes (instead of one combined) keeps each schema under the complexity ceiling.

Orchestrated by `app/lib/pivot/run.ts:runPivot`.

**Schema additions** (`SavedRecipe`):
- `pivotedFromSavedRecipeId: String?` — back-pointer to the SavedRecipe the cook was on when they tapped the trigger.
- `pivotMeta: Json?` — `{ problemText, aiNotes, changes, revisedCard, createdAt }`. The revised card lives **inside pivotMeta**, not a `RecipeOverride` row, because RecipeOverride is keyed by `(parsedRecipeId, scope)` and a pivot fork would otherwise share its override with the user's other personal save of the same canonical recipe — destroying pivot isolation. `card-resolver.resolveCard` and `resolveCardsForSavedRecipes` short-circuit on `pivotMeta.revisedCard` when present.
- `pivotKept: Boolean @default(false)` — flips true when the user keeps the pivot at end-of-cook. Library tile shows the "Pivot in progress" badge only when `pivotKept = false`.

Pivot rows are **always personal-scope**, even when forked from a family-scope original — pivots are private mid-cook decisions, not auto-published to the family.

**Endpoints**:
- `POST /api/recipes/[id]/pivot` — auth + viewer-access check (owner/family member only, no guests), runs both LLM passes, creates the personal-scope fork with `pivotMeta` set, migrates `MiseCheck` rows for the new entry keys, returns `{ newSavedRecipeId, aiNotes, changes, newDoneSteps }`. The sheet stashes `newDoneSteps` in sessionStorage keyed by the new id; `CookCardView`'s `useState` lazy initializer picks it up on mount and seeds the doneSteps Set so the cook resumes at the right place.
- `POST /api/recipes/[id]/pivot/decision` with `{ action: "keep" | "discard" }` — `keep` flips `pivotKept = true`; `discard` deletes the SavedRecipe (cascades MiseCheck and CookLog). 404 if the row isn't a pivot, 403 if the caller isn't the saver. Surfaced via `app/components/PivotInProgressBanner.tsx` on `/recipe/[id]` whenever `pivotMeta` is set (in-progress AND kept states).
- `POST /api/recipes/[id]/pivot/promote` — **Replace original** (shipped). Writes the pivot's `revisedCard` onto the PARENT's RecipeOverride at the parent's scope (hand-rolled NULL-distinct upsert; `validateCardPayload` keeps `source_url` immutable; `applyCanonicalFallback` fills enrichment the frozen card predates), moves CookLog rows + cookCount/lastCookedAt onto the parent, copies MiseChecks (skipDuplicates), and deletes the pivot row — library goes back to one tile. Caller must own the pivot AND have edit rights on the parent (saver / family member). 409 when the parent is gone. Undo = "Reset to original" on the parent. UI: third button on the in-progress banner + a quiet emerald kept-pivot panel; `promotePivot(id)` in `storage.ts` updates the mirror and returns the parent id for navigation.

**Library + SaveBar interactions**:
- `useSavesForCard` filters out pivot rows (WeakMap-cached for snapshot stability) so SaveBar's scope chips don't double-count.
- `POST /api/recipes` dedupe adds `pivotedFromSavedRecipeId: null` to the `findFirst` so saving the original after a pivot exists creates a fresh row instead of returning the pivot's id.
- `library/page.tsx` keys pivot rows as `pivot:${r.id}` instead of `source_url`, so they bypass the cross-scope tile collapse and earn their own tile.
- `RolodexTile` renders an amber `✨ Pivot in progress` pill (top-left) plus a `Pivot fix: <problemText>` subtitle replacing the tagline, when `tile.pivotInProgress` is set. Kept pivots (`pivotKept = true`) still get their own tile but read as ordinary recipes — no badge, no subtitle.

**`PivotMeta` shape**: server-side type in `app/lib/pivot/meta.ts`. The list and single-fetch endpoints ship `slimPivotMetaForClient(value)` which strips `revisedCard` (the resolver already merged it into the response's `card` field, no need to round-trip).

**Storage helpers**: `pivotRecipe` is implicit (the sheet calls `fetch` directly), but `decidePivot(id, "keep" | "discard")` lives in `app/lib/storage.ts` and updates the local mirror after the server call.

**Abandoned-pivot sweep** (shipped): stale in-progress pivot forks (`pivotMeta != null` AND `pivotKept = false` AND `savedAt` older than 48h) are auto-discarded so the library doesn't accumulate forgotten "Pivot in progress" rows. The sweep predicate lives Prisma-free in `app/lib/pivot/sweep.ts` (`isAbandonedPivot`, `pivotSweepCutoff`, `abandonedPivotScalarWhere`) so vitest covers it (`sweep.test.ts`). `deleteMany` cascades MiseCheck/CookLog. Triggered by the project's first scheduled cron (see Cron jobs below) or manually via `npm run pivot-sweep` (dry-run; `--apply` to delete).

**Open follow-ups**: family-scope pivots if the workflow demands shared cook-rescues.

## Cron jobs

Vercel Cron is the scheduler. **Convention** (established by the pivot sweep, the first cron):
- Route lives at `app/api/cron/<name>/route.ts`, `runtime = "nodejs"`, exports both `GET` (Vercel's scheduler issues a GET) and `POST` (manual rerun) wired to one shared handler.
- First line of the handler: `checkCronAuth(req)` from `app/lib/cron/auth.ts`, which compares `Authorization: Bearer <CRON_SECRET>`. Missing/blank `CRON_SECRET` → 503 (fail closed); mismatch → 401. The helper is Prisma-free and unit-tested (`auth.test.ts`).
- Register the schedule in `vercel.json` under `crons` (`{ path, schedule }`, cron expression in UTC).
- Set `CRON_SECRET` in the Vercel project env. Vercel injects the matching Bearer header automatically on scheduled invocations.
- Pair each cron with an `npm run <name>` script that runs the same shared predicate against Prisma directly, dry-run by default (mirrors `scripts/pivot-sweep.ts`).

## Sprites

- **Single source of truth: Vercel Blob.** `public/sprites/` no longer exists. Each manifest entry carries a `url` (512px display variant) and an `original_url` (high-res 1024 from Gemini, kept for future use).
- Manifest: `sprites/manifest.json`. Each entry has `slug`, `label` (prompt fragment), `aliases`, `url`, optional `original_url`. Shared `style_prompt` controls the visual style.
- Blob layout: `sprites/{slug}.png` (display), `sprites/originals/{slug}.png` (original). Deterministic keys, public access, served via Blob CDN with `next/image` optimization on top.
- Generator: `scripts/generate-sprites.mjs` calls Gemini 2.5 Flash Image (`gemini-2.5-flash-image`) via REST. White-background photoreal style; we **don't** chroma-key — the magenta-key experiment didn't work because Gemini can't reliably paint a uniform pure magenta backdrop.
- After generation, the script writes the Blob URLs back into `sprites/manifest.json`. Commit the manifest change.
- Discover route (`/api/sprites/discover`) generates novel sprites on-demand at parse time, also saving original + display variants and returning the display URL.
- One-time migration script (`scripts/promote-static-to-blob.mjs`) covered the original 18 sprites that pre-existed in `public/sprites/`. They have `url` set but no `original_url` (the high-res sources were lost in the earlier resize step). Re-run `npm run sprites <slug> -- --force` if you want a high-res original for those.
- To add sprites, use the **`add-sprite` skill** at `.claude/skills/add-sprite/SKILL.md` — it covers dedup, label conventions, and the generation command.

## Generated dish photos

Distinct from sprites (which are per-ingredient stills) and from `CookLog.photoUrl` (real photos a user uploaded after cooking): every `ParsedRecipe` can also carry an AI-generated mockup of the finished dish at `cardJson.generated_dish_image_url`. Renders via `MealFace` as a 4th render kind `"generated"`, slotted between real photos and the sprite vignette in the priority ladder (`video > photo > generated > vignette > swatch`). A subtle ✨ badge in the bottom-right of the visual area marks generated images so they don't pose as real cook shots.

- **Generated by**: `scripts/generate-dish-photos.ts` (Node + Prisma + tsx). Calls a local FLUX-based image-gen server (default `http://127.0.0.1:8000`, see `~/Programs/image-gen`), uploads the JPEG to Vercel Blob at `dishes/{parsedRecipeId}.jpg` (deterministic key, `allowOverwrite: true`), and shallow-merges the URL into `ParsedRecipe.cardJson` (does not touch any other fields). Pattern mirrors `scripts/backfill-taglines.ts`.
- **Run it**: `npm run dish-photos` is dry-run by default and prints what it would do. Pass `--apply` to actually generate, upload, and write. Common flags: `--limit N`, `--force` (regenerate even if a URL is already present), or pass specific `ParsedRecipe` IDs as positional args. Local image-gen server must be running; the script health-checks and exits with a clear error if it isn't.
- **Storage cost**: 1024×768 JPEG ≈ 180 KB. ~70 recipes today ≈ 13 MB Blob.
- **Override backfill**: superseded at read time by `applyCanonicalFallback` in `card-resolver` — overrides/pivots missing the URL now inherit it from the parent `ParsedRecipe.cardJson` on every read, no data migration. The write-time script (`npm run backfill:override-dish-photos`, merge logic in `app/lib/dish-image-merge.ts`) still exists for permanently materializing the URL but is no longer required for correctness.

### Planner candidate dish photos

Planner candidates (`MealCandidate.composedCardDraft`) carry their own copy of the same `generated_dish_image_url` field. Two paths to populate it:

1. **`scripts/generate-candidate-dish-photos.ts`** (`npm run candidate-dish-photos`) — same dry-run / `--local-only` / `--apply` flag scheme as the recipe script. Two-pass: tries to reuse the URL from a matching `ParsedRecipe.sourceUrl` first (free hit, but rare since most candidates use synthetic `generated://plan/…` URLs), then falls back to fresh generation via `/dish`. Stores fresh ones at Blob path `dishes/candidate/{candidateId}.jpg`.
2. **Auto-fill from candidate creation pipeline**: `app/api/plans/[id]/candidates/route.ts` calls `backfillCandidateDishPhotos` (in `app/lib/planner/candidate-dish-photo.ts`) via `after()` so generation runs after the response is sent. **No-op unless `IMAGE_GEN_URL` env var is set** — production deploys skip cleanly because there's no Mac to talk to. In dev, it auto-fills new candidates while you keep working.

`MealCandidate.composedCardDraft` is captured into `MenuItem.snapshotCardJson` at publish time (`app/api/plans/[id]/publish/route.ts`), so hosted-menu pages inherit whatever URL was on the candidate at publish.

## Anthropic structured output gotchas

Everything in `app/lib/planner/schemas.ts` has been tuned for Anthropic's `output_config.format.schema` restrictions. When adding schemas that feed `generateObject`:

- **No `minItems > 1` or `maxItems` on arrays.** Use `.describe("3-5 entries")` in the field and keep the count requirement in the prompt. Arrays with `.min(1)` are fine; anything above 1 is rejected.
- **No `minimum` / `maximum` / `exclusiveMinimum` on numbers or integers.** That means no `.int()` (Zod 4 emits safe-integer bounds), no `.positive()`, no `.min(0).max(1)`. Use plain `z.number()` and coerce server-side — e.g. `Math.max(1, Math.round(value))` before writing to a Prisma `Int` column.
- **Schema complexity budget.** Deeply nested / optional-heavy shapes trigger `"Schema is too complex."` Keep LLM draft schemas *minimal* and fill in defaults at insert time. See `CookCardDraft` → `expandDraft()` in `app/lib/planner/card-expand.ts` for the pattern: the LLM produces a stripped `CookCardDraft`, and the server expands it into a full `CookCard` with null-filled fields before persisting.

## Conventions

- Default to **no comments** in code; the few that exist mark non-obvious invariants only.
- All `useEffect` setState anti-patterns flagged by the React 19 ESLint rules — use `useSyncExternalStore` for external store subscriptions (already done in `storage.ts`). The `react-hooks/refs` rule also forbids reading `ref.current` during render; if you need to gate rendering on async state, store the flag in a module-level `Set`/`Map` and expose it via a `useSyncExternalStore` subscription (see `attemptedSingleFetch` in `storage.ts`).
- Keep the `CookCard` schema as the single source of truth: don't compute step state ad-hoc; if you need new fields, add them to `types.ts` AND the API route's `SCHEMA_HINT` AND the system prompt instructions.
- Storage keys are versioned (`cookcard:v1:*`). **Do not change the prefix** without a migration — users have saved data.
- Google profile images (`lh3.googleusercontent.com`) 403 when a `Referer` is attached — every `<Image>` that renders a Google avatar needs `referrerPolicy="no-referrer"`.

## Brand naming

- The product name shown to users is **"Recipe Guide"**.
- Internal type/component names (`CookCard`, `CookCardView`) are kept for code stability — only user-facing strings have been renamed. Don't rename internals unless asked.

## Workflow

- Type-check: `npx tsc --noEmit`
- Lint: `npx eslint app`
- Tests: `npm test` (Vitest, run mode). Watch: `npm run test:watch`. Tests are colocated as `*.test.ts` next to the module they cover. Pure-function modules only — vitest has no path-alias setup, so anything importing `@/app/lib/prisma` will fail to load. Extract testable helpers into Prisma-free modules (see `card-scope.ts` next to `card-resolver.ts` for the pattern).
- Dev: `npm run dev` (already running in background during sessions; restart if env vars change OR after `npx prisma generate` so the running process picks up new types).
- Sprites: `npm run sprites [-- --force] [<slug>...]`

**Schema migrations against production**: `DATABASE_URL_UNPOOLED` in `.env.local` points at production Neon. The harness blocks `prisma migrate dev` and shadow-DB diffs against production for safety. To apply a schema change:
1. Edit `prisma/schema.prisma`.
2. Generate the SQL via `git show HEAD:prisma/schema.prisma > /tmp/prev.prisma && mkdir -p prisma/migrations/<UTC-timestamp>_<slug> && npx prisma migrate diff --from-schema /tmp/prev.prisma --to-schema prisma/schema.prisma --script --output prisma/migrations/<UTC-timestamp>_<slug>/migration.sql` — pure file-to-file diff, no DB touched. **Use `--output`, not stdout redirection** — Prisma emits a log line (`◇ injected env …`) to stdout that contaminates the SQL file and breaks `migrate deploy` with a `42601` syntax error.
3. (skip — step 2's `--output` already wrote the file)
4. Apply with `npx prisma migrate deploy` (forward-only, never resets).
5. `npx prisma generate` and restart the dev server.
