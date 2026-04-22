"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShoppingBasket } from "lucide-react";
import { Sprite } from "@/app/components/Sprite";
import { discoverSprites } from "@/app/lib/sprites";

export type GroceryItemRow = {
  id: string;
  display: string;
  slug: string | null;
  unit: string | null;
  quantity: string | null;
  purchased: boolean;
};

export function GroceryList({
  planId,
  items,
}: {
  planId: string;
  items: GroceryItemRow[];
}) {
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
    <section className="mt-10">
      <header className="mb-3 flex items-baseline justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold text-stone-900">
          <ShoppingBasket className="h-4 w-4" />
          Grocery list
        </h2>
        <span className="text-xs text-stone-500 tabular-nums">
          {purchased}/{items.length}
        </span>
      </header>
      <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white">
        {items.map((it) => (
          <GroceryRow key={it.id} planId={planId} item={it} />
        ))}
      </ul>
    </section>
  );
}

function GroceryRow({
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
          {purchased && (
            <svg viewBox="0 0 16 16" className="h-3 w-3 fill-none stroke-current stroke-[2.5]">
              <polyline points="3,8 7,12 13,4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
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
