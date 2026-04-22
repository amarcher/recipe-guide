import { prisma } from "@/app/lib/prisma";

export async function loadPlanIfOwned(userId: string, planId: string) {
  const familyIds = (
    await prisma.familyMember.findMany({
      where: { userId },
      select: { familyId: true },
    })
  ).map((m) => m.familyId);

  return prisma.weeklyPlan.findFirst({
    where: {
      id: planId,
      OR: [
        { createdById: userId, familyId: null },
        ...(familyIds.length ? [{ familyId: { in: familyIds } }] : []),
      ],
    },
  });
}
