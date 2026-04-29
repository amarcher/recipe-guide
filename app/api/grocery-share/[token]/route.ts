import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export const runtime = "nodejs";

// Roadmap item 2.19 — anonymous read for a delegated grocery share.
// /grocery/[token] reuses this. No auth wall; the opaque token IS the gate.
//
// Returns:
//   { plan: { weekOf, familyName? }, items: [...] }
// Items mirror the GroceryItemRow shape so the existing GroceryList grid
// can render them.
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const share = await prisma.groceryListShare.findUnique({
    where: { token },
    include: {
      plan: {
        include: {
          family: { select: { name: true } },
          groceries: {
            orderBy: [{ purchased: "asc" }, { display: "asc" }],
          },
        },
      },
    },
  });
  if (!share || share.revokedAt) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (share.expiresAt && share.expiresAt < new Date()) {
    return NextResponse.json({ error: "expired" }, { status: 410 });
  }
  return NextResponse.json({
    plan: {
      weekOf: share.plan.weekOf.toISOString(),
      familyName: share.plan.family?.name ?? null,
    },
    items: share.plan.groceries.map((g) => ({
      id: g.id,
      display: g.display,
      slug: g.slug,
      unit: g.unit,
      quantity: g.quantity,
      purchased: g.purchased,
    })),
  });
}
