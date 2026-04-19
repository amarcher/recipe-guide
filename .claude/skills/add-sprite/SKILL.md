---
name: add-sprite
description: Add one or more new ingredient sprites to the Recipe Guide sprite library. Updates sprites/manifest.json with a new slug/label/aliases entry, then runs the generation script (Gemini 2.5 Flash Image) to produce the PNG in public/sprites/. Use whenever the user asks to "add a sprite", "create an icon for X", "generate an ingredient image for X", or notices an ingredient rendering as an initial-letter fallback chip in the UI.
---

# Add a sprite to the Recipe Guide library

Use this skill when the user asks to add new ingredient sprites — typically because they parsed a recipe that contains an ingredient with no matching sprite (it falls back to a colored initial chip in the UI).

## Inputs

The user will give you one or more ingredient names (e.g. "shallot", "san marzano tomatoes", "lemon zest"). They may also paste a recipe URL — in that case, parse out the ingredient list and pick only the ones that don't already match a sprite.

## Steps

1. **Read** `sprites/manifest.json` to see existing slugs, labels, and aliases. Avoid duplicates.

2. **Check coverage** by mentally running each new ingredient name through the alias matcher in `app/lib/sprites.ts` (substring match, normalized to lowercase, longest alias wins). If an ingredient already matches an existing sprite via its aliases, **do not add a new entry** — instead, extend the existing entry's `aliases` array with the new wording.

3. **Design each new entry**:
   - `slug`: kebab-case, singular, no articles. Examples: `shallot`, `san-marzano-tomatoes`, `lemon-zest`.
   - `label`: a short noun phrase that will be substituted into the manifest's `style_prompt` (which uses `{label}`). Write it as a description of what should appear in the image — typically `"a [adjective] [thing]"` or `"a [container] of [thing]"`. Match the tone of existing labels (e.g. `"a head of garlic with a few loose cloves"`, `"a small pile of fennel seeds"`, `"a glass measuring cup full of golden broth"`).
   - `aliases`: lowercase wordings the recipe parser is likely to emit. Include singular and plural, and any common synonyms. Order doesn't matter — the matcher sorts by length at runtime. Be inclusive but specific (don't add `"red"` to a `red-onion` entry — too broad).

4. **Edit** `sprites/manifest.json`. Append the new entry/entries to the `sprites` array. Keep the JSON valid (trailing commas not allowed). Preserve the existing two-space indentation.

5. **Verify the matcher** would catch your new aliases. The substring match means an alias like `"lemon"` would also match `"lemon zest"` and `"lemon juice"` — if you want those to be distinct sprites, the more specific entries must have longer aliases (which they will, since the matcher prefers the longest alias).

6. **Generate the image(s)**:
   ```bash
   GEMINI_API_KEY=... npm run sprites <slug> [<slug> ...]
   ```
   - The script is idempotent — only generates missing files. Pass `--force` to overwrite.
   - If the user hasn't set `GEMINI_API_KEY`, ask them to set it (https://aistudio.google.com/apikey) and stop here. Do **not** invent or guess a key.
   - The script writes to `public/sprites/{slug}.png`. Confirm the file exists after the run.

7. **Report** what you added. Include slug, label, aliases, and whether the PNG was generated. If the generation failed (rate limit, content policy, etc.), say so and suggest a tweaked label.

## Style consistency

The `style_prompt` field at the top of `sprites/manifest.json` controls the visual style of every sprite. Don't edit it on a per-sprite basis — if the user wants to change the look (e.g. switch from flat illustration to isometric 3D), update `style_prompt` once and run `npm run sprites --force` to regenerate the entire set.

## Example

User: "add a sprite for shallots and one for lemon"

You should:
- Read manifest, confirm neither exists.
- Append:
  ```json
  { "slug": "shallot", "label": "a small whole shallot with papery skin", "aliases": ["shallot", "shallots"] },
  { "slug": "lemon",   "label": "a fresh whole lemon",                    "aliases": ["lemon", "lemons", "fresh lemon"] }
  ```
- Run `GEMINI_API_KEY=... npm run sprites shallot lemon`.
- Confirm `public/sprites/shallot.png` and `public/sprites/lemon.png` exist.
- Report back the additions.
