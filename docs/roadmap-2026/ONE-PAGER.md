# Recipe Guide — One-Pager (2026-04-28)

## The bet

Recipe Guide started as a one-screen execution guide for a single recipe. The next arc turns it into a household meal-management utility — built for Andrew, Alicia, and two picky kids running one weekly grocery trip across three shifting modes (use-up, explore, survival) — and lays the primitives for a cross-family cookbook protocol where menus, recipes, and grocery lists are shareable artifacts. We defend the execution layer; everything new layers on top.

## What's broken today

- The planner ends in a static text-block menu — candidates have no face, no preview of what a meal looks or feels like.
- After commit, there is no household-shaped execution surface — just the per-recipe page, with no answer to "what's tonight, who's cooking, when do I start."
- There is no cross-household primitive — sharing means fork-by-link gymnastics; no way to publish a guest-facing menu or hand a grocery list to a delegated shopper.

## What we're building (top 6, priority order)

| # | Phase | Feature | Value | Size |
|---|-------|---------|-------|------|
| 1 | P1 | Profile + ProfilePreference | Eaters become rows, not JSON. Kids learn over time. | M |
| 2 | P1 | `<MealFace />` + candidate redesign + Peek sheet | Every candidate has a face before you commit. | M+M |
| 3 | P1 | Tonight surface (`/plan/[id]/tonight`) | One glanceable screen: what's cooking, who, when. | L |
| 4 | P1 | PantryItem + grocery write-back | Pantry stops resetting every Sunday. Unblocks cascade + delegate share. | M |
| 5 | P2 | Hosted Menu (promoted plan + `/menu/[slug]`) | A publishable menu artifact your in-laws screenshot. | L |
| 6 | P2 | FamilyEvent channel + Meezing presence + grocery cascade | Alicia's olive-oil purchase pre-checks Wednesday's mise. | L |

Twenty-one items in the agreed backlog; these six carry the arc.

## Phasing

- **Phase 1 — Make planning feel alive (~2 weeks).** Items 1–12: PlanEvent log, Profile, Pantry, MealFace, candidate redesign, Tonight, mode chooser, grocery→mise cascade via tab-load reconciliation. *Outcome: the planner remembers the kids, the pantry persists, candidates have faces, Tonight tells you what to cook.*
- **Phase 2 — Connect the household (~3–4 weeks).** Items 13–21: FamilyEvent channel + SSE, Meezing presence, MealOutcome → profile learning, mid-week pivots, Hosted Menu, sprite-driven grocery list, delegate grocery share, public recipe share token, notification inbox. *Outcome: the household syncs, kids' thumbs train the planner, the Saturday dinner has a publishable menu.*
- **Phase 3 — Compound the network (ongoing).** Cross-family shelves, deep-link grocery automation, smart re-orders, friends graph (only if evidence appears).

## What we cut (and why)

- **Voice intake / hands-free cook** — Alicia plans with a glass of wine, not voice commands; TTS route is prototype-fragile.
- **Calendar grid view** — settled by `project_menu_not_calendar.md`; a week is a menu, not a calendar.
- **Multi-week planning / plan templates** — violates the one-grocery-trip-per-week invariant.
- **Friends graph + activity feed** — no contact-import path, no friends in the system; network effect cannot start.
- **RecipeComment threads** — Slack-for-cooking rot risk; reduced to a notification table only.
- **"Just the gist" Alicia render mode** — risks `CookCardView` drift; Alicia already ad-libs by ignoring timers.

## Decisions settled (2026-04-28)

1. **Post-cook share chip on SaveBar — APPROVED.** Additive carve-out; does not modify `CookCardView`.
2. **Hosted Menu — PUBLIC-BY-TOKEN.** `/menu/[slug]` is anyone-with-URL; no auth wall. Publish is explicit.
3. **Grocery Phase 3 partner — AMAZONFRESH.** Vendor-agnostic deep-link (3.1) ships as universal fallback first.
4. **Family privacy — UNCHANGED.** No per-user privacy within a family; kid `Profile` data visible to all members.

**New direction (2026-04-28):** Sprite generation pivots to OpenAI `gpt-image-1` with `background: "transparent"`. Foundational visual upgrade — turns still-life compositions from "rotated cards on a wash" into "ingredients floating on cream paper, shadows mingling." Ships as item 1.13, *before* `<MealFace />` lands.

## North-star metric (proposed)

Time from sitting down to plan to having a queued menu and a one-grocery-trip list — under 8 minutes — with at least one Tonight pick already chosen and a pantry that survives to next week.

## Pull-quote

*"Make the planner feel like leafing through a beautifully-photographed weekly menu at a restaurant — every meal has a face before you commit to it, the act of choosing is sensory, and the artifact you publish is the kind of thing they'd screenshot."*
