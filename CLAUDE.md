@AGENTS.md

# Recipe Guide — project notes for Claude

A Next.js 16 app that turns any recipe URL into a one-screen "recipe guide": a mise en place, a step timeline, per-step countdown timers, and ingredients re-attached to the step that uses them.

## Architecture

- **`app/api/parse/route.ts`** — POST { url } → strips HTML, sends to Claude (`claude-opus-4-7`) with a system prompt that returns a strict JSON shape matching `app/types.ts`. Re-attaches each ingredient to the step that actually uses it. Picks one of 12 step icon enum values.
- **`app/types.ts`** — `CookCard`, `Step`, `Ingredient`, `StepIcon`. The schema returned by the parser and consumed everywhere.
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

**Design documents**:
- `design-slot-split.html` — the decision deck for the two-row-per-split-slot schema (adults + kids).
- `design-planner-walkthrough.html` — walkthrough of the full intake→skeleton→candidates→commit→grocery→cook loop.

## Cook Logs & Photos

- **`CookLog(savedRecipeId, userId, cookedAt, photoUrl?, photoUploadedAt?, notes?)`** — one row per "I cooked this" event. Created inside `POST /api/recipes/[id]/cooked` alongside the `cookCount` increment; the response returns `cookLogId` so the SaveBar can immediately open the photo prompt pointed at that log.
- **`POST /api/cook-logs/[id]/photo`** — multipart upload. `sharp` resizes to max 1600px and re-encodes as JPEG before uploading to Vercel Blob at `cooklogs/{cookLogId}.jpg` (deterministic key, `allowOverwrite: true`).
- **`POST /api/recipes/[id]/photo`** — the library-side upload path. Upserts the photo onto the user's latest `CookLog` for that recipe, or creates a "photo-only" log (no cookCount bump) if none exists. Lets users add a photo anytime without pretending they just cooked it.
- **`CookPhotoPrompt`** (`app/components/CookPhotoPrompt.tsx`) — post-finish-cook affordance on the SaveBar. Amber panel with camera-capable file input; on upload flips to an emerald confirmation with the thumbnail.
- **`LibraryCardMedia`** (`app/library/LibraryCardMedia.tsx`) — the top of every library card. Renders the latest photo from `CookLog` as a 16:9 thumbnail; becomes a drag-drop target for image files; always shows a corner "Add photo" / "Change" button for non-drag flows. `router.refresh()` after upload to pull the newly stored URL.
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
  - Planner: `WeeklyPlan`, `IntakeMessage`, `MealCandidate`, `PlannedMeal`, `GroceryItem` — see the Weekly Planner section above.
- **Server-persisted today**: recipes CRUD (`/api/recipes`, `/api/recipes/[id]`, `.../cooked`, `.../mise`, `.../photo`), cook log photos (`/api/cook-logs/[id]/photo`), families (`/api/families`, `/api/families/[id]`), invites (`/api/invites/[code]`), and the full planner API tree under `/api/plans`.
- **Still localStorage-only**: per-step timers (`cookcard:v1:timer:*`) and the single active cook session (`cookcard:v1:session`). These are device-local by design — a timer running on the phone in the kitchen shouldn't follow you to the laptop.
- **Prisma workflow**: `npx prisma migrate dev --name <slug>` for schema changes; `npx prisma generate` after pulling if the client is stale. Migrations in `prisma/migrations/`.

## Sprites

- **Single source of truth: Vercel Blob.** `public/sprites/` no longer exists. Each manifest entry carries a `url` (512px display variant) and an `original_url` (high-res 1024 from Gemini, kept for future use).
- Manifest: `sprites/manifest.json`. Each entry has `slug`, `label` (prompt fragment), `aliases`, `url`, optional `original_url`. Shared `style_prompt` controls the visual style.
- Blob layout: `sprites/{slug}.png` (display), `sprites/originals/{slug}.png` (original). Deterministic keys, public access, served via Blob CDN with `next/image` optimization on top.
- Generator: `scripts/generate-sprites.mjs` calls Gemini 2.5 Flash Image (`gemini-2.5-flash-image`) via REST. White-background photoreal style; we **don't** chroma-key — the magenta-key experiment didn't work because Gemini can't reliably paint a uniform pure magenta backdrop.
- After generation, the script writes the Blob URLs back into `sprites/manifest.json`. Commit the manifest change.
- Discover route (`/api/sprites/discover`) generates novel sprites on-demand at parse time, also saving original + display variants and returning the display URL.
- One-time migration script (`scripts/promote-static-to-blob.mjs`) covered the original 18 sprites that pre-existed in `public/sprites/`. They have `url` set but no `original_url` (the high-res sources were lost in the earlier resize step). Re-run `npm run sprites <slug> -- --force` if you want a high-res original for those.
- To add sprites, use the **`add-sprite` skill** at `.claude/skills/add-sprite/SKILL.md` — it covers dedup, label conventions, and the generation command.

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
- Dev: `npm run dev` (already running in background during sessions; restart if env vars change)
- Sprites: `npm run sprites [-- --force] [<slug>...]`
