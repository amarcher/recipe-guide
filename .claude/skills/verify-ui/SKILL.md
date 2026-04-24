---
name: verify-ui
description: Smoke-test a UI change in a real browser before reporting the task done. Catches the "TypeScript compiles but the button is dead" class of bug. Use when you have edited a React component, page, layout, route, or interaction in app/ — not for pure logic or copy-only edits. Drives the chrome-devtools MCP tools against a local dev server, using the dev-auth bypass to sign in headlessly.
---

# Verify a UI change in the browser

Use this when you have changed something a human would notice on screen and you want to confirm it actually works before declaring the task done. The point is to catch dead handlers, runtime errors, broken data fetches, and layout regressions that the type checker and linter cannot see.

This skill assumes the `mcp__chrome-devtools__*` tools are available in the session. They typically are.

## When to use

- Edited a component, page, layout, or route under `app/`
- Wired or rewired a click handler, form, navigation, or state change
- Changed a network call, mutation, or data fetch
- Touched the planner UI, recipe execution view, library tiles, or photo upload
- Added a new route or surface

## When NOT to use

- Pure utility / library edits with no UI surface (`app/lib/*` math, parsing, schema). Add a unit test instead.
- Copy-only changes (string swaps, microcopy tweaks).
- LLM prompt tuning where no UI rendering changed.
- CSS color or spacing tweaks that you can confirm by reading the diff. (Layout *structure* changes are different — verify those.)

Skipping this skill when it does not apply is correct. It is a tool, not a tax.

## The ritual

### 1. Make sure the dev server is up on :3000

```bash
curl -sf -o /dev/null -w "%{http_code}\n" http://localhost:3000 || echo "not running"
```

If it is not running, start it in the background and wait until it responds:

```bash
npm run dev   # run_in_background: true
```

Then poll until `curl http://localhost:3000` returns 200.

### 2. Sign in headlessly via the dev-auth bypass

The route `POST /api/dev/auth` mints a NextAuth session cookie when `DEV_AUTH_TOKEN` is set in `.env.local` and `NODE_ENV !== "production"`. If the env var is not set, the route returns 404 and you must ask the user to add one — do not invent or guess a token.

```bash
TOKEN=$(grep -E '^DEV_AUTH_TOKEN=' .env.local | cut -d= -f2-)
curl -sS -X POST http://localhost:3000/api/dev/auth \
  -H "Authorization: Bearer $TOKEN" \
  -c /tmp/recipe-guide-cookies.txt \
  -H "Content-Type: application/json" \
  -d '{}'
```

The cookie jar at `/tmp/recipe-guide-cookies.txt` now holds `authjs.session-token` for the dev user `dev@recipe-guide.local`. Subsequent `curl … -b /tmp/recipe-guide-cookies.txt` calls hit authed routes as that user.

For browser navigation via `mcp__chrome-devtools__*`, you do not need the cookie file — navigate to `/api/dev/auth` first via a small POST helper, or simply call `mcp__chrome-devtools__evaluate_script` once to set the cookie via `document.cookie =` (only works if not HttpOnly — which ours is, so prefer the curl-then-navigate-with-cookie approach: load any page on the same origin after the curl call so the browser session shares state). The simplest reliable path is: run the curl above, then use `mcp__chrome-devtools__navigate_page` directly to your target URL — Chrome DevTools sessions started via MCP share the same browser profile, so the cookie set by curl in the same browser context will apply. If your DevTools instance is a fresh profile, fall back to `mcp__chrome-devtools__evaluate_script` running `await fetch('/api/dev/auth', { method: 'POST', headers: { Authorization: 'Bearer ' + token } })` from the page first.

### 3. Make sure there is data to look at

The seed script is idempotent and prints the URL of the demo plan it creates. Run it once per dev session (or whenever the database is reset):

```bash
npm run seed:demo-plan
# stdout includes:  View at: /plan/<planId>
```

Capture that plan ID. From it you also get a SavedRecipe to exercise the execution view — open the plan, click any meal's Cook button, and the URL becomes `/recipe/<savedRecipeId>`.

### 4. Drive the browser

The minimal smoke loop:

1. `mcp__chrome-devtools__navigate_page` → the route you changed (or the route that exercises your change).
2. `mcp__chrome-devtools__take_screenshot` (`fullPage: true`) before interacting — gives you a baseline you can refer back to.
3. `mcp__chrome-devtools__take_snapshot` — returns the accessibility tree with element refs you can target.
4. Interact with the change: `click`, `fill`, `hover`, `press_key`, `drag` against refs from the snapshot.
5. `mcp__chrome-devtools__take_screenshot` again after.
6. `mcp__chrome-devtools__list_console_messages` — filter for `error` and `warning`.
7. `mcp__chrome-devtools__list_network_requests` — confirm the calls your change touched returned 2xx (and that no surprise 4xx/5xx appeared).

For changes to long pages (recipe view with many steps, planner with many candidates), scroll using `evaluate_script` running `window.scrollTo(...)` between screenshots so you actually see the affected region.

### 5. Decide and report

Report back to the user with a short verdict, not a play-by-play. Good shape:

> Verified `/recipe/<id>`: the new "Add to grocery list" button renders in the mise grid, click triggers `POST /api/plans/<planId>/grocery` (returns 200), grocery item appears in the rolodex tile. Console clean. Screenshots before/after attached.

If anything failed, name the failure precisely: which interaction, which network call, which console message. Do not paper over a real bug as "looks roughly right".

## Routes worth knowing

- `/` — home, parse entry point. Public.
- `/recipe/<savedRecipeId>` — cook execution view. Authed.
- `/library` — saved recipe rolodex with filters and photo upload. Authed.
- `/plan/<planId>` — weekly planner menu, grocery rollup, cook hand-off. Authed.
- `/plan/<planId>/intake` — streaming chat for plan intake. Authed.
- `/settings` — account, family management. Authed.

## What to ignore

- React DevTools / Fast Refresh console noise in dev. Filter out anything from `webpack-internal://` or `[Fast Refresh]`.
- 304 responses on static assets — those are cache hits, not failures.
- The Next.js dev overlay flashing briefly during HMR.

## What you must never do

- Do not enable this skill in production. The triple-gate on `/api/dev/auth` (NODE_ENV check, env var presence, bearer match) is what keeps it safe — do not weaken any of those.
- Do not commit a real `DEV_AUTH_TOKEN` value to `.env.local.example` or any tracked file. The example file documents the var as commented-out for a reason.
- Do not skip the human report at the end. The whole point of this ritual is the verdict, not the screenshots.
