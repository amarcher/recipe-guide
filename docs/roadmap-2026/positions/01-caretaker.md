# Family Caretaker UX — position

## Lens

I carry the pain of the **primary planner** — Alicia, but really any stressed parent. Sunday 4pm, fridge has half a bag of spinach and a pound of ground turkey going off Wednesday. Kids will eat noodles, plain chicken, some cheese, that weird thing with rice. One grocery trip tomorrow morning. She doesn't want a recipe; she wants a decision. She'll ad-lib most of it. The current planner (`/plan/[id]/page.tsx`) hands her a wall of text — title, summary, rationale, clock icon, sprite circles. Correct, but unappetizing: nothing to look at, no reason to feel hungry, no recall of "the kids ate this twice last month." It also asks her every single week what the kids eat — the planner equivalent of an app that forgets your name at every login. The execution layer (`CookCardView`) is Andrew's sanctuary and stays untouched — but the *plan itself* needs its own execution view, because Alicia lives there and never moves on to mise.

## Top features (prioritized, P0–P2)

### P0 — Persistent Kid Profile (stop forgetting what the kids eat)
**Pitch.** First-class `KidProfile` and `EaterPreference` models the intake chat reads from and writes to. "Reliable hits" and "hard nos" are not one-shot extractions into `WeeklyPlan.intake.kidRules` (`prisma/schema.prisma:282`) — they're per-child, longitudinally-updated profiles that survive across plans and learn from cook outcomes.

**Why this lens.** The biggest insult the current planner offers Alicia is asking, every Sunday, what her kids eat. She knows. She told you. Today `kidRules` lives inside `WeeklyPlan.intake` JSON — every plan starts the kids' palates from zero.

**Implementation sketch.**
- `KidProfile(id, familyId, name, ageBand?, avatarColor)` — names so "Ezra hates onions" is a per-kid rule, not aggregated `KIDS`.
- `EaterPreference(id, familyId, kidProfileId?, slug, kind: RELIABLE|HARD_NO|EXPERIMENTING|GROWING_OUT, source, lastConfirmedAt, evidenceCount)`. Promote/demote on cook outcomes (next item).
- Intake chat hydrates: instead of "what do the kids eat?" → "Mae was experimenting with broccoli last month — still going?"
- Skeleton + candidate prompts in `app/lib/planner/prompts.ts` get an EATER_HISTORY block. `hardFilterReason` in `scoring.ts:51` reads `EaterPreference.kind = HARD_NO` instead of `intake.kidRules.hardNos`.

**T-shirt: L.** Schema + migration + prompt rework + scoring rework + small `/family/kids` settings page.

**Risks.** Gold-plating — resist a palate matrix. The win is one contextual toggle: "Ezra: still eats this? yes/no/skip", not a settings screen.

---

### P0 — Plan Execution View ("What are we eating tonight?")
**Pitch.** A new surface at `/tonight` (or `/plan/[id]` default once committed) answering one question: *given today's energy and the queue, what should I cook in the next hour?* Once meals are committed today, the planner page just sits there. The queue should *behave* like a menu — picture-forward, time-to-table forward, kid-impact forward.

**Why this lens.** Per `project_menu_not_calendar.md`, the week is a menu. But it's currently rendered as word-rows in `MenuView.tsx:142` (`QueueView`) — `<title> · <eater icon> · <X min> · [Cook]`. That's a database admin panel, not a menu. Alicia decides by feel; she needs a glanceable surface that surfaces "fastest path" / "uses the spinach before it dies" / "kids approved last time" as primary affordances, not buried badges.

**Implementation sketch.**
- New page or `status >= COMMITTED` mode of `/app/plan/[id]/page.tsx`.
- Render queued `PlannedMeal` rows as full-bleed tiles using `RolodexTile`'s vignette/photo logic — recall photos via `CookLog.photoUrl` joined through the candidate's source `ParsedRecipe` if the household has cooked it before; else a hero-ingredient sprite vignette.
- Tile chrome: cook time, eater indicator, "must use" pantry ribbon (*"uses the turkey"*), kid-approval streak ("Mae 3/3, Ezra 2/3").
- Sort modes: *Mood*, *Speed*, *Use it up*, *Kids will eat*.
- Tapping expands to summary/rationale; CTAs **Cook** (existing `meals/[mealId]/cook`) and **Just the gist** (see Spark #1).

**T-shirt: L.**

**Risks.** Don't let "Just the gist" become a parallel CookCardView with drift. Render from the same `CookCard` JSON; CSS-mode of the existing reader, not a fork.

---

### P0 — Pantry-as-a-Surface (inventory-aware planning)
**Pitch.** Promote pantry from a one-shot intake question to a persistent, household-shared inventory the planner reads at skeleton time and the grocery list writes back into at purchase time. "What's in the fridge about to die?" becomes a glanceable list, not something Alicia recites each Sunday.

**Why this lens.** The user explicitly asked to "have inventory in their house for such a thing." Today `PlanIntake.pantry` (`schemas.ts:46`) is ephemeral; next week she retypes the same olive oil and rice that have been there six months.

**Implementation sketch.**
- `PantryItem(id, familyId, slug, display, unit?, quantity?, addedAt, expiresAt?, mustUseBy?, source: GROCERY|MANUAL|COOK_DEDUCT)`.
- `GroceryItem.purchased = true` upserts into `PantryItem` (slug/unit dedupe, mirrors mise aggregation) — closes the loop in `project_synchronized_execution.md`.
- `expiresAt` heuristic per slug class (proteins: 3d; greens: 5d; staples: null). Override-able.
- Skeleton + candidate prompts read pantry as injected block. `scoring.ts mustUseHits` reads `PantryItem.mustUseBy < weekEnd`.
- Tiny `/family/pantry` page, also embeddable as a top-of-`/plan` strip with a "use me" pulse on about-to-expire rows.

**T-shirt: M** for schema + grocery write-back; **L** with inventory page.

**Risks.** Inventory rot — if pantry isn't used, it lies. Mitigate: never block a flow on pantry accuracy; treat it as *signal*, not constraint. Grocery-write-back is the only auto-update.

---

### P1 — Cook Outcome Capture ("Did the kids eat it?")
**Pitch.** When a `PlannedMeal` is marked cooked, surface a 5-second per-eater thumbs prompt (Mae up, Ezra down, Adults up). Persist as `MealOutcome` rows that feed back into `EaterPreference`.

**Why this lens.** The reason Alicia can't outsource planning to the LLM is the LLM doesn't know what worked. `cookCount`/`lastCookedAt` don't tell you *did the kids actually eat the broccoli pasta or did half of it go in the trash.* That's the data that closes the kid-profile loop.

**Implementation sketch.**
- `MealOutcome(id, plannedMealId, kidProfileId?, eaterRole: ADULT|KID, verdict: ATE|PICKED|REFUSED, notes?, createdAt)`.
- Hook into the existing `CookPhotoPrompt` placement on the SaveBar. Finish Cook → photo → outcome row with avatars and three taps each.
- `EaterPreference.evidenceCount` increments; 3x ATE → promote to RELIABLE; 2x REFUSED → demote from RELIABLE to EXPERIMENTING (don't auto-create HARD_NO — kids' nos are noisy).
- Aggregate slugs from `composedCardDraft` ingredients via `findSprite` (the matcher `scoring.ts allSlugs` already uses).

**T-shirt: M.**

**Risks.** Friction. Skippable, default-collapsed, "same as last time" one-tap. Andrew won't use it; fine. It's Alicia's loop.

---

### P1 — Kid Lane (a parallel sub-menu, not a footnote)
**Pitch.** Treat the kid track as its own first-class plane: separate tab in `MenuView.tsx` with a rotation library that rotates so the kids don't have noodles five nights running.

**Why this lens.** Current treatment — kid-only sections in an amber panel inside `SectionView` (`MenuView.tsx:286`) — treats kids as a special case of the adult flow. Alicia's reality is the inverse: the kid plan is a fixed, low-decision rotation, the adult plan is the variable part.

**Implementation sketch.**
- Tab-switch on `/plan` between Adults / Kids / Together; side-by-side on wide screens.
- Separate skeleton sub-prompt nominating a *kid rotation* ("Mon: pasta-butter, Tue: chicken-rice, Wed: leftovers, Thu: bagel night, Fri: dino nuggets") biased toward `EaterPreference.kind = RELIABLE` with explicit "repeat-OK" semantics (existing `SlotMode.REPEAT` is underused).
- Per-kid "I'm bored of this" → 14-day cool-down on a slug.

**T-shirt: L.**

**Risks.** Splitting the UI risks losing the "together" night that's actually the win. Keep "Together" the default; Adults/Kids are zoom-in views.

---

### P2 — Guest Menu / Hosting Mode
**Pitch.** Auto-generate a shareable menu page from a plan — titles, taglines, ingredient teasers, dietary flags, plus a "share with the children" mode explaining dinner in kid-language with a sprite per dish.

**Why this lens.** The user explicitly asked for "publishing a menu for guests." Infra is half-built: `tagline` exists on `CookCard`, sprites render anything, share-by-link / guest-view is live via `viewerAccess: "guest"`. Hosting is a layer, not a new product.

**Implementation sketch.**
- `PublishedMenu(id, planId, slug, title, hostNote, dietaryFlags, publishedAt, expiresAt?)` linking chosen `PlannedMeal`s.
- `/menu/[slug]` rendered with `RolodexTile`'s vignette/photo treatment + a host-note block.
- "For the kids" toggle: same menu, bigger sprites, "tonight we're eating chicken and rice" copy. One small LLM call from title + heroIngredients.
- Guest "Save a copy" via existing `POST /api/recipes/[id]/fork`.

**T-shirt: M** basic publish; **L** with kid-mode rendering.

**Risks.** Scope creep into RSVP/event-management. Stay in lane: static publish, not Paperless Post.

---

### P2 — Mode Memory ("It's a survival week")
**Pitch.** One-tap mode chooser at plan creation: `[Use up] [Explore] [Survival]`. Pre-fills intake and skips half the questions.

**Why this lens.** Per `stakeholders.md`, Alicia named the three modes. The intake chat asks for the vibe every single week.

**Implementation sketch.** Extend `WeeklyPlan` with `mode: PlanMode` enum; chooser before intake. Pre-seed `IntakeMessage` with a synthetic user message ("survival week") so existing extraction keeps working. Optional household-default (survival weeks come in runs).

**T-shirt: S.** **Risks.** None significant.

## Sparks (cross-cutting provocations)

1. **"Just the gist" is a third execution surface** — between Andrew's full `CookCardView` and a flat recipe page lives an Alicia-shaped ad-libber view: ingredients in mise format, step *headlines* (not actions), no timers, no progress state. Not a dilution of `CookCardView`; a sibling that renders the same `CookCard` JSON with a different style sheet. The execution layer stays untouched. The sharing/hosting agent will want this for guest menus too.

2. **Family-of-families is one schema decision away.** `Family` already supports multi-user shared libraries, and `RecipeOverride` cleanly separates personal vs family vs canonical. The natural cross-family primitive is **a `Cookbook`** — a curated, shareable subset of recipes one family publishes and another subscribes to. Grandma publishes "things the grandkids ate," Alicia subscribes; her `KidProfile` seeds from the cookbook's tagged-reliable list. Not a new social graph — just `SavedRecipe` with a `cookbookId`.

3. **Contrarian: candidate cards should look more like Instagram, less like a database.** Today's tile is title + 1-line summary + 1-line rationale + badges + clock + 4 sprite chips. Reduce to: a generated/cached hero photo (or a composed plate-on-table sprite vignette), title, time-to-table, and one decision-grade signal (kid-streak / mustUse / under-30). Rationale moves to long-press. Alicia's eye picks on appetite and energy, not text.

## Dissent / pushback

- **"Calendar view for the week."** Someone will propose a Mon-Fri grid because it looks tidy. Resist. Per `project_menu_not_calendar.md` this is settled — meals are a menu, day assignment is advisory. A calendar would re-introduce false precision and pressure Alicia to commit to "Tuesday is fish night" when fish night is whenever the energy and the fridge agree. If we ship a calendar, it's *retrospective* — derived from `cookedAt` — not a planning surface.

- **"Voice-driven planning / cooking-along assistant."** Demoable but wrong audience. Alicia plans Sunday with a phone in one hand and a glass of wine in the other; she doesn't want to talk to her phone. Andrew's hands-busy case is already covered by Cast/TTS. Voice is P3, and only for the execution layer we said we wouldn't touch.

## What I want to read in others' positions

- **Visual designer** — what does "tonight" actually look like? Do vignettes scale, or do we need generated dish photos (latency/vibe cost)? How do kid-track and adult-track render side-by-side without the page collapsing on mobile?
- **Scalability architect** — if `KidProfile` and `EaterPreference` are first-class, what's the right key? `KidProfile.id` is fine within a family but breaks if the same kid eats at two households (separated parents). Is `Cookbook` the right family-of-families primitive, or are we reinventing collections?
- **Execution UX agent** — "Just the gist" renders the same `CookCard` minus timers/mise progress. Where's the seam? Render flag, not a fork. Does a `MealOutcome` capture step at end of cook session interfere with the SaveBar photo prompt, or slot in naturally after?
- **Sharing & hosting agent** — does a published menu need its own auth surface (anonymous viewers, RSVPs, dietary collection) or does share-by-link + fork cover 80%? Should `PublishedMenu` be plan-scoped (this week's dinner party) or library-scoped (a republishable "go-to dinner party")? I lean library-scoped — push back.
