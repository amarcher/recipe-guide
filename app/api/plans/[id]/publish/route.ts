import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/server-auth";
import { loadPlanIfOwned } from "@/app/lib/plan-auth";
import { publishedMenuSlug } from "@/app/lib/slug";
import { recordPlanEvent } from "@/app/lib/planner/events";
import { recordFamilyEventForPlan } from "@/app/lib/family-events";
import { notifyFamily } from "@/app/lib/notifications";
import type { CookCard } from "@/app/types";

export const runtime = "nodejs";

// Roadmap item 2.17 — Hosted Menu publish.
// PUBLIC-BY-TOKEN per decision #2 (2026-04-28). Slug is generated only on
// explicit publish; on revoke we set publishedSlug to null and never reuse
// it (slug uniqueness on the table prevents accidental re-binding).
//
// Body (POST):
//   { hostNote?: string, dietaryNote?: string }
// Snapshots every QUEUED PlannedMeal's composedCardDraft into a
// WeeklyPlanMenuItem so post-publish recipe overrides don't drift the
// public menu out of sync with what the host promoted.
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id: planId } = await ctx.params;

  const plan = await loadPlanIfOwned(user.userId, planId);
  if (!plan) return NextResponse.json({ error: "not found" }, { status: 404 });

  let body: { hostNote?: string; dietaryNote?: string } = {};
  try {
    body = await req.json();
  } catch {}

  const slug = plan.publishedSlug ?? publishedMenuSlug();

  const meals = await prisma.plannedMeal.findMany({
    where: { planId, status: { in: ["QUEUED", "COOKED"] } },
    include: { candidate: true },
    orderBy: [{ slot: "asc" }, { createdAt: "asc" }],
  });
  if (meals.length === 0) {
    return NextResponse.json(
      { error: "publish requires at least one committed meal" },
      { status: 400 },
    );
  }

  // Replace existing menu items with a fresh snapshot — keeps the
  // publish handler idempotent on republish (re-publish to refresh).
  await prisma.weeklyPlanMenuItem.deleteMany({ where: { planId } });
  await prisma.weeklyPlanMenuItem.createMany({
    data: meals.map((m, i) => ({
      planId,
      plannedMealId: m.id,
      courseLabel: slotToCourse(m.slot),
      displayBlurb: trim((m.candidate.composedCardDraft as CookCard | null)?.tagline)
        ?? trim(m.candidate.summary),
      position: i,
      snapshotCardJson: m.candidate.composedCardDraft as unknown as object,
    })),
  });

  await prisma.weeklyPlan.update({
    where: { id: planId },
    data: {
      publishedSlug: slug,
      publishedAt: new Date(),
      hostNote: trim(body.hostNote) ?? null,
      dietaryNote: trim(body.dietaryNote) ?? null,
    },
  });

  await recordPlanEvent(
    planId,
    "menu.published",
    { slug, mealCount: meals.length },
    user.userId,
  );
  await recordFamilyEventForPlan(planId, {
    kind: "menu.published",
    payload: { slug, mealCount: meals.length },
    actorId: user.userId,
  });
  if (plan.familyId) {
    await notifyFamily(
      plan.familyId,
      "menu.published",
      { slug, mealCount: meals.length, planId },
      user.userId,
    );
  }

  return NextResponse.json({ ok: true, slug });
}

// Revoke. Slug is dropped; the row is preserved (publishedAt stays as a
// historical record). Future re-publish gets a fresh slug — slugs are not
// reusable post-revoke (decision #2).
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id: planId } = await ctx.params;

  const plan = await loadPlanIfOwned(user.userId, planId);
  if (!plan) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (!plan.publishedSlug) return NextResponse.json({ ok: true });
  const previousSlug = plan.publishedSlug;
  await prisma.weeklyPlan.update({
    where: { id: planId },
    data: { publishedSlug: null },
  });
  await recordPlanEvent(
    planId,
    "menu.revoked",
    { previousSlug },
    user.userId,
  );
  await recordFamilyEventForPlan(planId, {
    kind: "menu.revoked",
    payload: { previousSlug },
    actorId: user.userId,
  });
  return NextResponse.json({ ok: true });
}

function slotToCourse(slot: string): string {
  switch (slot) {
    case "BREAKFAST":
      return "Breakfast";
    case "LUNCH":
      return "Lunch";
    case "DINNER":
      return "Dinner";
    case "SNACK":
      return "Snack";
    default:
      return slot;
  }
}

function trim(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  return t ? t : null;
}
