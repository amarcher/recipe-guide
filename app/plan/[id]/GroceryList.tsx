"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ListOrdered, ShoppingCart, ShoppingBasket } from "lucide-react";
import { Sprite } from "@/app/components/Sprite";
import { discoverSprites } from "@/app/lib/sprites";
import { aisleForName } from "@/app/lib/sprites-core";
import { AISLES, AISLE_LABEL, type Aisle } from "@/app/lib/taxonomy";
import { vibrate } from "@/app/lib/alarm";

// Roadmap item 2.18 — sprite-driven aisle grid for the grocery list.
// Mirrors the MisePlace tile language: 60px sprite, name + quantity,
// tap to toggle. Default view is Shop (aisle-grouped); List view falls
// back to the linear vertical list for keyboard-heavy desktop use.

export type GroceryItemRow = {
  id: string;
  display: string;
  slug: string | null;
  unit: string | null;
  quantity: string | null;
  purchased: boolean;
};

type ViewMode = "shop" | "list";

function aisleFor(item: GroceryItemRow): Aisle | "uncategorized" {
  // Try the row's slug first (already resolved at rollup time), then a
  // best-effort lookup against the display name.
  return aisleForName(item.display) ?? "uncategorized";
}

function groupByAisle(
  items: GroceryItemRow[],
): Array<{ key: string; label: string; items: GroceryItemRow[] }> {
  const buckets = new Map<string, GroceryItemRow[]>();
  for (const it of items) {
    const k = aisleFor(it);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(it);
  }
  const order: Array<Aisle | "uncategorized"> = [...AISLES, "uncategorized"];
  return order
    .filter((k) => buckets.has(k))
    .map((k) => ({
      key: k,
      label: k === "uncategorized" ? "Other" : AISLE_LABEL[k as Aisle],
      items: buckets.get(k)!,
    }));
}

export function GroceryList({
  planId,
  items,
}: {
  planId: string;
  items: GroceryItemRow[];
}) {
  const [view, setView] = useState<ViewMode>("shop");
  const groups = useMemo(() => groupByAisle(items), [items]);

  useEffect(() => {
    const names = items.map((it) => it.display);
    if (names.length) void discoverSprites(names);
  }, [items]);

  if (items.length === 0) {
    return (
      <section className="mt-10 rounded-xl border border-dashed border-stone-300 bg-white p-6 text-center">
        <ShoppingBasket className="mx-auto mb-2 h-5 w-5 text-stone-400" />
        <p className="text-sm text-stone-600">
          Commit meals above and the grocery list assembles itself here.
        </p>
      </section>
    );
  }

  const purchased = items.filter((i) => i.purchased).length;

  return (
    <section className="mt-10 rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-500">
          <ShoppingBasket className="h-4 w-4" />
          Grocery list
        </h2>
        <ViewToggle value={view} onChange={setView} />
      </header>

      <p className="mb-4 text-[11px] text-stone-400 tabular-nums">
        {purchased}/{items.length} in the cart
      </p>

      {view === "shop" ? (
        <div className="space-y-5">
          {groups.map((g) => (
            <AisleSection key={g.key} planId={planId} group={g} />
          ))}
        </div>
      ) : (
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-lg border border-stone-200 bg-white">
          {items.map((it) => (
            <GroceryListRow key={it.id} planId={planId} item={it} />
          ))}
        </ul>
      )}
    </section>
  );
}

function AisleSection({
  planId,
  group,
}: {
  planId: string;
  group: { key: string; label: string; items: GroceryItemRow[] };
}) {
  const purchased = group.items.filter((i) => i.purchased).length;
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
          {group.label}
        </h3>
        <span className="text-[11px] text-stone-400 tabular-nums">
          {purchased}/{group.items.length}
        </span>
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {group.items.map((it) => (
          <GroceryTile key={it.id} planId={planId} item={it} />
        ))}
      </ul>
    </div>
  );
}

function GroceryTile({
  planId,
  item,
}: {
  planId: string;
  item: GroceryItemRow;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const purchased = optimistic ?? item.purchased;

  async function toggle() {
    const next = !purchased;
    setOptimistic(next);
    if (next) vibrate(15);
    try {
      const r = await fetch(`/api/plans/${planId}/grocery/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ purchased: next }),
      });
      if (!r.ok) throw new Error();
      startTransition(() => {
        router.refresh();
        setOptimistic(null);
      });
    } catch {
      setOptimistic(null);
    }
  }

  return (
    <li className="flex">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={purchased}
        className={`group relative flex h-full w-full items-start gap-3 rounded-lg border p-2.5 text-left transition disabled:opacity-60 ${
          purchased
            ? "border-emerald-300 bg-emerald-50"
            : "border-stone-100 bg-stone-50/60 hover:border-stone-300 hover:bg-white"
        }`}
      >
        <div className="relative">
          <Sprite
            name={item.display}
            size={60}
            className={`mt-0.5 transition ${purchased ? "opacity-50" : ""}`}
          />
          {purchased && (
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white shadow">
              <Check className="h-3 w-3" strokeWidth={3} />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div
            className={`text-sm font-medium leading-snug break-words ${
              purchased
                ? "text-emerald-900 line-through decoration-emerald-400"
                : "text-stone-900"
            }`}
          >
            {item.display}
          </div>
          {item.quantity && (
            <div
              className={`mt-0.5 text-xs tabular-nums break-words ${
                purchased ? "text-emerald-700/70" : "text-stone-600"
              }`}
            >
              {item.quantity}
            </div>
          )}
        </div>
      </button>
    </li>
  );
}

// List view — keyboard-friendly, single-column, mirrors the previous design.
function GroceryListRow({
  planId,
  item,
}: {
  planId: string;
  item: GroceryItemRow;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const purchased = optimistic ?? item.purchased;

  async function toggle() {
    const next = !purchased;
    setOptimistic(next);
    try {
      const r = await fetch(`/api/plans/${planId}/grocery/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ purchased: next }),
      });
      if (!r.ok) throw new Error();
      startTransition(() => {
        router.refresh();
        setOptimistic(null);
      });
    } catch {
      setOptimistic(null);
    }
  }

  return (
    <li>
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition hover:bg-stone-50 disabled:opacity-60 ${
          purchased ? "text-stone-400" : "text-stone-800"
        }`}
      >
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition ${
            purchased
              ? "border-emerald-500 bg-emerald-500 text-white"
              : "border-stone-300 bg-white"
          }`}
          aria-hidden
        >
          {purchased && <Check className="h-3 w-3" />}
        </span>
        <Sprite
          name={item.display}
          size={28}
          className={purchased ? "opacity-40" : ""}
        />
        <span className={`flex-1 ${purchased ? "line-through" : ""}`}>
          {item.display}
        </span>
        {item.quantity && (
          <span className="shrink-0 text-xs tabular-nums text-stone-500">
            {item.quantity}
          </span>
        )}
      </button>
    </li>
  );
}

function ViewToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-stone-50 p-0.5">
      <ToggleButton
        active={value === "shop"}
        onClick={() => onChange("shop")}
        Icon={ShoppingCart}
        label="Shop"
      />
      <ToggleButton
        active={value === "list"}
        onClick={() => onChange("list")}
        Icon={ListOrdered}
        label="List"
      />
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition ${
        active
          ? "bg-white text-stone-900 shadow-sm"
          : "text-stone-500 hover:text-stone-900"
      }`}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  );
}
