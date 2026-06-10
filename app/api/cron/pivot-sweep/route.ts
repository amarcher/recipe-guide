import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/app/lib/prisma";
import { checkCronAuth } from "@/app/lib/cron/auth";
import {
  abandonedPivotScalarWhere,
  PIVOT_SWEEP_WINDOW_HOURS,
} from "@/app/lib/pivot/sweep";

export const runtime = "nodejs";

// Abandoned-pivot sweeper — the project's first scheduled cron.
//
// A mid-cook pivot forks a personal-scope SavedRecipe (pivotMeta set,
// pivotKept=false) that's meant to be kept or discarded at end-of-cook. When
// dinner runs away with the cook and they never decide, the fork lingers in
// the library wearing a "Pivot in progress" badge. This route deletes the
// ones that have clearly been abandoned (older than the sweep window),
// cascading their MiseCheck and CookLog rows. Kept pivots and non-pivot rows
// are never touched — see `app/lib/pivot/sweep.ts` for the exact predicate.
//
// Triggered two ways, both guarded by CRON_SECRET:
//   GET  — Vercel's scheduler (see vercel.json `crons`).
//   POST — `npm run pivot-sweep` or a hands-on rerun.
//
// Cron convention for future jobs: live under /api/cron/<name>, guard with
// checkCronAuth as the first line, share the runtime above. See
// `app/lib/cron/auth.ts`.

async function sweep(req: NextRequest) {
  const auth = checkCronAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  const where: Prisma.SavedRecipeWhereInput = {
    ...abandonedPivotScalarWhere(),
    // "is a real pivot fork" → pivotMeta is not database-NULL. Prisma needs
    // its DbNull sentinel here, which is why this lives at the DB boundary
    // rather than in the Prisma-free predicate module.
    pivotMeta: { not: Prisma.DbNull },
  };
  const { count } = await prisma.savedRecipe.deleteMany({ where });

  return NextResponse.json({
    ok: true,
    swept: count,
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
