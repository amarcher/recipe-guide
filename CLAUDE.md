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
- **`app/lib/cook-session.ts`** — single active cooking session (`cookcard:v1:session`). Starting acquires a Screen Wake Lock (re-acquired on `visibilitychange` since browsers drop it when the tab hides); finishing calls `markCooked` + clears that recipe's timers. The `SaveBar` Start cooking / Finish cook toggle is the UI entry point — there is no retrospective "I cooked this" button.
- **`app/lib/alarm.ts`** — shared unlocked `AudioContext` + `primeAudio()` (called from the Start button so later beeps survive the mobile autoplay gate), `playBeep`, `vibrate`, `speakText` (Web Speech), `notify` (Notification). `playBeep` returns `false` when the context is blocked so the caller can log a diagnostic.
- **`app/lib/cast.ts`** + **`app/components/CastButton.tsx`** — Google Cast Web Sender prototype using the Default Media Receiver (`CC1AD845`). Namespacing gotcha: `CastContext`, `SessionState`, and event-type enums live under `cast.framework.*`; everything else (`AutoJoinPolicy`, `MediaInfo`, `LoadRequest`, `MetadataType`, `GenericMediaMetadata`) lives under `chrome.cast.*`. When connected, `StepTimer` calls `speakOnCast()` alongside local alarms.
- **`app/api/tts/route.ts`** — Node route that proxies Google Translate TTS → `audio/mpeg`, chunked to <200 chars per segment. **Prototype-fragile**: Translate TTS is undocumented and can break without warning. Swap for a real TTS provider (ElevenLabs, Google Cloud TTS, Polly) before relying on this in production.
- **`app/lib/storage.ts`** — localStorage-backed CRUD with `useSyncExternalStore` hooks. Two stores: saved recipes (`cookcard:v1:recipes`) and per-recipe mise checks (`cookcard:v1:mise:<id>`). `markCooked` clears that recipe's mise checks. **The exported interface (`saveRecipe`, `getRecipe`, `markCooked`, `useSavedRecipes`, `useSavedRecipe`, `useMiseChecks`) is the boundary** — swap localStorage for a server backend later by reimplementing this file only.
- **`app/lib/scale.ts`** — fraction parsing/formatting. Handles vulgar fractions (½, ⅓, ¼, …), mixed numbers (`1 1/2`), ranges (`8-10`), and decimals.
- **`app/lib/duration.ts`** — `parseMinutesRange` returns `{ low, high }` minutes from strings like `10-15 minutes`, `1 hour`, `30 sec`.
- **`app/lib/aggregate.ts`** — sums ingredients across steps + pantry into mise entries, keyed by `(slug || normalized item, unit)`.
- **`app/lib/sprites.ts`** — `findSprite(name)` does substring match against the alias index from `sprites/manifest.json`, longest-alias-first.

## Sprites

- **Single source of truth: Vercel Blob.** `public/sprites/` no longer exists. Each manifest entry carries a `url` (512px display variant) and an `original_url` (high-res 1024 from Gemini, kept for future use).
- Manifest: `sprites/manifest.json`. Each entry has `slug`, `label` (prompt fragment), `aliases`, `url`, optional `original_url`. Shared `style_prompt` controls the visual style.
- Blob layout: `sprites/{slug}.png` (display), `sprites/originals/{slug}.png` (original). Deterministic keys, public access, served via Blob CDN with `next/image` optimization on top.
- Generator: `scripts/generate-sprites.mjs` calls Gemini 2.5 Flash Image (`gemini-2.5-flash-image`) via REST. White-background photoreal style; we **don't** chroma-key — the magenta-key experiment didn't work because Gemini can't reliably paint a uniform pure magenta backdrop.
- After generation, the script writes the Blob URLs back into `sprites/manifest.json`. Commit the manifest change.
- Discover route (`/api/sprites/discover`) generates novel sprites on-demand at parse time, also saving original + display variants and returning the display URL.
- One-time migration script (`scripts/promote-static-to-blob.mjs`) covered the original 18 sprites that pre-existed in `public/sprites/`. They have `url` set but no `original_url` (the high-res sources were lost in the earlier resize step). Re-run `npm run sprites <slug> -- --force` if you want a high-res original for those.
- To add sprites, use the **`add-sprite` skill** at `.claude/skills/add-sprite/SKILL.md` — it covers dedup, label conventions, and the generation command.

## Conventions

- Default to **no comments** in code; the few that exist mark non-obvious invariants only.
- All `useEffect` setState anti-patterns flagged by the React 19 ESLint rules — use `useSyncExternalStore` for external store subscriptions (already done in `storage.ts`).
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
