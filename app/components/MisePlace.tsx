"use client";

import { ChefHat, Check } from "lucide-react";
import type { CookCard } from "@/app/types";
import { buildMise, formatMiseQuantity } from "@/app/lib/aggregate";
import {
  recipeIdFor,
  useMiseChecks,
  toggleMiseCheck,
  clearMiseChecks,
} from "@/app/lib/storage";
import { Sprite } from "./Sprite";

export function MisePlace({
  card,
  factor,
}: {
  card: CookCard;
  factor: number;
}) {
  const entries = buildMise(card, factor);
  const recipeId = recipeIdFor(card);
  const checked = useMiseChecks(recipeId);
  if (entries.length === 0) return null;
  const checkedCount = entries.filter((e) => checked.has(e.key)).length;

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-500">
          <ChefHat className="h-4 w-4" />
          Mise en place
        </h3>
        <div className="flex items-center gap-3 text-[11px] text-stone-400">
          <span>
            {checkedCount === 0
              ? "tap each one as you get it out"
              : checkedCount === entries.length
              ? "all set — start cooking"
              : `${checkedCount} of ${entries.length} ready`}
          </span>
          {checkedCount > 0 && (
            <button
              type="button"
              onClick={() => clearMiseChecks(recipeId)}
              className="rounded px-1 text-stone-500 hover:text-stone-900 hover:underline"
            >
              clear
            </button>
          )}
        </div>
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {entries.map((e) => {
          const isChecked = checked.has(e.key);
          return (
            <li key={e.key} className="flex">
              <button
                type="button"
                onClick={() => toggleMiseCheck(recipeId, e.key)}
                aria-pressed={isChecked}
                className={`group relative flex h-full w-full items-start gap-3 rounded-lg border p-2.5 text-left transition ${
                  isChecked
                    ? "border-emerald-300 bg-emerald-50"
                    : "border-stone-100 bg-stone-50/60 hover:border-stone-300 hover:bg-white"
                }`}
              >
                <div className="relative">
                  <Sprite
                    name={e.item}
                    size={60}
                    className={`mt-0.5 transition ${
                      isChecked ? "opacity-50" : ""
                    }`}
                  />
                  {isChecked && (
                    <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white shadow">
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div
                    className={`text-sm font-medium leading-snug break-words ${
                      isChecked
                        ? "text-emerald-900 line-through decoration-emerald-400"
                        : "text-stone-900"
                    }`}
                  >
                    {e.item}
                  </div>
                  <div
                    className={`mt-0.5 text-xs tabular-nums break-words ${
                      isChecked ? "text-emerald-700/70" : "text-stone-600"
                    }`}
                  >
                    {formatMiseQuantity(e)}
                  </div>
                  {e.prepHints.length > 0 && (
                    <div
                      className={`mt-0.5 text-[11px] break-words ${
                        isChecked ? "text-emerald-600/60" : "text-stone-400"
                      }`}
                    >
                      {e.prepHints.join(" · ")}
                    </div>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
