import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/server-auth";
import { loadPlanIfOwned } from "@/app/lib/plan-auth";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id: planId } = await ctx.params;

  const plan = await loadPlanIfOwned(user.userId, planId);
  if (!plan) return NextResponse.json({ error: "not found" }, { status: 404 });

  const events = await prisma.planEvent.findMany({
    where: { planId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json({ events });
}
