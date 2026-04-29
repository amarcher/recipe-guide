import { prisma } from "@/app/lib/prisma";

// Roadmap item 2.21 — notification helpers. NO comments table per
// convergence call; this is the single fan-out path for hosted-menu
// publishes, kid outcomes, photo uploads, and gift acceptances.
//
// Dotted notation kinds; payload is type-specific shape. Inbox at /inbox.

export const NOTIFICATION_TYPES = [
  // Hosted Menu lifecycle.
  "menu.published",
  // MealOutcome capture.
  "meal.outcome.recorded",
  // Cook log photo uploads (cook night recaps for the family).
  "cook.photo.uploaded",
  // Recipe share token created (informs creator their share is live).
  "recipe.share.created",
  // Grocery share lifecycle.
  "grocery.share.created",
  // Plan committed/cooked summaries (digest-style).
  "meal.committed",
  "meal.cooked",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type NotifyInput = {
  userId: string;
  type: NotificationType;
  payload?: Record<string, unknown>;
  actorUserId?: string | null;
};

// Fan out a notification to every member of a family (excluding the actor
// to avoid self-notifying). Best-effort; failures don't break the source
// mutation.
export async function notifyFamily(
  familyId: string,
  type: NotificationType,
  payload: Record<string, unknown> = {},
  actorUserId?: string | null,
): Promise<void> {
  try {
    const members = await prisma.familyMember.findMany({
      where: { familyId, ...(actorUserId ? { NOT: { userId: actorUserId } } : {}) },
      select: { userId: true },
    });
    if (members.length === 0) return;
    await prisma.notification.createMany({
      data: members.map((m) => ({
        userId: m.userId,
        type,
        payload: payload as unknown as object,
        actorUserId: actorUserId ?? null,
      })),
    });
  } catch (err) {
    console.error("[notify-family] failed", { type, err });
  }
}

// One-recipient notification — used when the audience isn't the family
// (e.g. notifying the share creator that their token was created/used).
export async function notify(input: NotifyInput): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        payload: (input.payload ?? {}) as unknown as object,
        actorUserId: input.actorUserId ?? null,
      },
    });
  } catch (err) {
    console.error("[notify] failed", { type: input.type, err });
  }
}
