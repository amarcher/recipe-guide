# Recipe Guide

Paste any recipe URL. Get back a one-screen guide built for cooking from:

- **Mise en place** — every ingredient you need on the counter, with photoreal sprites and total scaled quantity. Tap each tile to check it off as you measure it out.
- **Timeline** — horizontal strip of every step proportional to its duration; click a segment to jump.
- **Steps with ingredients re-attached** — instead of "add the salt", each step shows exactly how much of which ingredient goes in right then, plus a temperature pill, a duration pill, and a doneness cue.
- **Live per-step timers** — for any step with a parseable duration, a Start/Pause/Reset countdown that fires a beep and a browser notification. Range durations like `10–15 minutes` alarm twice (at the low end to "check it", at the high end to "it's done").
- **Scaling** — ½, ⅔, 1×, 1½, 2×, 3×, or custom. Quantities re-rendered with proper fractions.
- **Library** — save recipes; track when you last cooked each one and how many times.

## Stack

- Next.js 16 (App Router) + React 19 + Tailwind 4
- **Anthropic Claude** (Opus 4.7) parses HTML → structured `CookCard` JSON
- **Gemini 2.5 Flash Image** ("Nano Banana") generates photoreal ingredient sprites
- localStorage persistence today; designed so the storage layer can swap to a server backend later without touching components

## Run locally

```bash
cp .env.local.example .env.local
# Fill in ANTHROPIC_API_KEY and GEMINI_API_KEY

npm install
npm run dev
```

Open http://localhost:3000.

## Generate sprites

The first 18 sprites covering the bolognese ingredients ship in `public/sprites/`. To add more:

1. Add an entry to `sprites/manifest.json` with `slug`, `label` (the prompt fragment), and `aliases` (lowercase wordings the parser might emit).
2. Generate:

```bash
npm run sprites              # only generates missing PNGs
npm run sprites -- --force   # regenerate everything (e.g. after editing style_prompt)
npm run sprites garlic       # one slug
```

There's a `add-sprite` Claude Code skill at `.claude/skills/add-sprite/SKILL.md` that automates this — just ask Claude to "add a sprite for X".

## Deploy

This is a standard Next.js app with one API route (`/api/parse`). On Vercel:

```bash
vercel link
vercel env add ANTHROPIC_API_KEY production
vercel env add GEMINI_API_KEY production   # optional — only needed at build time if regenerating sprites
vercel deploy --prod
```

`GEMINI_API_KEY` isn't needed at runtime — sprite PNGs are pre-generated and committed to `public/sprites/`.

## Project layout

See [CLAUDE.md](./CLAUDE.md) for the architecture map and conventions.
