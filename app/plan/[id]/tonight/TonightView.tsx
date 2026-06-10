"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Baby, Clock, Flame, Leaf, RefreshCw, Users } from "lucide-react";
import {
  MealFace,
  type MealFaceSubject,
} from "@/app/components/MealFace";
import { Sprite } from "@/app/components/Sprite";
import { refreshSavedRecipes } from "@/app/lib/storage";

export type TonightPantryItem = {
  id: string;
  display: string;
  quantity: string | null;
  label: string;
  urgency: "expired" | "soon";
};

export type TonightMeal = {
  mealId: string;
  candidateId: string;
  slot: "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK";
  eaters: Array<"ADULTS" | "KIDS">;
  title: string;
  tagline: string;
  heroIngredientSlugs: string[];
  generatedDishImageUrl: string | null;
  approxCookMinutes: number;
  kidFitTag: "RELIABLE" | "STRETCH" | "NEW";
  moodTag: string | null;
  usesExpiring: string[];
};

const SLOT_LABEL: Record<TonightMeal["slot"], string> = {
  BREAKFAST: "Breakfast",
  LUNCH: "Lunch",
  DINNER: "Dinner",
  SNACK: "Snacks",
};

const SLOT_ORDER: Record<TonightMeal["slot"], number> = {
  BREAKFAST: 0,
  LUNCH: 1,
  DINNER: 2,
  SNACK: 3,
};

function formatList(names: string[]): string {
  const lower = names.map((n) => n.toLowerCase());
  if (lower.length === 1) return lower[0];
  if (lower.length === 2) return `${lower[0]} and ${lower[1]}`;
  return `${lower.slice(0, -1).join(", ")}, and ${lower[lower.length - 1]}`;
}

function eaterKey(eaters: TonightMeal["eaters"]): string {
  return [...eaters].sort().join("+");
}

function eaterLabel(eaters: TonightMeal["eaters"]): string {
  if (eaters.length === 2) return "Adults + kids";
  return eaters[0] === "ADULTS" ? "Adults" : "Kids";
}

function EaterIcon({ eaters }: { eaters: TonightMeal["eaters"] }) {
  if (eaters.includes("KIDS") && !eaters.includes("ADULTS")) {
    return <Baby className="h-3.5 w-3.5" aria-hidden />;
  }
  return <Users className="h-3.5 w-3.5" aria-hidden />;
}

// Group by slot. Within a slot, separate adults and kids tracks so split
// nights render side-by-side. Returns ordered slot rows.
type SlotRow = {
  slot: TonightMeal["slot"];
  tracks: Array<{ eaters: TonightMeal["eaters"]; meals: TonightMeal[] }>;
};

function organize(meals: TonightMeal[]): SlotRow[] {
  const bySlot = new Map<TonightMeal["slot"], TonightMeal[]>();
  for (const m of meals) {
    const list = bySlot.get(m.slot) ?? [];
    list.push(m);
    bySlot.set(m.slot, list);
  }

  const rows: SlotRow[] = [];
  for (const [slot, list] of bySlot.entries()) {
    const byEater = new Map<string, TonightMeal[]>();
    for (const m of list) {
      const key = eaterKey(m.eaters);
      const arr = byEater.get(key) ?? [];
      arr.push(m);
      byEater.set(key, arr);
    }
    // Track ordering: combined > adults > kids (combined first since most
    // dinners are unsplit).
    const trackOrder = (e: TonightMeal["eaters"]): number => {
      if (e.length === 2) return 0;
      if (e[0] === "ADULTS") return 1;
      return 2;
    };
    // Within a track, meals that rescue near-expiry pantry items float to
    // the top — "what should I cook tonight?" favors the one that saves the
    // cilantro. Stable sort keeps the original order otherwise.
    const tracks = [...byEater.values()]
      .map((meals) => ({
        eaters: meals[0].eaters,
        meals: [...meals].sort(
          (a, b) =>
            (b.usesExpiring.length > 0 ? 1 : 0) -
            (a.usesExpiring.length > 0 ? 1 : 0),
        ),
      }))
      .sort((a, b) => trackOrder(a.eaters) - trackOrder(b.eaters));
    rows.push({ slot, tracks });
  }
  return rows.sort((a, b) => SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot]);
}

export function TonightView({
  planId,
  meals,
  useSoon = [],
}: {
  planId: string;
  meals: TonightMeal[];
  useSoon?: TonightPantryItem[];
}) {
  if (meals.length === 0) {
    return (
      <div className="space-y-6">
        <UseItUpStrip items={useSoon} />
        <EmptyState planId={planId} />
      </div>
    );
  }

  const rows = organize(meals);

  return (
    <div className="space-y-8">
      <UseItUpStrip items={useSoon} />
      {rows.map((row) => (
        <SlotRowView key={row.slot} planId={planId} row={row} />
      ))}
    </div>
  );
}

function UseItUpStrip({ items }: { items: TonightPantryItem[] }) {
  if (items.length === 0) return null;
  return (
    <section
      aria-label="Pantry items to use soon"
      className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-900">
          <Leaf className="h-3.5 w-3.5" aria-hidden />
          Use it up
        </h2>
        <Link
          href="/pantry"
          className="text-[12px] font-medium text-amber-900 underline-offset-2 hover:underline"
        >
          Pantry →
        </Link>
      </div>
      <p className="mt-1 text-[13px] text-stone-700">
        On hand and on the clock — meals below that use them are marked.
      </p>
      <ul className="mt-2.5 flex flex-wrap gap-2">
        {items.map((it) => (
          <li
            key={it.id}
            className={`flex items-center gap-2 rounded-full border bg-white py-1 pl-1.5 pr-2.5 shadow-sm ${
              it.urgency === "expired" ? "border-rose-200" : "border-amber-200"
            }`}
          >
            <Sprite name={it.display} size={24} />
            <span className="text-[13px] font-medium text-stone-900">
              {it.display}
            </span>
            <span
              className={`text-[11px] font-medium ${
                it.urgency === "expired" ? "text-rose-700" : "text-amber-800"
              }`}
            >
              {it.label}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function EmptyState({ planId }: { planId: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-50 p-8 text-center">
      <p className="font-serif text-lg italic text-stone-700">
        Nothing queued yet.
      </p>
      <p className="mt-2 text-sm text-stone-500">
        Pick a few candidates from the menu to fill out the week.
      </p>
      <Link
        href={`/plan/${planId}`}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800"
      >
        Go to menu
      </Link>
    </div>
  );
}

function SlotRowView({ planId, row }: { planId: string; row: SlotRow }) {
  const isSplit = row.tracks.length === 2;
  return (
    <section>
      <header className="mb-3 flex items-baseline gap-2">
        <h2 className="font-serif text-xl font-medium tracking-tight text-stone-900">
          {SLOT_LABEL[row.slot]}
        </h2>
        {isSplit && (
          <span className="text-[11px] uppercase tracking-wider text-amber-700">
            split tonight
          </span>
        )}
      </header>

      <div
        className={
          isSplit
            ? "grid gap-4 md:grid-cols-2"
            : "grid gap-4 sm:grid-cols-2 lg:grid-cols-2"
        }
      >
        {row.tracks.map((track) => (
          <div
            key={eaterKey(track.eaters)}
            className={
              track.eaters.length === 1 && track.eaters[0] === "KIDS"
                ? "rounded-2xl bg-amber-50/70 p-3 ring-1 ring-amber-200"
                : ""
            }
          >
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-stone-500">
              <EaterIcon eaters={track.eaters} />
              {eaterLabel(track.eaters)}
            </div>
            <div className="grid gap-3">
              {track.meals.map((m) => (
                <TonightTile key={m.mealId} planId={planId} meal={m} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function TonightTile({
  planId,
  meal,
}: {
  planId: string;
  meal: TonightMeal;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onCook() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/plans/${planId}/meals/${meal.mealId}/cook`,
        { method: "POST" },
      );
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error ?? r.statusText);
      }
      const body = (await r.json()) as { savedRecipeId: string };
      await refreshSavedRecipes();
      router.push(
        `/recipe/${body.savedRecipeId}?fromPlan=${planId}&fromPlanMeal=${meal.mealId}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
      setBusy(false);
    }
  }

  const subject: MealFaceSubject = {
    id: meal.candidateId,
    title: meal.title,
    tagline: meal.tagline,
    generatedDishImageUrl: meal.generatedDishImageUrl,
    heroIngredientSlugs: meal.heroIngredientSlugs,
    moodTag: meal.moodTag,
  };

  return (
    <article className="overflow-hidden rounded-2xl border border-stone-200 bg-stone-50 shadow-sm">
      <MealFace subject={subject} size="spread" className="rounded-none" />
      {meal.usesExpiring.length > 0 && (
        <p className="flex items-center gap-1.5 border-t border-amber-100 bg-amber-50/80 px-5 py-2 text-[12px] font-medium text-amber-900">
          <Leaf className="h-3.5 w-3.5 flex-none" aria-hidden />
          Uses your {formatList(meal.usesExpiring)} before{" "}
          {meal.usesExpiring.length === 1 ? "it turns" : "they turn"}
        </p>
      )}
      <div className="flex items-center justify-between gap-3 border-t border-stone-100 px-5 py-3">
        <span className="inline-flex items-center gap-1.5 text-sm text-stone-600">
          <Clock className="h-3.5 w-3.5" />
          {meal.approxCookMinutes} min
        </span>
        <button
          type="button"
          onClick={onCook}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-stone-800 disabled:opacity-60"
        >
          {busy ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Flame className="h-4 w-4" />
          )}
          {busy ? "Opening…" : "Cook this now"}
        </button>
      </div>
      {error && (
        <p className="px-5 pb-3 text-[11px] text-rose-700">{error}</p>
      )}
    </article>
  );
}
