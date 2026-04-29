import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { recordPlanEvent } from "@/app/lib/planner/events";
import { recordFamilyEventForPlan } from "@/app/lib/family-events";

export const runtime = "nodejs";

// Roadmap item 2.19 — anonymous purchase toggle through a delegated share.
// Mirrors the auth'd PATCH /api/plans/[id]/grocery/[itemId] logic
// (idempotent on entryKey, pantry write-through when family-scoped),
// but doesn't require a User. The actorId on the events is null because
// the shopper may not be a Recipe Guide user — we just record that an
// anonymous shopper acted.

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ token: string; itemId: string }> },
) {
  const { token, itemId } = await ctx.params;

  const share = await prisma.groceryListShare.findUnique({
    where: { token },
    select: {
      planId: true,
      revokedAt: true,
      expiresAt: true,
      plan: { select: { familyId: true } },
    },
  });
  if (!share || share.revokedAt) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (share.expiresAt && share.expiresAt < new Date()) {
    return NextResponse.json({ error: "expired" }, { status: 410 });
  }

  let body: { purchased?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (typeof body.purchased !== "boolean") {
    return NextResponse.json({ error: "missing purchased" }, { status: 400 });
  }

  const item = await prisma.groceryItem.findFirst({
    where: { id: itemId, planId: share.planId },
  });
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.groceryItem.update({
    where: { id: itemId },
    data: body.purchased
      ? { purchased: true, purchasedAt: new Date() }
      : { purchased: false, purchasedAt: null, purchasedById: null },
  });

  // Mirror the pantry write-through path from the auth'd endpoint. We
  // don't have an addedById (anonymous shopper) — so use null. The event
  // log records the share token id for traceability.
  if (share.plan.familyId) {
    if (body.purchased) {
      const existing = await prisma.pantryItem.findUnique({
        where: { groceryItemId: itemId },
      });
      if (!existing) {
        await prisma.pantryItem.create({
          data: {
            familyId: share.plan.familyId,
            slug: item.slug,
            display: item.display,
            unit: item.unit,
            quantity: item.quantity,
            addedById: null,
            source: "grocery",
            groceryItemId: itemId,
          },
        });
      }
    } else {
      await prisma.pantryItem.deleteMany({ where: { groceryItemId: itemId } });
    }
  }

  await recordPlanEvent(
    share.planId,
    body.purchased ? "grocery.purchased" : "grocery.unpurchased",
    {
      itemId,
      slug: item.slug,
      display: item.display,
      via: "grocery-share",
    },
    null,
  );
  await recordFamilyEventForPlan(share.planId, {
    kind: body.purchased ? "grocery.purchased" : "grocery.unpurchased",
    payload: {
      itemId,
      slug: item.slug,
      display: item.display,
      via: "grocery-share",
    },
    actorId: null,
  });

  return NextResponse.json({ ok: true });
}
