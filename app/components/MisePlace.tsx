"use client";

import { useMemo, useState } from "react";
import { ChefHat, Check, ShoppingCart, Slice, ListOrdered } from "lucide-react";
import type { CookCard } from "@/app/types";
import { buildMise, formatMiseQuantity } from "@/app/lib/aggregate";
import type { MiseEntry } from "@/app/lib/aggregate";
import {
  recipeIdFor,
  useMiseChecks,
  toggleMiseCheck,
  clearMiseChecks,
} from "@/app/lib/storage";
import {
  AISLES,
  AISLE_LABEL,
  PREP_LABEL,
  PREP_ORDER,
  type Aisle,
  type PrepKind,
} from "@/app/lib/taxonomy";
import { Sprite } from "./Sprite";

type ViewMode = "default" | "shopping" | "prep";

const VIEW_TABS: Array<{
  key: ViewMode;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: "default", label: "All", Icon: ListOrdered },
  { key: "shopping", label: "Shop", Icon: ShoppingCart },
  { key: "prep", label: "Prep", Icon: Slice },
];

function groupByAisle(entries: MiseEntry[]): Array<{
  key: string;
  label: string;
  items: MiseEntry[];
}> {
  const buckets = new Map<string, MiseEntry[]>();
  for (const e of entries) {
    const k = e.aisle ?? "uncategorized";
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(e);
  }
  const order = [...AISLES, "uncategorized"];
  return order
    .filter((k) => buckets.has(k))
    .map((k) => ({
      key: k,
      label: k === "uncategorized" ? "Other" : AISLE_LABEL[k as Aisle],
      items: buckets.get(k)!,
    }));
}

function groupByPrep(entries: MiseEntry[]): Array<{
  key: string;
  label: string;
  items: MiseEntry[];
}> {
  const buckets = new Map<PrepKind, MiseEntry[]>();
  for (const e of entries) {
    if (!buckets.has(e.prepKind)) buckets.set(e.prepKind, []);
    buckets.get(e.prepKind)!.push(e);
  }
  return PREP_ORDER.filter((k) => buckets.has(k)).map((k) => ({
    key: k,
    label: PREP_LABEL[k],
    items: buckets.get(k)!,
  }));
}

export function MisePlace({
  card,
  factor,
}: {
  card: CookCard;
  factor: number;
}) {
  const entries = useMemo(() => buildMise(card, factor), [card, factor]);
  const recipeId = recipeIdFor(card);
  const checked = useMiseChecks(recipeId);
  const [view, setView] = useState<ViewMode>("default");

  if (entries.length === 0) return null;
  const checkedCount = entries.filter((e) => checked.has(e.key)).length;

  const groups: Array<{ key: string; label: string | null; items: MiseEntry[] }> =
    view === "shopping"
      ? groupByAisle(entries)
      : view === "prep"
      ? groupByPrep(entries)
      : [{ key: "all", label: null, items: entries }];

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-500">
          <ChefHat className="h-4 w-4" />
          Mise en place
        </h3>
        <ViewToggle value={view} onChange={setView} />
      </div>

      <div className="mb-3 flex items-center justify-between gap-2 text-[11px] text-stone-400">
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

      <div className="space-y-4">
        {groups.map((g) => (
          <div key={g.key}>
            {g.label && (
              <div className="mb-2 flex items-baseline gap-2">
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                  {g.label}
                </h4>
                <span className="text-[11px] text-stone-400">{g.items.length}</span>
              </div>
            )}
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {g.items.map((e) => {
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
                              isChecked
                                ? "text-emerald-600/60"
                                : "text-stone-400"
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
          </div>
        ))}
      </div>
    </section>
  );
}

function ViewToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (m: ViewMode) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-stone-50 p-0.5">
      {VIEW_TABS.map(({ key, label, Icon }) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition ${
              active
                ? "bg-white text-stone-900 shadow-sm"
                : "text-stone-500 hover:text-stone-900"
            }`}
            aria-pressed={active}
          >
            <Icon className="h-3 w-3" />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
