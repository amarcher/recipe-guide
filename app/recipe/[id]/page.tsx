"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Loader2, Pencil } from "lucide-react";
import { forkRecipe, useSavedRecipe } from "@/app/lib/storage";
import { CookCardView } from "@/app/components/CookCardView";
import { CookCardEditor } from "@/app/components/CookCardEditor";
import { SaveBar } from "@/app/components/SaveBar";
import { CookHistory } from "@/app/components/CookHistory";
import { MealOutcomePrompt } from "@/app/components/MealOutcomePrompt";
import { PivotInProgressBanner } from "@/app/components/PivotInProgressBanner";

export default function RecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { recipe, loaded } = useSavedRecipe(id);
  const session = useSession();
  const signedIn = session.status === "authenticated";
  const [editMode, setEditMode] = useState(false);

  // Roadmap item 2.15 — when we land here from a planner Cook tap, the
  // query string carries the plan + meal ids so the post-cook outcome
  // prompt can attribute the verdicts. Sticky until dismissed.
  const search = useSearchParams();
  const fromPlan = search.get("fromPlan");
  const fromPlanMeal = search.get("fromPlanMeal");
  const [outcomeDismissed, setOutcomeDismissed] = useState(false);

  return (
    <main className="flex flex-1 flex-col px-4 py-6 sm:py-10">
      {!loaded ? (
        <div className="mx-auto text-sm text-stone-400">Loading…</div>
      ) : !recipe ? (
        <div className="mx-auto w-full max-w-3xl rounded-xl border border-dashed border-stone-300 bg-white p-10 text-center">
          <p className="text-sm text-stone-600">
            That recipe isn’t saved on this device.{" "}
            <Link href="/library" className="font-medium text-stone-900 underline">
              Open your library
            </Link>{" "}
            or{" "}
            <Link href="/" className="font-medium text-stone-900 underline">
              parse a new one
            </Link>
            .
          </p>
        </div>
      ) : recipe.viewerAccess === "guest" ? (
        <div className="mx-auto w-full max-w-3xl space-y-4">
          <GuestBanner recipeId={recipe.id} />
          <CookCardView card={recipe.card} />
        </div>
      ) : editMode ? (
        <CookCardEditor
          recipeId={recipe.id}
          initialCard={recipe.card}
          initialOverrideUpdatedAt={recipe.overrideUpdatedAt ?? null}
          onExitEdit={() => setEditMode(false)}
        />
      ) : (
        <div className="mx-auto w-full max-w-3xl space-y-4">
          {recipe.pivotMeta && (
            <PivotInProgressBanner
              savedRecipeId={recipe.id}
              pivotMeta={recipe.pivotMeta}
              pivotKept={recipe.pivotKept ?? false}
              parentRecipeId={recipe.pivotedFromSavedRecipeId ?? null}
            />
          )}
          <SaveBar card={recipe.card} variant="detail" />
          {fromPlan && fromPlanMeal && !outcomeDismissed && (
            <MealOutcomePrompt
              planId={fromPlan}
              mealId={fromPlanMeal}
              onDismiss={() => setOutcomeDismissed(true)}
              onComplete={() => setOutcomeDismissed(true)}
            />
          )}
          {signedIn && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setEditMode(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs text-stone-700 hover:bg-stone-50"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit recipe
              </button>
            </div>
          )}
          {signedIn && <CookHistory recipeId={recipe.id} />}
          <CookCardView card={recipe.card} savedRecipeId={recipe.id} />
        </div>
      )}
    </main>
  );
}

function GuestBanner({ recipeId }: { recipeId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFork() {
    setPending(true);
    setError(null);
    const res = await forkRecipe(recipeId);
    if ("error" in res) {
      setError(res.error);
      setPending(false);
      return;
    }
    router.push(`/recipe/${res.id}`);
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm leading-snug text-amber-900">
          <span className="font-semibold">Shared with you.</span> You’re viewing
          someone else’s recipe — read-only. Save a copy to cook it or tweak it.
        </div>
        <button
          type="button"
          onClick={onFork}
          disabled={pending}
          className="inline-flex items-center gap-2 self-start rounded-md bg-amber-900 px-3 py-1.5 text-sm font-medium text-amber-50 hover:bg-amber-950 disabled:opacity-60 sm:self-auto"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save a copy
        </button>
      </div>
      {error && (
        <p className="mt-2 text-xs text-amber-900">Couldn’t fork: {error}</p>
      )}
    </div>
  );
}
