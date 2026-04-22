import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/server-auth";
import { loadPlanIfOwned } from "@/app/lib/plan-auth";
import { MenuView } from "./MenuView";
import { GroceryList } from "./GroceryList";
import { PipelineControls } from "./PipelineControls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PlanIntake = {
  mood?: { useUp: number; explore: number; survival: number };
  notes?: string;
};

type MenuSkeleton = {
  heroIngredients?: Array<{ slug?: string; label: string; reason?: string }>;
  themes?: string[];
  rationale?: string;
};

export default async function PlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!user) redirect("/");
  const { id } = await params;

  const plan = await loadPlanIfOwned(user.userId, id);
  if (!plan) notFound();

  const [candidates, meals, grocery] = await Promise.all([
    prisma.mealCandidate.findMany({
      where: { planId: plan.id, discardedAt: null, filteredOutReason: null },
      orderBy: [{ slot: "asc" }, { rank: "asc" }, { createdAt: "asc" }],
    }),
    prisma.plannedMeal.findMany({
      where: { planId: plan.id, status: "QUEUED" },
    }),
    prisma.groceryItem.findMany({
      where: { planId: plan.id },
      orderBy: [{ purchased: "asc" }, { display: "asc" }],
    }),
  ]);

  const committedCandidateIds = new Set(meals.map((m) => m.chosenCandidateId));
  const mealByCandidateId = new Map(meals.map((m) => [m.chosenCandidateId, m.id]));

  const intake = (plan.intake as PlanIntake | null) ?? {};
  const skeleton = (plan.skeleton as MenuSkeleton | null) ?? {};

  return (
    <main className="flex flex-1 flex-col px-4 py-10 sm:py-14">
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-6 flex items-baseline justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-stone-400">
              Week of{" "}
              {plan.weekOf.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-stone-900">
              Menu
            </h1>
          </div>
          <Link
            href="/library"
            className="text-sm font-medium text-stone-700 hover:text-stone-900"
          >
            Library
          </Link>
        </div>

        <PipelineControls
          planId={plan.id}
          status={plan.status}
          hasSkeleton={!!plan.skeleton}
        />

        {skeleton.rationale && (
          <section className="mb-6 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
            <p className="text-sm leading-relaxed text-stone-800">
              {skeleton.rationale}
            </p>
            {skeleton.themes && skeleton.themes.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {skeleton.themes.map((t) => (
                  <li
                    key={t}
                    className="rounded-full bg-white/80 px-2.5 py-1 text-xs text-stone-700 ring-1 ring-amber-200"
                  >
                    {t}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <MenuView
          planId={plan.id}
          candidates={candidates.map((c) => ({
            id: c.id,
            slot: c.slot,
            eaters: c.eaters,
            title: c.title,
            summary: c.summary,
            rationale: c.rationale,
            heroIngredientSlugs: c.heroIngredientSlugs,
            approxCookMinutes: c.approxCookMinutes,
            kidFitTag: c.kidFitTag,
            rank: c.rank,
            badges: c.badges,
            committed: committedCandidateIds.has(c.id),
            plannedMealId: mealByCandidateId.get(c.id) ?? null,
          }))}
        />

        <GroceryList
          planId={plan.id}
          items={grocery.map((g) => ({
            id: g.id,
            display: g.display,
            slug: g.slug,
            unit: g.unit,
            quantity: g.quantity,
            purchased: g.purchased,
          }))}
        />

        {intake.notes && (
          <p className="mt-6 text-xs italic text-stone-500">{intake.notes}</p>
        )}
      </div>
    </main>
  );
}
