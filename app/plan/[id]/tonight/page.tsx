import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/app/lib/prisma";
import { requireUser } from "@/app/lib/server-auth";
import { loadPlanIfOwned } from "@/app/lib/plan-auth";
import { TonightView, type TonightMeal } from "./TonightView";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Roadmap item 1.10 — the Tonight surface.
//
// A glanceable view of every meal queued for the week. Unlike the menu
// (which is for *picking*), Tonight is for *cooking* — one tap drops you
// into the existing recipe-execution flow via publishCandidate("execute").
// Honors menu-not-calendar (project_menu_not_calendar.md): we don't ask
// "what day is this for?" — we present the queue and let the user pick
// what to cook now.
//
// Split-night layout: when a slot has both ADULTS and KIDS meals queued,
// they render side-by-side in a two-column row. Otherwise single column.
// Every meal renders via <MealFace />, the shared visual primitive.

type CandidateSlice = {
  id: string;
  title: string;
  summary: string;
  approxCookMinutes: number;
  heroIngredientSlugs: string[];
  kidFitTag: "RELIABLE" | "STRETCH" | "NEW";
  moodTags: string[];
};

export default async function TonightPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!user) redirect("/");
  const { id } = await params;

  const plan = await loadPlanIfOwned(user.userId, id);
  if (!plan) notFound();

  const queued = await prisma.plannedMeal.findMany({
    where: { planId: plan.id, status: "QUEUED" },
    include: { candidate: true },
    orderBy: [{ slot: "asc" }, { createdAt: "asc" }],
  });

  const groceryRemaining = await prisma.groceryItem.count({
    where: { planId: plan.id, purchased: false },
  });

  const meals: TonightMeal[] = queued.map((m) => {
    const c: CandidateSlice = {
      id: m.candidate.id,
      title: m.candidate.title,
      summary: m.candidate.summary,
      approxCookMinutes: m.candidate.approxCookMinutes,
      heroIngredientSlugs: m.candidate.heroIngredientSlugs,
      kidFitTag: m.candidate.kidFitTag,
      moodTags: m.candidate.moodTags,
    };
    return {
      mealId: m.id,
      candidateId: c.id,
      slot: m.slot,
      eaters: m.eaters,
      title: c.title,
      tagline: c.summary,
      heroIngredientSlugs: c.heroIngredientSlugs,
      approxCookMinutes: c.approxCookMinutes,
      kidFitTag: c.kidFitTag,
      moodTag: c.moodTags[0] ?? null,
    };
  });

  return (
    <main className="flex flex-1 flex-col px-4 py-10 sm:py-14">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-stone-400">
              Week of{" "}
              {plan.weekOf.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </p>
            <h1 className="mt-1 font-serif text-3xl font-medium tracking-tight text-stone-900">
              Tonight
            </h1>
            <p className="mt-1 text-sm text-stone-600">
              What looks good? Tap to start cooking.
            </p>
          </div>
          <div className="flex items-center gap-4 text-sm font-medium">
            <Link
              href={`/plan/${plan.id}`}
              className="text-stone-700 hover:text-stone-900"
            >
              Back to menu
            </Link>
          </div>
        </div>

        <TonightView planId={plan.id} meals={meals} />

        {groceryRemaining > 0 && (
          <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm text-stone-800">
            <span className="font-medium">{groceryRemaining}</span>
            {" "}item{groceryRemaining === 1 ? "" : "s"} still on the grocery list.{" "}
            <Link
              href={`/plan/${plan.id}#grocery`}
              className="font-medium text-amber-900 underline-offset-2 hover:underline"
            >
              Open list
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
