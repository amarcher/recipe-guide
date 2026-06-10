import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Vitest does not read tsconfig `paths` on its own, so the `@/*` alias used
// throughout the app (e.g. `@/app/types`, `@/sprites/manifest.json`) is wired
// up here to match the Next.js build. Without this, importing any lib module
// that transitively pulls a `@/`-prefixed runtime import (sprites-core →
// `@/sprites/manifest.json`) fails to resolve under vitest. Keep this in sync
// with tsconfig.json `compilerOptions.paths`.
const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": root.replace(/\/$/, ""),
    },
  },
  test: {
    // Colocated `*.test.ts` files live next to the modules they cover.
    // Exclude sibling git worktrees under `.claude/worktrees/` so a run in
    // one worktree never discovers or fails on another's test files.
    exclude: ["**/node_modules/**", "**/dist/**", "**/.claude/worktrees/**"],
  },
});
