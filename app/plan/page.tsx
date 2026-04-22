import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarRange } from "lucide-react";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/server-auth";
import { NewPlanButton } from "./NewPlanButton";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  INTAKE_COMPLETE: "Intake complete",
  SKELETON_READY: "Skeleton ready",
  CANDIDATES_READY: "Ready to pick meals",
  COMMITTED: "Meals committed",
  ACTIVE: "Active",
  ARCHIVED: "Archived",
};

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
              Weekly plans
            </h1>
            <p className="mt-1 text-sm text-stone-600">
              Plan a week of meals, then cook from the menu night-of.
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
                <Link
                  href={`/plan/${p.id}`}
                  className="flex flex-col rounded-xl border border-stone-200 bg-white p-4 shadow-sm transition hover:border-stone-300"
                >
                  <div className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-wider text-stone-400">
                    <span>
                      Week of{" "}
                      {p.weekOf.toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    {p.family ? (
                      <span className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-600">
                        {p.family.name}
                      </span>
                    ) : (
                      <span className="rounded-full bg-stone-50 px-2 py-0.5 text-stone-500">
                        Personal
                      </span>
                    )}
                  </div>
                  <h2 className="mt-2 text-base font-semibold text-stone-900">
                    {STATUS_LABEL[p.status] ?? p.status}
                  </h2>
                  <div className="mt-2 flex gap-4 text-xs text-stone-500">
                    <span>{p._count.candidates} candidates</span>
                    <span>{p._count.meals} committed</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
