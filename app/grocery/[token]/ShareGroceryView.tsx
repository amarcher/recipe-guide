"use client";

import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { Sprite } from "@/app/components/Sprite";
import { discoverSprites } from "@/app/lib/sprites";
import { aisleForName } from "@/app/lib/sprites-core";
import { AISLES, AISLE_LABEL, type Aisle } from "@/app/lib/taxonomy";
import { vibrate } from "@/app/lib/alarm";

type Item = {
  id: string;
  display: string;
  slug: string | null;
  unit: string | null;
  quantity: string | null;
  purchased: boolean;
};

function aisleFor(item: Item): Aisle | "uncategorized" {
  return aisleForName(item.display) ?? "uncategorized";
}

export function ShareGroceryView({
  token,
  initialItems,
}: {
  token: string;
  initialItems: Item[];
}) {
  const [items, setItems] = useState(initialItems);

  useEffect(() => {
    const names = items.map((it) => it.display);
    if (names.length) void discoverSprites(names);
  }, [items]);

  const groups = useMemo(() => {
    const buckets = new Map<string, Item[]>();
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
  }, [items]);

  const purchased = items.filter((i) => i.purchased).length;

  async function toggle(itemId: string, next: boolean) {
    if (next) vibrate(15);
    setItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, purchased: next } : it)),
    );
    try {
      const r = await fetch(`/api/grocery-share/${token}/items/${itemId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ purchased: next }),
      });
      if (!r.ok) throw new Error();
    } catch {
      // Roll back on failure.
      setItems((prev) =>
        prev.map((it) =>
          it.id === itemId ? { ...it, purchased: !next } : it,
        ),
      );
    }
  }

  return (
    <section>
      <p className="mb-4 text-[11px] text-stone-500 tabular-nums">
        {purchased}/{items.length} in the cart
      </p>
      <div className="space-y-5">
        {groups.map((g) => {
          const inCart = g.items.filter((i) => i.purchased).length;
          return (
            <div key={g.key}>
              <div className="mb-2 flex items-baseline gap-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                  {g.label}
                </h3>
                <span className="text-[11px] text-stone-400 tabular-nums">
                  {inCart}/{g.items.length}
                </span>
              </div>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {g.items.map((it) => (
                  <li key={it.id} className="flex">
                    <button
                      type="button"
                      onClick={() => toggle(it.id, !it.purchased)}
                      aria-pressed={it.purchased}
                      className={`group relative flex h-full w-full items-start gap-3 rounded-lg border p-2.5 text-left transition ${
                        it.purchased
                          ? "border-emerald-300 bg-emerald-50"
                          : "border-stone-100 bg-white hover:border-stone-300"
                      }`}
                    >
                      <div className="relative">
                        <Sprite
                          name={it.display}
                          size={60}
                          className={`mt-0.5 transition ${
                            it.purchased ? "opacity-50" : ""
                          }`}
                        />
                        {it.purchased && (
                          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white shadow">
                            <Check className="h-3 w-3" strokeWidth={3} />
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div
                          className={`text-sm font-medium leading-snug break-words ${
                            it.purchased
                              ? "text-emerald-900 line-through decoration-emerald-400"
                              : "text-stone-900"
                          }`}
                        >
                          {it.display}
                        </div>
                        {it.quantity && (
                          <div
                            className={`mt-0.5 text-xs tabular-nums break-words ${
                              it.purchased
                                ? "text-emerald-700/70"
                                : "text-stone-600"
                            }`}
                          >
                            {it.quantity}
                          </div>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
