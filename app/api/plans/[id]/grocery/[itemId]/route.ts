import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/server-auth";
import { loadPlanIfOwned } from "@/app/lib/plan-auth";
import { recordPlanEvent } from "@/app/lib/planner/events";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; itemId: string }> }
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id: planId, itemId } = await ctx.params;

  const plan = await loadPlanIfOwned(user.userId, planId);
  if (!plan) return NextResponse.json({ error: "not found" }, { status: 404 });

  let purchased: boolean | null = null;
  try {
    const body = await req.json();
    purchased = typeof body?.purchased === "boolean" ? body.purchased : null;
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (purchased === null) {
    return NextResponse.json({ error: "missing purchased" }, { status: 400 });
  }

  const item = await prisma.groceryItem.findFirst({
    where: { id: itemId, planId },
  });
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.groceryItem.update({
    where: { id: itemId },
    data: purchased
      ? {
          purchased: true,
          purchasedAt: new Date(),
          purchasedById: user.userId,
        }
      : {
          purchased: false,
          purchasedAt: null,
          purchasedById: null,
        },
  });

  // Roadmap item 1.3 — write through to PantryItem on family-scoped plans.
  // Idempotent on (groceryItemId): toggling purchased on/off within a plan
  // is reversible; cross-plan duplicates are intentional (don't reconcile).
  if (plan.familyId) {
    if (purchased) {
      const existing = await prisma.pantryItem.findUnique({
        where: { groceryItemId: itemId },
      });
      if (!existing) {
        await prisma.pantryItem.create({
          data: {
            familyId: plan.familyId,
            slug: item.slug,
            display: item.display,
            unit: item.unit,
            quantity: item.quantity,
            addedById: user.userId,
            source: "grocery",
            groceryItemId: itemId,
          },
        });
      }
    } else {
      await prisma.pantryItem.deleteMany({
        where: { groceryItemId: itemId },
      });
    }
  }

  await recordPlanEvent(
    planId,
    purchased ? "grocery.purchased" : "grocery.unpurchased",
    {
      itemId,
      slug: item.slug,
      display: item.display,
      unit: item.unit,
      pantryWriteThrough: !!plan.familyId,
    },
    user.userId,
  );

  return NextResponse.json({ ok: true });
}
