import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Vitest does not read tsconfig `paths`, so the `@/*` alias used throughout the
// app (e.g. `@/app/types`, `@/sprites/manifest.json`) is wired up here to match
// the Next.js build. The broad `@` alias is REQUIRED: pure lib modules under
// test transitively pull `@/`-prefixed runtime imports (sprites-core →
// `@/sprites/manifest.json`) that would otherwise fail to resolve under vitest.
//
// That same broad alias also makes `@/app/lib/prisma` resolvable, which would
// silently reopen the documented "no Prisma in vitest" gotcha (CLAUDE.md:
// pure-function modules only). So `@/app/lib/prisma` is explicitly aliased to a
// throwing stub that aborts on import — a test that drags Prisma into the graph
// fails loudly instead of hanging on a real DB connection.
//
// Alias order matters: Vite resolves aliases first-match-wins, so the specific
// `@/app/lib/prisma` entry MUST precede the general `@` entry. The array form
// (not the object form) preserves this ordering.
const root = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = root.replace(/\/$/, "");

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@/app/lib/prisma",
        replacement: `${repoRoot}/app/lib/__vitest__/prisma-blocked.ts`,
      },
      { find: "@", replacement: repoRoot },
    ],
  },
  test: {
    // Colocated `*.test.ts` files live next to the modules they cover.
    // Exclude sibling git worktrees under `.claude/worktrees/` so a run in
    // one worktree never discovers or fails on another's test files.
    exclude: ["**/node_modules/**", "**/dist/**", "**/.claude/worktrees/**"],
  },
});
