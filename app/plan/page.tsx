import { redirect } from "next/navigation";
import { CalendarRange } from "lucide-react";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/server-auth";
import { NewPlanButton } from "./NewPlanButton";
import { PlanTile } from "./PlanTile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function PlansIndex() {
  const user = await requireUser();
  if (!user) redirect("/");

  const familyIds = (
    await prisma.familyMember.findMany({
      where: { userId: user.userId },
      select: { familyId: true },
    })
  ).map((m) => m.familyId);

  const plans = await prisma.weeklyPlan.findMany({
    where: {
      OR: [
        { createdById: user.userId, familyId: null },
        ...(familyIds.length ? [{ familyId: { in: familyIds } }] : []),
      ],
    },
    include: {
      family: { select: { id: true, name: true } },
      _count: { select: { meals: { where: { status: "QUEUED" } }, candidates: true } },
    },
    orderBy: [{ weekOf: "desc" }, { createdAt: "desc" }],
  });

  return (
    <main className="flex flex-1 flex-col px-4 py-10 sm:py-14">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-6 flex items-baseline justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
              Meal plans
            </h1>
            <p className="mt-1 text-sm text-stone-600">
              Plan a week of meals — or just tonight — then cook from the menu.
            </p>
          </div>
          <NewPlanButton variant="compact" />
        </div>

        {plans.length === 0 ? (
          <div className="rounded-xl border border-dashed border-stone-300 bg-white p-10 text-center">
            <CalendarRange className="mx-auto mb-3 h-6 w-6 text-stone-400" />
            <p className="text-sm text-stone-600">
              No plans yet. Start a conversation with the agent to build one.
            </p>
            <div className="mt-5 flex justify-center">
              <NewPlanButton />
            </div>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {plans.map((p) => (
              <li key={p.id}>
                <PlanTile
                  plan={{
                    id: p.id,
                    weekOfMs: p.weekOf.getTime(),
                    scope: p.scope,
                    status: p.status,
                    family: p.family,
                    candidateCount: p._count.candidates,
                    mealCount: p._count.meals,
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
