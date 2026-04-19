@AGENTS.md

# Recipe Guide — project notes for Claude

A Next.js 16 app that turns any recipe URL into a one-screen "recipe guide": a mise en place, a step timeline, per-step countdown timers, and ingredients re-attached to the step that uses them.

## Architecture

- **`app/api/parse/route.ts`** — POST { url } → strips HTML, sends to Claude (`claude-opus-4-7`) with a system prompt that returns a strict JSON shape matching `app/types.ts`. Re-attaches each ingredient to the step that actually uses it. Picks one of 12 step icon enum values.
- **`app/types.ts`** — `CookCard`, `Step`, `Ingredient`, `StepIcon`. The schema returned by the parser and consumed everywhere.
- **`app/components/CookCardView.tsx`** — top-level recipe renderer. Composes `Scaler`, `MisePlace`, `Timeline`, `StepIcon`, `StepTimer`. Holds the `factor` (scale) and `doneSteps` state for one card.
- **`app/components/MisePlace.tsx`** — aggregated ingredient grid. Each tile is a button that toggles a "got it out" check (persisted per-recipe via `useMiseChecks`).
- **`app/components/Timeline.tsx`** — proportional segment bar; click a segment to scroll to that step.
- **`app/components/StepTimer.tsx`** — Start/Pause/Reset countdown. Range durations fire two alerts (low end → "checking" state, high end → "done"). On expiry beeps via WebAudio + browser Notification + auto-scroll to next step.
- **`app/lib/storage.ts`** — localStorage-backed CRUD with `useSyncExternalStore` hooks. Two stores: saved recipes (`cookcard:v1:recipes`) and per-recipe mise checks (`cookcard:v1:mise:<id>`). `markCooked` clears that recipe's mise checks. **The exported interface (`saveRecipe`, `getRecipe`, `markCooked`, `useSavedRecipes`, `useSavedRecipe`, `useMiseChecks`) is the boundary** — swap localStorage for a server backend later by reimplementing this file only.
- **`app/lib/scale.ts`** — fraction parsing/formatting. Handles vulgar fractions (½, ⅓, ¼, …), mixed numbers (`1 1/2`), ranges (`8-10`), and decimals.
- **`app/lib/duration.ts`** — `parseMinutesRange` returns `{ low, high }` minutes from strings like `10-15 minutes`, `1 hour`, `30 sec`.
- **`app/lib/aggregate.ts`** — sums ingredients across steps + pantry into mise entries, keyed by `(slug || normalized item, unit)`.
- **`app/lib/sprites.ts`** — `findSprite(name)` does substring match against the alias index from `sprites/manifest.json`, longest-alias-first.

## Sprites

- Manifest: `sprites/manifest.json`. Each entry has `slug`, `label` (prompt fragment), `aliases`. Shared `style_prompt` controls the visual style.
- PNGs live in `public/sprites/{slug}.png` and ARE committed.
- Generator: `scripts/generate-sprites.mjs` calls Gemini 2.5 Flash Image (`gemini-2.5-flash-image`) via REST. White-background photoreal style; we **don't** chroma-key — the magenta-key experiment didn't work because Gemini can't reliably paint a uniform pure magenta backdrop.
- To add sprites, use the **`add-sprite` skill** at `.claude/skills/add-sprite/SKILL.md` — it covers dedup, label conventions, and the generation command.

## Conventions

- Default to **no comments** in code; the few that exist mark non-obvious invariants only.
- All `useEffect` setState anti-patterns flagged by the React 19 ESLint rules — use `useSyncExternalStore` for external store subscriptions (already done in `storage.ts`).
- Keep the `CookCard` schema as the single source of truth: don't compute step state ad-hoc; if you need new fields, add them to `types.ts` AND the API route's `SCHEMA_HINT` AND the system prompt instructions.
- Storage keys are versioned (`cookcard:v1:*`). **Do not change the prefix** without a migration — users have saved data.

## Brand naming

- The product name shown to users is **"Recipe Guide"**.
- Internal type/component names (`CookCard`, `CookCardView`) are kept for code stability — only user-facing strings have been renamed. Don't rename internals unless asked.

## Workflow

- Type-check: `npx tsc --noEmit`
- Lint: `npx eslint app`
- Dev: `npm run dev` (already running in background during sessions; restart if env vars change)
- Sprites: `npm run sprites [-- --force] [<slug>...]`
