import { NextRequest, NextResponse } from "next/server";
import { checkCronAuth } from "@/app/lib/cron/auth";
import { runPivotSweep } from "@/app/lib/pivot/sweep-run";
import { PIVOT_SWEEP_WINDOW_HOURS } from "@/app/lib/pivot/sweep";

export const runtime = "nodejs";

// Abandoned-pivot sweeper — the project's first scheduled cron.
//
// A mid-cook pivot forks a personal-scope SavedRecipe (pivotMeta set,
// pivotKept=false) that's meant to be kept or discarded at end-of-cook. When
// dinner runs away with the cook and they never decide, the fork lingers in
// the library wearing a "Pivot in progress" badge. This route deletes the
// ones that have clearly been abandoned (older than the sweep window, no
// recent execution activity), cascading their MiseCheck and CookLog rows.
// Kept pivots, family-scope rows, recently-touched rows, and non-pivot rows
// are never touched — see `app/lib/pivot/sweep.ts` for the exact predicate
// and `app/lib/pivot/sweep-run.ts` for the single shared deletion path this
// route and `npm run pivot-sweep` both use.
//
// Triggered two ways, both guarded by CRON_SECRET:
//   GET  — Vercel's scheduler (see vercel.json `crons`).
//   POST — a hands-on rerun.
//
// Cron convention for future jobs: live under /api/cron/<name>, guard with
// checkCronAuth as the first line, share the runtime above. See
// `app/lib/cron/auth.ts`.

async function sweep(req: NextRequest) {
  const auth = checkCronAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  const { swept } = await runPivotSweep({ apply: true });

  return NextResponse.json({
    ok: true,
    swept,
    windowHours: PIVOT_SWEEP_WINDOW_HOURS,
    sweptAt: new Date().toISOString(),
  });
}

export async function GET(req: NextRequest) {
  return sweep(req);
}

export async function POST(req: NextRequest) {
  return sweep(req);
}
