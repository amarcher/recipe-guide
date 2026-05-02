import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
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

  // Collect candidate IDs first — once the plan is deleted they're gone via
  // cascade, and we'd lose the path-key for the Blob asset.
  const candidates = await prisma.mealCandidate.findMany({
    where: { planId: id },
    select: { id: true },
  });

  // Cascade in the schema handles IntakeMessage, MealCandidate, PlannedMeal,
  // and GroceryItem. Anything pointing at this plan goes with it.
  await prisma.weeklyPlan.delete({ where: { id } });

  // Best-effort Blob cleanup. Generated dish JPEGs at dishes/candidate/{id}.jpg
  // are tied 1:1 to the candidate row — once the plan is deleted, nothing
  // references them. Failures here don't block the response (no recovery path
  // matters: the row is already gone).
  if (candidates.length > 0 && process.env.BLOB_READ_WRITE_TOKEN) {
    await del(candidates.map((c) => `dishes/candidate/${c.id}.jpg`)).catch(
      () => {},
    );
  }

  return NextResponse.json({ ok: true });
}
