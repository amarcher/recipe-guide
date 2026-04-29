import { prisma } from "@/app/lib/prisma";

// Roadmap item 1.1 — append-only mutation log for the planner pipeline.
// Add a new kind here when wiring a new mutation site. Dotted notation lets
// us range-scan by namespace later (e.g. WHERE kind LIKE 'meal.%').
export const PLAN_EVENT_KINDS = [
  "plan.created",
  "intake.extracted",
  "skeleton.created",
  "candidates.generated",
  "meal.committed",
  "meal.uncommitted",
  "meal.cooked",
  "grocery.purchased",
  "grocery.unpurchased",
] as const;

export type PlanEventKind = (typeof PLAN_EVENT_KINDS)[number];

export async function recordPlanEvent(
  planId: string,
  kind: PlanEventKind,
  payload: Record<string, unknown> = {},
  actorId?: string | null,
): Promise<void> {
  try {
    await prisma.planEvent.create({
      data: {
        planId,
        kind,
        payload: payload as unknown as object,
        actorId: actorId ?? null,
      },
    });
  } catch (err) {
    console.error("[plan-event] failed to record", { kind, planId, err });
  }
}
