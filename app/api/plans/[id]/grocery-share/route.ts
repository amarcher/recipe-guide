import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/server-auth";
import { loadPlanIfOwned } from "@/app/lib/plan-auth";
import { randomToken } from "@/app/lib/slug";
import { recordPlanEvent } from "@/app/lib/planner/events";
import { recordFamilyEventForPlan } from "@/app/lib/family-events";

export const runtime = "nodejs";

// Roadmap item 2.19 — token-share the grocery list. POST creates a new
// share; GET lists active shares for the plan; DELETE revokes by id.

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id: planId } = await ctx.params;
  const plan = await loadPlanIfOwned(user.userId, planId);
  if (!plan) return NextResponse.json({ error: "not found" }, { status: 404 });

  const shares = await prisma.groceryListShare.findMany({
    where: { planId, revokedAt: null },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({
    shares: shares.map((s) => ({
      id: s.id,
      token: s.token,
      sharedWithEmail: s.sharedWithEmail,
      createdAt: s.createdAt.getTime(),
      expiresAt: s.expiresAt?.getTime() ?? null,
    })),
  });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id: planId } = await ctx.params;

  const plan = await loadPlanIfOwned(user.userId, planId);
  if (!plan) return NextResponse.json({ error: "not found" }, { status: 404 });

  let body: { sharedWithEmail?: string; expiresInDays?: number } = {};
  try {
    body = await req.json();
  } catch {}

  const days = Math.max(0, Math.min(60, Number(body.expiresInDays ?? 7)));
  const expiresAt =
    days > 0 ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null;

  const share = await prisma.groceryListShare.create({
    data: {
      planId,
      token: randomToken(16),
      createdById: user.userId,
      sharedWithEmail:
        typeof body.sharedWithEmail === "string" && body.sharedWithEmail.trim()
          ? body.sharedWithEmail.trim()
          : null,
      expiresAt,
    },
  });

  await recordPlanEvent(
    planId,
    "grocery.purchased", // Reuse for now; could add `grocery.share.created` later.
    {
      action: "share.created",
      shareId: share.id,
      sharedWithEmail: share.sharedWithEmail,
    },
    user.userId,
  );
  await recordFamilyEventForPlan(planId, {
    kind: "grocery.share.created",
    payload: {
      shareId: share.id,
      sharedWithEmail: share.sharedWithEmail,
    },
    actorId: user.userId,
  });

  return NextResponse.json({
    id: share.id,
    token: share.token,
    expiresAt: share.expiresAt?.getTime() ?? null,
  });
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id: planId } = await ctx.params;
  const plan = await loadPlanIfOwned(user.userId, planId);
  if (!plan) return NextResponse.json({ error: "not found" }, { status: 404 });

  const url = new URL(req.url);
  const shareId = url.searchParams.get("id");
  if (!shareId)
    return NextResponse.json({ error: "missing id" }, { status: 400 });

  const share = await prisma.groceryListShare.findFirst({
    where: { id: shareId, planId },
  });
  if (!share) return NextResponse.json({ ok: true });
  await prisma.groceryListShare.update({
    where: { id: shareId },
    data: { revokedAt: new Date() },
  });

  await recordFamilyEventForPlan(planId, {
    kind: "grocery.share.revoked",
    payload: { shareId },
    actorId: user.userId,
  });
  return NextResponse.json({ ok: true });
}
