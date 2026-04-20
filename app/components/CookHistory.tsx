"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ChefHat } from "lucide-react";

type Entry = {
  userId: string;
  name: string | null;
  image: string | null;
  cookCount: number;
  lastCookedAt: number | null;
  isMe: boolean;
};

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const day = 24 * 60 * 60 * 1000;
  if (diff < day) return "today";
  if (diff < 2 * day) return "yesterday";
  const days = Math.floor(diff / day);
  if (days < 14) return `${days}d ago`;
  if (days < 60) return `${Math.floor(days / 7)}w ago`;
  return new Date(ts).toLocaleDateString();
}

export function CookHistory({ recipeId }: { recipeId: string }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/recipes/${recipeId}`);
      if (cancelled) return;
      if (!res.ok) {
        setEntries([]);
        return;
      }
      const data = (await res.json()) as { cookHistory?: Entry[] };
      setEntries(data.cookHistory ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [recipeId]);

  if (!entries) return null;
  // Anyone with cookCount > 0, OR everyone if it's a multi-member scope (so
  // saves-without-cooks are still visible). Hide the panel entirely if it's
  // just you with 0 cooks — there's nothing to show.
  const hasContent = entries.some(
    (e) => e.cookCount > 0 || (entries.length > 1 && !e.isMe)
  );
  if (!hasContent) return null;

  const totalCooks = entries.reduce((sum, e) => sum + e.cookCount, 0);

  return (
    <div className="rounded-lg border border-stone-200 bg-white px-4 py-3 shadow-sm">
      <div className="mb-2 flex items-baseline justify-between text-xs text-stone-500">
        <span className="inline-flex items-center gap-1.5 font-semibold uppercase tracking-wider">
          <ChefHat className="h-3.5 w-3.5" />
          Cooks
        </span>
        <span className="tabular-nums">
          {totalCooks} total · {entries.length}{" "}
          {entries.length === 1 ? "cook" : "people"}
        </span>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-2">
        {entries.map((e) => (
          <li
            key={e.userId}
            className="flex items-center gap-2"
          >
            {e.image ? (
              <Image
                src={e.image}
                alt=""
                width={24}
                height={24}
                className="rounded-full"
                unoptimized
              />
            ) : (
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-stone-200 text-[10px] font-semibold text-stone-700">
                {(e.name ?? "?")[0]?.toUpperCase()}
              </span>
            )}
            <div className="text-xs">
              <div className="font-medium text-stone-900">
                {e.isMe ? "You" : e.name ?? "Someone"}
              </div>
              <div className="text-stone-500 tabular-nums">
                {e.cookCount === 0
                  ? "saved · not yet cooked"
                  : e.cookCount === 1
                  ? `cooked once · ${formatRelative(e.lastCookedAt!)}`
                  : `${e.cookCount}× · last ${formatRelative(e.lastCookedAt!)}`}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
