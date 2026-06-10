// Shared cron authorization — the project's first scheduled-job convention.
//
// Vercel's scheduler hits cron paths with a GET carrying
// `Authorization: Bearer <CRON_SECRET>`. We also accept the same header on a
// manual POST (the `npm run pivot-sweep` script, or an on-call human) so a
// single guard covers both the automated trigger and a hands-on rerun.
//
// Reusable on purpose: every future cron route should call `checkCronAuth(req)`
// as its first line and bail with the returned status on `!ok`. One place to
// get the secret comparison right, so the next cron author can't get it subtly
// wrong.
//
// Prisma-free so it stays unit-testable without dragging the DB client into
// vitest's import graph.

export type CronAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; reason: string };

// A minimal request shape — just the header bag. Lets tests pass a plain
// object and keeps this independent of Next's Request type.
export type HeaderCarrier = { headers: { get(name: string): string | null } };

// Compare the request's Authorization header against CRON_SECRET.
//   - missing/blank CRON_SECRET → 503: the route is unconfigured, and we
//     fail closed rather than letting an unguarded endpoint delete rows.
//   - header mismatch → 401.
export function checkCronAuth(
  req: HeaderCarrier,
  secret: string | undefined = process.env.CRON_SECRET
): CronAuthResult {
  const trimmed = secret?.trim();
  if (!trimmed) {
    return {
      ok: false,
      status: 503,
      reason: "CRON_SECRET is not configured",
    };
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${trimmed}`) {
    return { ok: false, status: 401, reason: "unauthorized" };
  }
  return { ok: true };
}
