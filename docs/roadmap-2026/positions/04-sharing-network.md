# Sharing, Hosting & Network — position

## Lens

Recipe Guide is secretly a **household-to-household cookbook protocol**. The execution layer is sacred and personal; the social layer wraps around it. Today, "sharing" means link-fork-from-a-family-scoped-save — that's enough for one household, but it doesn't scale. The unlock is treating a recipe, a plan, and a hosted-meal-menu as **three durable artifacts** that can each cross a boundary (user → user, family → family, household → guest, and eventually → the open web). Every boundary crossing should leave a "save a copy" trail and an attribution lineage so the network compounds: the more people Andrew shares with, the bigger his trusted recipe graph becomes, and the more reliable his planner gets at "what did Alicia cook last time the Petersons came over?" The pitch is *Are.na for what your friends actually cook*, not Pinterest.

## Top features (prioritized, P0–P2)

### P0 — Public share link with anonymous viewing
**Pitch.** A `SavedRecipe` should be shareable to someone who hasn't signed in. Today `GET /api/recipes/[id]` requires `requireUser()` and 401s anonymous viewers, even though the data model already returns `viewerAccess: "guest"` and strips scope-private fields. We're one auth-guard relax away from a real share link.
**Why it matters.** Andrew's friends won't sign up to read a recipe; they'll bounce off the auth wall. Anonymous read is the precondition for *every* network feature below.
**Sketch.** Add `RecipeShareToken(savedRecipeId, token unique, createdById, expiresAt?, revokedAt?, viewCount)`. New route `GET /api/share/[token]` resolves to the same payload as the existing `GET /api/recipes/[id]` guest branch (override-applied card, no cookHistory, no cookCount). Page at `/r/[token]` reuses `CookCardView` + a "Save to your library — sign in" CTA instead of the current `GuestBanner`. Signed-in viewers get the existing fork affordance. Critically: do **not** mutate `requireUser()` on `/api/recipes/[id]` itself — keep token-scoped reads on a separate route so the security model stays legible.
**Size.** M (1–3d).
**Risks.** Token leakage = recipe leakage. Mitigate with optional expiry + a one-click revoke in the editor. Don't try to be cute about rate limiting v1 — Vercel edge limits + opaque tokens are fine.

### P0 — Cross-family recipe gifting (one-tap, with lineage)
**Pitch.** "Send to the Petersons" button on any recipe I own. They get a notification (in-app inbox, optional email), tap accept, and a personal-scope `SavedRecipe` lands in their library — pre-forked with the override I was viewing.
**Why it matters.** This is the dominant real-world social action. Today the only path is "copy share link → text it → they paste in a browser → click Save a copy." Four steps, three apps, and the original sender never knows if it landed.
**Sketch.** New `RecipeGift(fromUserId, toUserId, parsedRecipeId, sourceOverrideJson?, message?, status: PENDING/ACCEPTED/DECLINED, createdAt, respondedAt)`. Routes: `POST /api/recipes/[id]/gift {toEmail}` (resolves email → User, creates pending gift; if `toEmail` is unregistered, hold the gift keyed on email and surface it on first sign-in), `POST /api/gifts/[id]/accept` runs the existing `fork/route.ts` flow against the snapshotted `sourceOverrideJson` instead of the live source. Store the snapshot at gift-time so a sender's later edits don't retroactively change what the recipient saved.
**Size.** L (3–5d).
**Risks.** Email lookup needs throttling (enumeration). Require the recipient share at least one family with the sender, OR have an existing gift accepted from them, before allowing email-based gifting — otherwise build a contact-list / handle system first.

### P0 — Publish a Hosting Menu (NEW SURFACE)
**Pitch.** "I'm hosting Saturday — here's what I'm serving." A `HostedMenu` is a curated, published artifact pinned to a date and guest list, drawn from `SavedRecipe`s and (optionally) a `WeeklyPlan`. It produces a beautiful, shareable, printable page with the menu, a one-line dietary note per dish, and a single "Save the recipes to my library" CTA for guests who want to cook them later.
**Why it matters.** This is the user's stated request, verbatim. It's also the perfect on-ramp from "private execution tool" to "public artifact" — there's a clear audience (guests already coming over), a real deadline, and the act of publishing forces the system to handle *the read-only social object as a first-class noun*. Nothing else in the app is a "thing you publish" yet.
**Sketch.** New tables: `HostedMenu(id, hostUserId, familyId?, title, occasionDate, intro?, dietaryNote?, status: DRAFT/PUBLISHED/ARCHIVED, slug unique, publishedAt?, coverPhotoUrl?)` and `HostedMenuItem(menuId, position, savedRecipeId?, parsedRecipeId?, courseLabel, displayTitle, displayBlurb?, sourceOverrideJson?)`. Snapshot the resolved card per item at publish-time so the menu is immutable post-publication (a guest reading on Saturday morning sees what was published, not whatever the host was tweaking at 11pm Friday). Surface: `/menu/[slug]` (public), `/menu/[slug]/edit` (host), and a top-level "Hosting" tab. Compose from existing primitives: `RolodexTile` photo mode for hero shots, `CookCardView` read-only for the per-recipe deep-dive. RSVP and guest comments are explicitly v2.
**Size.** XL (>5d) — net new surface, new tables, new route tree, print stylesheet.
**Risks.** Scope creep into RSVP / event planning territory — resist; this is a *menu artifact*, not Partiful. Photo curation is the UX hard part: a half-baked menu with random sprite collages looks worse than no menu.

### P1 — "Family of families" — shared cookbook between two households
**Pitch.** Andrew and Alicia's family library can be linked to the Petersons' family library at a *recipe-set* level: each household marks specific recipes as "share with the Petersons" and those flow into a third virtual library both can browse. Not a merged family — a **shared shelf**.
**Why it matters.** Two-family threads are how home cooks actually socialize ("I made the carbonara your mom does"). The current model forces you to either join one big family (wrong — your kid's lunch plan is not their problem) or one-shot fork every recipe (high friction).
**Sketch.** New table `RecipeShelf(id, name, createdById)` + `ShelfMember(shelfId, familyId)` + `ShelfRecipe(shelfId, parsedRecipeId, addedByUserId, addedFromFamilyId, addedAt)`. The shelf doesn't own a `RecipeOverride` — readers see canonical-or-source-family overrides via a new resolver branch in `card-resolver.ts`. **Watch the NULL-distinct trap:** any `RecipeOverride` extension to shelf-scope needs the same hand-rolled `findFirst → create | update` dance. Tempting alternative: skip the shelf table entirely and add `sharedWithFamilyIds String[]` on `SavedRecipe` — simpler schema, but breaks the symmetry where both households contribute. Go with the shelf.
**Size.** L (3–5d).
**Risks.** Permission model proliferation. Three scopes today (personal, family, guest); shelf adds a fourth. Document the precedence order *once*, in `card-resolver.ts`, before writing UI.

### P1 — Inbox & "Cooking Threads" (async family communication)
**Pitch.** A unified inbox at `/inbox` that surfaces: gifts received, hosted menus you're invited to, a family member tuned the planner, "your kid said no to the salmon", and post-cook photo notifications. Each item links to the artifact and supports a single threaded reply. Replaces the "I should text Alicia about the recipe" out-of-band loop.
**Why it matters.** Family meal coordination today happens in iMessage, separated from the recipe data. Pulling it into the app makes the data and the conversation co-located, which is the only reason anyone would tolerate yet another inbox.
**Sketch.** `Notification(userId, type enum, payload Json, readAt?, actorUserId?, createdAt)` + `RecipeComment(parsedRecipeId, scope: PERSONAL/FAMILY/SHELF, scopeRefId, authorUserId, body, createdAt, parentId?)`. Notification fan-out is server-side on write to the source artifacts. **Don't** build push notifications in v1 — web push is a tarpit; rely on in-app badge + optional email digest. Comment surface lives next to `CookHistory` on `/recipe/[id]`.
**Size.** L (3–5d).
**Risks.** Becomes Slack-for-cooking and rots. Hard cap: comments are per-recipe, not threaded forums. No DMs.

### P2 — Friends graph + recipe activity feed
**Pitch.** Beyond family membership, an asymmetric "follow" relationship between users surfaces a feed of *what your friends cooked* (only `CookLog` rows where the friend opted-in to share). Discovery emerges from real cooking, not an editorial cookbook.
**Why it matters.** Network effect compounding. Today, Andrew with no family in the app sees an empty `/library` and bounces. With a friends graph, he sees three friends made things this week and at least one is in his "recipes I should cook this week" wheelhouse.
**Sketch.** `Follow(followerId, followeeId, createdAt, @@unique)`. Per-CookLog `visibility: PRIVATE/FRIENDS/PUBLIC` field with PRIVATE default. Feed query unions friend `CookLog`s + Hosted Menus by friends. Empty-state on `/library` for a no-family user: "Start by following a friend who already cooks here" with a paste-an-email field.
**Size.** L (3–5d).
**Risks.** Privacy regressions are catastrophic. Default everything PRIVATE; require an explicit per-cook toggle. Don't store coarse `friendsCanSee` flags on `User` — keep visibility per-artifact so a single misconfig doesn't leak history.

### P2 — Outbound publishing — Open Graph cards + ICS export
**Pitch.** Every public Hosted Menu and shared recipe link gets proper `og:image`, `og:title`, structured data, and (for menus) an `.ics` calendar attachment for guests. Make the artifacts behave well in iMessage, WhatsApp, and Apple Calendar.
**Why it matters.** Distribution is the multiplier. A menu that previews as a beautiful card in iMessage gets opened; a bare URL gets ignored.
**Sketch.** Next 16 metadata exports per public route. OG image generation via `next/og`. ICS at `GET /menu/[slug].ics`. Reuse the `RolodexTile` photo path for the OG image's hero asset.
**Size.** S (<1d) per surface, M total.
**Risks.** Low. Mostly cosmetic.

## Sparks (3 cross-cutting provocations)

1. **The recipe is a remix tree, not a save.** Right now `RecipeOverride.forkedFromUserId` records lineage but we never display it. What if every `/recipe/[id]` showed *"Andrew → Alicia's edit → your fork"* as a breadcrumb, with a one-tap diff against any ancestor? It would make ownership of *changes* (Alicia's tweak that made the kids eat it) more visible than ownership of the URL.
2. **Drop the family/personal scope binary; treat scope as a label set.** The Postgres-NULL-distinct trap on `(userId, familyId)` is a symptom of modeling scope as two nullable columns. Once we add shelves and friends, this gets worse. Refactor to `RecipeOverrideScope(overrideId, scopeType enum, scopeId)` so future scopes (shelf, public-fork, guest-list) don't each require schema changes. Pay the migration cost once.
3. **Hosted Menus are the killer planner integration, not a separate noun.** A `WeeklyPlan` already aggregates committed meals with hero ingredients, rationale, kid-fit tags. A `HostedMenu` is the same primitive with `eaters: GUESTS` and a publish step. Don't build two parallel planners — let the user *promote a `WeeklyPlan` to a Hosted Menu* and inherit the structure.

## Dissent / pushback

- **The "execution layer is untouchable" rule is doing real damage to social loops.** Post-cook is the perfect moment to prompt "Who else should see this?" but the current cook-finish flow only invites a private photo upload. I want to add one optional step: after photo upload, a one-line "Share this cook with..." chip row of recent gift recipients/families. This is *additive*, not a dilution — but the rule will be invoked to block it. Andrew should explicitly green-light or red-light this carve-out.
- **Don't build a friends graph before a contact-import path.** Manually following by email will plateau at five friends. Either commit to a Google Contacts integration or admit that friends-graph is a v3 thing and don't half-ship it.
- **Family-scope edits are last-write-wins. This will get someone in trouble at scale.** When two adults edit the same family recipe within 500ms autosave debounce, optimistic concurrency 409s — but the second writer's UX is "Conflict — reload" with no diff. Before we open the doors to inter-family sharing, build a real merge UX, even if minimal (3-way diff on per-step text fields).
- **"Publish to web" is a values question, not a feature question.** Once Hosted Menus are public, this app is a publishing platform. We need a takedown policy, an abuse story, and an answer for "what if a guest publishes a hosted menu screenshotted from a paywalled NYT Cooking recipe." Decide *before* shipping P0.

## What I want to read in others' positions

- **From the Plan Execution / Cooking-Partner-Sync lens:** how does live-during-cook sync extend to a guest who is *not* in the family but is helping you cook the hosted menu Saturday? Is there an ephemeral "shared cook session" primitive distinct from family scope?
- **From the Planner / Decision-making lens:** if a Hosted Menu is a promoted `WeeklyPlan`, what's the intake prompt diff? "Cooking for 8 adults including 2 vegetarians" is a different conversation than "Cooking for our family this week."
- **From the Library / Discovery lens:** how do we surface *friends'* recipes without crowding out *my own* in `/library`? I'd like a clear opinion on whether the library is one shelf or many tabs.
- **From the Trust / Safety / Brand lens:** the moment we ship public Hosted Menus, we inherit a content-moderation surface area. I want their go/no-go before P0 lands.
