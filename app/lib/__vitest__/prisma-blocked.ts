const MESSAGE =
  "Importing @/app/lib/prisma in a vitest test is forbidden — extract a Prisma-free helper (see CLAUDE.md). " +
  "If you see this, your test pulled Prisma into the vitest graph.";

// Top-level throw: any import of this module aborts module evaluation, so a test
// that transitively reaches @/app/lib/prisma fails loudly at load time rather
// than hanging on a real DB connection. vitest aliases @/app/lib/prisma here.
throw new Error(MESSAGE);

// Unreachable after the throw, but exported so every import shape (default,
// named, namespace) trips the guard even if a bundler tolerated the throw.
const blocked = new Proxy(
  {},
  {
    get() {
      throw new Error(MESSAGE);
    },
  },
);

export const prisma = blocked;
export default blocked;
