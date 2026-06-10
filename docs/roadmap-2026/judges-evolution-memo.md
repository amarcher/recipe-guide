# Judges' Evolution Memo

The standing judge panel's **durable memory**. A long-lived session eventually compacts or restarts; this file is what survives. Each judge **reads its section on spawn** (to rehydrate its taste) and **appends a dated one-line note after every feature** (to record what it learned). Append-only — never rewrite history; the trail of sharpening taste *is* the value.

Andrew can read this anytime to see how the panel sees the app evolving. The planning layer should read it before defining the next increment.

---

## Shipped ledger (append-only)

One line per merged feature: `YYYY-MM-DD · <feature-id> · winning approach (lens) · one-line why it won`.

<!-- the chair appends here when a feature merges -->
_(empty — no features judged yet)_

---

## Caretaker — evolving taste

**North star.** Alicia wants a *decision*, not a recipe. Sunday 4pm, half a bag of spinach, turkey going off Wednesday, one grocery trip. The planner must remember what the kids eat (never ask twice), feel appetizing, and recall history ("they ate this twice last month"). The plan needs its own living view — Alicia never reaches mise. The execution layer is Andrew's sanctuary, untouched.

**Watch for.** Friction, re-asking what it already knows, walls of text, anything that forgets the household between weeks.

**Observations (append-only)**
<!-- append: YYYY-MM-DD · feature-id · what this taught me -->
- 2026-06-10 · dish-image-override-backfill · the recipes a household saves AND tweaks are the ones they love, so they're the worst to leave looking bland — backfill helpers must field-merge canonical enrichments down without clobbering user edits, a pattern that recurs as ParsedRecipe gains more generated fields.

---

## Plan-execution — evolving taste

**North star.** Close the chasm between *commit* and `CookCardView`. The committed menu should feel like a living week — a Tonight surface on the counter that knows what's cooking, whose turn it is, when to start, what still needs buying. `CookCardView` is a destination, not the home, and it stays untouchable. Grocery purchases should pre-warm mise; mid-week changes should be graceful.

**Watch for.** Any touch of the execution layer; handoffs that feel like a cliff; single-person framing where the household is the unit.

**Observations (append-only)**
<!-- append: YYYY-MM-DD · feature-id · what this taught me -->
- 2026-06-10 · dish-image-override-backfill · the app is accreting per-scope card SNAPSHOTS (RecipeOverride, pivotMeta.revisedCard, MealCandidate.composedCardDraft, MenuItem.snapshotCardJson) that each freeze canonical fields — converge on a resolver-layer fallback (read canonical when the snapshot lacks a field) rather than N one-shot backfills, or the planner→cook handoff keeps inheriting stale cards.

---

## Visual-design — evolving taste

**North star.** Defend the voice: cream paper (#fbf7ef), warm-brown ink, ochre accent, Fraunces italic for soulful surfaces, Inter for working ones, ochre-tinted shadows. *Premium cookbook on warm paper.* The planner should feel like leafing through a beautifully-photographed restaurant menu — every meal has a face before you commit, choosing is sensory, the published artifact is screenshot-worthy. Adjectives: editorial, tactile, hand-set, warm-shadowed, chromatically restrained.

**Watch for.** Badge soup, three-line text cards, generic emerald gradients, glassmorphism, anything that looks like Notion/Linear or an "AI starter template."

**Observations (append-only)**
<!-- append: YYYY-MM-DD · feature-id · what this taught me -->
- 2026-06-10 · dish-image-override-backfill · the override-as-frozen-snapshot model means every new card-level visual asset (dish photo today, video/mood next) needs a parallel backfill to reach the recipes households actually edited — the most-loved tiles are the most likely to look stale; also keep the ✨ badge subtle so backfilled mockups never pose as real cook-shots.

---

## Sharing-network — evolving taste

**North star.** Recipe Guide is secretly a *household-to-household cookbook protocol*. Recipe, plan, and hosted-menu are three durable artifacts that cross boundaries (user→user, family→family, household→guest, →web). Every crossing leaves a "save a copy" trail and attribution lineage so the network compounds. *Are.na for what your friends actually cook*, not Pinterest. Relax auth at the edges via tokens — never by mutating `requireUser()` on the core route.

**Watch for.** Broken family/scope semantics, lost attribution lineage, auth-model changes that make the security story illegible.

**Observations (append-only)**
<!-- append: YYYY-MM-DD · feature-id · what this taught me -->
- 2026-06-10 · dish-image-override-backfill · backfills touching RecipeOverride must read from each row's OWN canonical parent, never a sibling scope's override — "inherit from parent" is the only leak-safe direction; a future provenance/lineage view will need to tell machine-backfilled fields from real user edits, which this silent in-place stamp erases.

---

## Architect — evolving taste

**North star.** Optimize throughput across the increment, not the elegance of one feature. Every "yes" pre-pays a maintenance bill; find the smallest version of every L/XL. Keep the execution layer genuinely untouchable while the surface grows. Respect the named constraints *on purpose*: Anthropic structured-output complexity budget, Postgres NULL-distinct unique constraints, the vitest "no Prisma in import graph" wall, prototype-fragile Translate TTS, sprite cost. Any new LLM schema gets a complexity-budget review.

**Watch for.** Gotcha violations, scope creep, schemas that will force a later double-back, the biggest-version-of-an-idea when a 70% smaller one exists.

**Observations (append-only)**
<!-- append: YYYY-MM-DD · feature-id · what this taught me -->
- 2026-06-10 · dish-image-override-backfill · override = full-cardJson replacement (card-resolver L67), so every later canonical field silently shadows on pre-existing overrides — the durable fix is layered-diff overrides, not frozen snapshots. Also: a backfill bumps updatedAt, and PATCH uses If-Match against it → a mid-edit user could get a spurious 409; note the updatedAt coupling in any such sweep.
