import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/server-auth";
import { loadPlanIfOwned } from "@/app/lib/plan-auth";

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

  return NextResponse.json({ ok: true });
}
