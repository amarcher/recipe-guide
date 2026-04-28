import { prisma } from "@/app/lib/prisma";

// A viewer has access to a plan if any of these hold:
// 1. They are the plan's creator.
// 2. The plan is family-scoped (familyId set) and the viewer is a member of
//    that family.
// 3. The plan is personal-scope (familyId null) but the creator shares at
//    least one family with the viewer — meal planning is collaborative within
//    a family, so personal plans are visible to family members of the creator.
//
// (Same semantics for read and write — meal-planning is collaborative within
// a family, so a partner needs to commit meals, regenerate candidates, mark
// groceries purchased. The function name "loadPlanIfOwned" predates rule 3.)
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
        { createdById: userId },
        ...(familyIds.length
          ? [
              { familyId: { in: familyIds } },
              {
                familyId: null,
                createdBy: {
                  familyMemberships: {
                    some: { familyId: { in: familyIds } },
                  },
                },
              },
            ]
          : []),
      ],
    },
  });
}
