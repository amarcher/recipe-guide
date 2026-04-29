# Visual & Interaction Design — position

## Lens

The app already has a real visual language and we should defend it: cream paper (`--color-stone-50` #fbf7ef), warm-brown ink, an ochre brand accent, Fraunces italic for the soulful surfaces, Inter for the working ones, ochre-tinted shadows instead of the cool flat-black drop shadows that scream "AI starter template." That voice — *premium cookbook on warm paper* — is the only reason `RolodexTile`'s swatch mode reads as a deliberate aesthetic choice instead of a fallback. My north star for the next phase: **make the planner feel like leafing through a beautifully-photographed weekly menu at a restaurant**, where every meal has a face before you commit to it, where the act of choosing is sensory (not a checkbox), and where the artifact you publish to family and guests is the kind of thing they'd screenshot. Concrete adjectives: *editorial, tactile, hand-set, slow-zooming, generous in white-space, chromatically restrained, warm-shadowed*. Concrete anti-patterns: badge soup, three-line text cards, generic emerald gradients, full-bleed glassmorphism, anything that tries to look like Notion or Linear.

## Top features (prioritized P0–P2)

### P0 — Candidate Tile Redesign: "show me, don't tell me"

**Pitch.** Today every meal candidate in `MenuView.tsx` is a text block — title, summary, italic rationale, three pill badges, four 24px sprite thumbnails on the bottom-right. Andrew called this out by name: *"choice of textual menu items… don't have a lot of preview ability of what the meal might look like or feel like."* I want each candidate to be a `RolodexTile`-shaped object with a real visual face, not a paragraph.

**Why it matters from this lens.** Choosing dinner is a *desire* problem, not a reading-comprehension problem. The brain commits to food it can see. Right now the planner asks you to read four cards in parallel and reason; the redesigned planner should let you scroll a menu and feel pull.

**Implementation sketch.** New component `app/plan/[id]/CandidateTile.tsx` that mirrors `RolodexTile`'s mode logic (`photo | vignette | swatch`) but adapted for an unsaved candidate:
- **Vignette mode** (default for fresh candidates): use the existing `VignetteArea` algorithm — overlapping hero sprites at rotated angles with `drop-shadow(0 8px 14px rgba(60,40,15,.2))`, on a `WASH` palette key derived from the candidate id (deterministic, so re-renders don't reshuffle). 4–5 hero slugs instead of 3 to read as a "still life" not a logo.
- **Stock-photo mode** (P0.5): when our parser encounters a candidate composed from a known ParsedRecipe (via the planner's reuse path), reuse that recipe's user photo or `og:image`. Vignette is a graceful default; a real plate picture is the magic.
- **Swatch mode** (rare): pull-quote the rationale (`tagline` is null for unsaved candidates) in Fraunces italic on a wash, exactly like `SwatchCopy`.
- **Caption** uses the existing typography ladder: title in `font-serif text-[18px]`, summary in one line of `font-serif italic text-[13px] text-stone-600`. Badges become tiny serif-italic *editorial taglines* ("clears the fridge", "30-min weeknight") rendered as small-caps eyebrows in `--color-ochre-700`, max one per card. No badge soup.
- **Commit affordance.** Replace the green `+`/`✓` button with a long-press / tap-and-hold ribbon-fold animation: the tile literally tucks a corner over to show a folded "MENU" stamp in ochre. Microinteraction over UI chrome.

**T-shirt size:** L. **Risks:** vignette quality depends on hero-slug coverage in `sprites/manifest.json` (222 entries today, generally good); the planner already calls `discoverSprites` so missing sprites generate on-demand. Real risk is the asymmetric tile heights breaking the 2-col grid — solve with CSS masonry or fixed-aspect tiles.

### P0 — Pre-cook Glance Card (the "what is this, really?" preview)

**Pitch.** Tapping a candidate today either commits it or drops you straight into a saved recipe page. Add a middle state: a peek sheet that slides up from the candidate, full-bleed photo or vignette at top, tagline as Fraunces italic pull-quote, the 4–6 mise sprites laid out in a clean row, an at-a-glance time/effort/heat ribbon, and a swipe-down dismiss. *No commit until the user has seen the meal.*

**Why it matters.** This is the literal "preview ability of what the meal might look like or feel like" the user asked for. It also bridges the planner aesthetic to the execution aesthetic — the peek card is built from the same composed `CookCardDraft` that becomes the cooking guide.

**Implementation sketch.** New `app/plan/[id]/CandidatePeek.tsx` — a `<dialog>` element with View Transitions API morph from the source tile (named transition on the hero image / vignette) so the peek feels like the tile itself unfolding. Reuse `MisePlace`'s sprite tile styling for the ingredient row, but in read-only "preview" form (no toggles). Render a `CookTimeRibbon` component with three glyphs in ochre: a clock (range), a flame (heat: simmer / sear / bake / raw — pull from existing `StepIcon` enum), and a "hands-on minutes" hour-glass. Bottom of sheet: two buttons, **Add to week** (ochre-filled) and **Show me another** (paper outline, regenerates *just this candidate* via a new `POST /api/plans/[id]/candidates/[id]/swap`).

**T-shirt size:** M. **Risks:** View Transitions across React state changes still has gotchas in Next.js 16; fall back to Framer-Motion shared layout if needed. Server-side: we already have `composedCardDraft` on each `MealCandidate` so peek is a pure-client read.

### P0 — Planner "Menu" mode: editorial week view

**Pitch.** Replace the current grouped sections (`SectionView` / kid-only amber panel) with a *menu* layout: the committed meals presented as a single-column, large-format spread, each row composed like a restaurant menu line — meal name in Fraunces, tagline in italic on a separate line, ingredient sprites floating in the right margin like marginalia. The uncommitted candidates live in a "still being considered" drawer below.

**Why it matters.** The user already noted (in `project_menu_not_calendar.md`) that *the week is a menu, not a calendar.* The current UI doesn't honor that — it looks like a CRUD list of options, not a curated menu. Going full editorial here is what makes the surface *publishable*.

**Implementation sketch.** Two new components: `app/plan/[id]/MenuSpread.tsx` (the typeset committed view) and `app/plan/[id]/CandidateDrawer.tsx` (the "options" overflow). The spread uses a CSS grid with `grid-template-columns: 1fr 120px` so sprites cluster in a consistent right margin. Slot labels become small-caps Fraunces eyebrows in ochre between rows ("M O N D A Y · D I N N E R" if/when day assignment lands; otherwise just "B R E A K F A S T · A D U L T S"). The amber kid-only panel stays as a separate spread section, but visually it becomes a single sheet of warmer paper rather than an inset card — bleed the amber to the page edges in that range.

**T-shirt size:** L. **Risks:** The current `SectionView` is also where per-section guidance/tuning lives. Need to integrate the wand UI into the new layout without spoiling its restraint. Solution: tuning slides in from the bottom as a separate sheet, not inline.

### P1 — Publishable Menu Artifact (guest-facing)

**Pitch.** A read-only `/plan/[id]/menu` page rendered as a *thing you'd be proud to share*: a single A4-portrait cookbook spread, Fraunces titles, ingredient vignettes, a hand-typeset "from the kitchen of [family name], the week of April 28" header. One button: "Share menu" → copies a public link or generates a PNG via `@vercel/og`.

**Why it matters.** The user explicitly called out *sharing capabilities within the family, potentially across families or across users.* Sharing a JSON dump or screenshot of our internal planner UI is gross. Sharing a typographically-rich artifact is the kind of thing people post to a family group text. It's also a marketing wedge — every shared menu carries the brand voice.

**Implementation sketch.** New route `app/plan/[id]/menu/page.tsx` (server component, no auth required if plan is marked public; gated otherwise). Render uses `t-display` and `t-pullquote` exclusively for headers, body in `t-lead`. Background: `--color-stone-50` with a subtle paper texture SVG (very low opacity speckle). Hero image (or vignette) at top spanning column. Each meal is one block: name + tagline + 5–6 sprite vignette as a foreground composition. OG image route `/plan/[id]/menu/og` produces a 1200×630 PNG of the same layout, downscaled — for iMessage/Slack unfurls.

**T-shirt size:** L. **Risks:** Public link surface area means we need a token/visibility model on `WeeklyPlan`. Suggest a `publicSlug` column gated by an explicit publish action; private by default. OG image generation with custom serif fonts on Vercel needs the font files committed and registered.

### P1 — Sprite-driven Grocery List

**Pitch.** `GroceryList.tsx` today is a vertical list of checkboxes with 28px sprites. Convert to a **shop-aisle grid** that mirrors `MisePlace`'s aisle-grouped tile layout: bigger sprites (60px), aisle eyebrows in small-caps Fraunces, items as soft tiles you tap to "drop in cart" with a satisfying micro-bounce + sprite fade-to-50%-opacity (the same `isChecked` language used in `MisePlace`).

**Why it matters.** Grocery list is the most-used surface of the planner *outside the home* — it's what's open in your hand at the store. It deserves to be the most visceral. Today it's the most utilitarian.

**Implementation sketch.** Refactor `GroceryList.tsx` to compose `MisePlace`'s tile layout, gated on a "Shop view" toggle (default) vs "List view" (existing dense rows for power users). The aisle grouping is already in `app/lib/taxonomy.ts` (`AISLES`, `AISLE_LABEL`) and the grocery rollup endpoint can return `aisle` per item. Add a "purchased" haptic via `navigator.vibrate(15)` (the kitchen-grade `vibrate` helper already exists in `app/lib/alarm.ts`).

**T-shirt size:** M. **Risks:** Big sprites = scroll length. Default-collapse purchased items per aisle to manage density.

### P1 — Library "Rolodex" rotation gesture

**Pitch.** The library page is called rolodex but doesn't *behave* like one. Add a horizontal-scroll-snap row mode (in addition to the masonry grid) with each tile filling the viewport, hero image / vignette dominant, swipe-to-reveal next. Tilt slightly (±2°) on idle for the hand-set feel.

**Why it matters.** Names earn their metaphor or they don't. The masonry grid is fine for "find a recipe by recall"; the rolodex mode is for *browsing in the bath*. It's an emotional surface.

**Implementation sketch.** New `app/library/RolodexCarousel.tsx` using CSS `scroll-snap-type: x mandatory` + container queries. Each tile is the existing `RolodexTile` but `tall=true` and forced to viewport-height. Tap a tile → routes to `/recipe/[id]` with a `view-transition-name` morph from the photo/vignette to the recipe hero. View toggle in the library header: grid icon / film-roll icon.

**T-shirt size:** M. **Risks:** Carousel UX on desktop is awkward; constrain to mobile-only or add explicit prev/next chevrons for mouse.

### P2 — Motion language: defining "the way Recipe Guide moves"

**Pitch.** Codify a small motion vocabulary so every transition in the app feels like the same hand drew it. Three primitives:
1. **Page-paper turn** (200ms, custom cubic-bezier `0.65, 0, 0.35, 1`): for navigations between recipe / library / planner. Slight horizontal slide + a 4° tilt that resolves.
2. **Sprite settle** (180ms, ease-out): scale 0.9 → 1.0 with a light bounce, used whenever a sprite enters (mise tile, grocery tile, candidate hero).
3. **Stamp** (320ms, ease-in-out): scale 1.1 → 1.0 + opacity 0 → 1, used for commit / cooked / purchased confirmations. Replaces all green-checkmark fades.

**Why it matters.** Today microinteractions are inconsistent: emerald check on `MisePlace`, scale-on-hover on `RolodexTile`, plain CSS `transition` on the SectionView. A coherent motion language is what separates *crafted* from *generic*.

**Implementation sketch.** Define in `app/lib/motion.ts` as exported Framer-Motion variants + Tailwind keyframes in `globals.css`. Add `m-paper-turn`, `m-settle`, `m-stamp` utility classes. Audit existing surfaces and replace ad-hoc `transition` calls. Document in a single `docs/motion.md`.

**T-shirt size:** M (definition) + ongoing audit. **Risks:** Reduced-motion users — every primitive must have a `prefers-reduced-motion` no-op variant.

## Sparks (3 cross-cutting provocations)

1. **The cream paper is the canvas, the sprites are the medium, the typography is the voice.** Every new surface I'm proposing leans on these three things and nothing else. We should resist any future feature that demands a fourth color, a fourth font, or a fourth visual primitive (charts, illustrations, custom icons beyond Lucide). Constraint *is* the brand.

2. **A "still life" aesthetic for any composition of more than one ingredient.** The `VignetteArea` algorithm in `RolodexTile` (rotated overlapping sprites with warm drop-shadows) is the most distinctive thing the app does visually. Promote it from a fallback to a first-class compositional language: candidate previews, peek cards, OG images, family-share artifacts, even the empty-state for an unplanned week ("a still life of what's in your pantry"). Build a `<StillLife heroes={[…]} mood="bright|moody|quiet" />` component and use it everywhere.

3. **Restraint as a feature, not a constraint.** The planner has a *lot* of states (intake / skeleton / candidates / commit / cook / grocery / publish). The temptation will be to add icons, badges, status pills, animation everywhere to "make it feel alive." Resist. The most elegant version of this app uses ochre for one thing per surface, italic for one phrase per surface, motion for one moment per surface. Prune ruthlessly during reviews.

## Dissent / pushback

- **Day assignment is the wrong scaffolding.** Other agents will probably propose calendaring (drag meals onto Tue/Wed/Thu). I think this is a trap that re-introduces the calendar metaphor the user explicitly rejected (`project_menu_not_calendar.md`). What the planner needs isn't days, it's *moods* — Tuesday is "fast & forgiving", Saturday is "earned the effort." Tag candidates with these moods, let users reorder by drag, but don't pin to a date until cook-night.
- **Don't sync mise tiles cross-device by default.** The synchronization spec talks about cross-cook live state. Visually that means another device's check could pop your tile to checked while you're looking at it — disorienting. Sync should be opt-in per session and visually distinguished (different check color or subtle "ghost" border) so you always know who picked it.
- **No video backgrounds in the candidate planner.** `RolodexTile` already supports Instagram videos for saved recipes (good — those are *real* footage). For unsaved planner candidates we should not generate or auto-loop video previews. Generative video aesthetics are uncanny and undermine the cookbook voice.

## What I want to read in others' positions

- **Backend architect:** how cheap can we make the "regenerate just one candidate" call, because the peek sheet's "show me another" button is only worth it if it returns in under 3s. Are we caching by `(skeleton, slot, eaters, exclusion_list)`?
- **Product strategist:** what's the publishing surface look like in the long arc — public family menus, a Recipe Guide profile, follow-a-family, a feed? Because the artifact I'm proposing in P1 is a wedge, and I want to know if it's a wedge into something or just a one-shot.
- **Family/sync designer:** when two people view the menu simultaneously, what does *seeing each other* look like? I'd love a tiny sprite-style avatar pulse on the candidate someone else is currently peeking at — like cursors in Figma but warmer.
- **Execution-surface designer (the "tonight" view):** how does my `CandidatePeek` morph into your start-cooking surface? I'd like to share a `view-transition-name` so the hero image is continuous across that boundary — peek → cook should feel like one motion.
