import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/app/lib/server-auth";
import { loadPlanIfOwned } from "@/app/lib/plan-auth";
import { recordPlanEvent } from "@/app/lib/planner/events";
import { recordFamilyEventForPlan } from "@/app/lib/family-events";
import {
  DEFAULT_GROCERY_VENDOR,
  GROCERY_VENDORS,
  type GroceryVendorId,
} from "@/app/lib/grocery-vendors";

export const runtime = "nodejs";

// Roadmap items 3.1 + 3.2 — log a grocery export for analytics + family
// inbox fan-out. The deeplink itself is composed client-side from the items
// already on screen; this endpoint only records the click.

type Body = {
  vendor?: GroceryVendorId | string;
  itemCount?: number;
};

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id: planId } = await ctx.params;
  const plan = await loadPlanIfOwned(user.userId, planId);
  if (!plan) return NextResponse.json({ error: "not found" }, { status: 404 });

  let body: Body = {};
  try {
    body = await req.json();
  } catch {}

  const requested = (body.vendor ?? DEFAULT_GROCERY_VENDOR) as string;
  const vendor = (requested as GroceryVendorId) in GROCERY_VENDORS
    ? (requested as GroceryVendorId)
    : DEFAULT_GROCERY_VENDOR;

  // Coerce itemCount server-side rather than trust the body — Anthropic
  // rules notwithstanding, this is just a defensive cast for the JSON
  // payload we'll persist as PlanEvent.payload.
  const rawCount = Number(body.itemCount ?? 0);
  const itemCount = Number.isFinite(rawCount) ? Math.max(0, Math.round(rawCount)) : 0;

  await recordPlanEvent(
    planId,
    "grocery.exported",
    { vendor, itemCount },
    user.userId,
  );
  await recordFamilyEventForPlan(planId, {
    kind: "grocery.exported",
    payload: { vendor, itemCount },
    actorId: user.userId,
  });

  return NextResponse.json({
    ok: true,
    vendor,
    label: GROCERY_VENDORS[vendor].label,
  });
}
