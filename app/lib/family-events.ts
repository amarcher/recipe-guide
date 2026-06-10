import { prisma } from "@/app/lib/prisma";

// Roadmap item 2.13 — household-wide event channel.
//
// Sibling to PlanEvent (item 1.1). PlanEvent is plan-scoped (one plan's
// pipeline log); FamilyEvent is family-scoped (live ribbon visible to every
// member). When a planner mutation also matters to other family members
// (mise checks, hosted-menu publish, photo uploads, MealOutcome
// recordings), record both — PlanEvent is the canonical pipeline trail,
// FamilyEvent is the live broadcast.
//
// Dotted notation namespaces cleanly without enum migrations per new kind.
// New kinds added here as they're wired into mutation sites.
export const FAMILY_EVENT_KINDS = [
  // Planner pipeline (mirrored from PlanEvent for live consumers).
  "plan.created",
  "skeleton.created",
  "candidates.generated",
  "meal.committed",
  "meal.uncommitted",
  "meal.cooked",
  "meal.skipped",
  "meal.swapped",
  "meal.leftovers",
  "grocery.purchased",
  "grocery.unpurchased",
  "grocery.exported",
  // Shared mise / Meezing (item 2.14).
  "mise.checked",
  "mise.unchecked",
  "mise.reset",
  // MealOutcome capture (item 2.15).
  "meal.outcome.recorded",
  // Hosted Menu lifecycle (item 2.17).
  "menu.published",
  "menu.revoked",
  // Cook log photos (already exist; surface here on upload).
  "cook.photo.uploaded",
  // Grocery share lifecycle (item 2.19).
  "grocery.share.created",
  "grocery.share.revoked",
  // Recipe share token lifecycle (item 2.20).
  "recipe.share.created",
  "recipe.share.revoked",
  // Pantry surface.
  "pantry.added",
  "pantry.updated",
  "pantry.removed",
  "pantry.cleared",
] as const;

export type FamilyEventKind = (typeof FAMILY_EVENT_KINDS)[number];

export type FamilyEventInput = {
  familyId: string;
  kind: FamilyEventKind;
  planId?: string | null;
  savedRecipeId?: string | null;
  payload?: Record<string, unknown>;
  actorId?: string | null;
};

// Best-effort fire-and-forget. Failure here must never break a write path —
// notifications and presence are nice-to-have on top of the source-of-truth
// mutations. Mirrors the PlanEvent helper's contract.
export async function recordFamilyEvent(input: FamilyEventInput): Promise<void> {
  try {
    const event = await prisma.familyEvent.create({
      data: {
        familyId: input.familyId,
        kind: input.kind,
        planId: input.planId ?? null,
        savedRecipeId: input.savedRecipeId ?? null,
        payload: (input.payload ?? {}) as unknown as object,
        actorId: input.actorId ?? null,
      },
    });
    // Postgres LISTEN/NOTIFY broadcast — best-effort, ignored on failure.
    void notifyFamilyChannel(input.familyId, event.id).catch(() => {});
  } catch (err) {
    console.error("[family-event] failed to record", { kind: input.kind, err });
  }
}

// LISTEN/NOTIFY channel name for a family. Postgres channel names are
// case-folded unless quoted; we keep them lowercase + family id slug-safe.
export function familyChannelName(familyId: string): string {
  return `family_${familyId.toLowerCase()}`;
}

// Issues `SELECT pg_notify($1, $2)` — Neon's serverless driver supports it
// over plain queries. Subscribers (the SSE route) open a long-lived
// LISTEN connection in a separate Pool to receive the events. We use the
// pooled DATABASE_URL — `pg_notify` works fine over the pooler because it's
// a single statement; only `LISTEN` (which depends on session state) needs
// the unpooled URL.
async function notifyFamilyChannel(familyId: string, eventId: string): Promise<void> {
  const channel = familyChannelName(familyId);
  await prisma.$executeRaw`SELECT pg_notify(${channel}, ${eventId})`;
}

// Helper for routes that already know a planId — resolves to the plan's
// familyId (if any) and skips the FamilyEvent write for personal-scope
// plans. Uses a tiny include so it's cheap to call from every planner POST.
export async function recordFamilyEventForPlan(
  planId: string,
  rest: Omit<FamilyEventInput, "familyId" | "planId">,
): Promise<void> {
  const plan = await prisma.weeklyPlan.findUnique({
    where: { id: planId },
    select: { familyId: true },
  });
  if (!plan?.familyId) return;
  await recordFamilyEvent({ ...rest, familyId: plan.familyId, planId });
}
