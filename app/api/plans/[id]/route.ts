import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/server-auth";
import { loadPlanIfOwned } from "@/app/lib/plan-auth";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const plan = await loadPlanIfOwned(user.userId, id);
  if (!plan) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Cascade in the schema handles IntakeMessage, MealCandidate, PlannedMeal,
  // and GroceryItem. Anything pointing at this plan goes with it.
  await prisma.weeklyPlan.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
