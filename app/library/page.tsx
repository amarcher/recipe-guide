"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { CloudUpload, Plus, Search } from "lucide-react";
import { useSession } from "next-auth/react";
import {
  useSavedRecipes,
  hasUnsyncedLocal,
  syncLocalToCloud,
} from "@/app/lib/storage";
import { useMyFamilies } from "@/app/lib/families";
import {
  RolodexTile,
  heroesFromCard,
  type TileData,
} from "./RolodexTile";

const noopSubscribe = () => () => {};
const trueSnapshot = () => true;
const falseSnapshot = () => false;

type BaseFilter =
  | "inspire"
  | "recent"
  | "hits"
  | "never"
  | "personal"
  | { familyId: string };

export default function LibraryPage() {
  const allRecipes = useSavedRecipes();
  const session = useSession();
  const signedIn = session.status === "authenticated";
  const { families } = useMyFamilies();
  const mounted = useSyncExternalStore(noopSubscribe, trueSnapshot, falseSnapshot);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [filter, setFilter] = useState<BaseFilter>("inspire");
  const [query, setQuery] = useState("");
  const needsSync = mounted && signedIn && !syncResult && hasUnsyncedLocal();

  // Dedupe the "All" view by source URL so a recipe saved to multiple scopes
  // shows as a single tile with combined scope pills + summed cook count.
  const tiles: TileData[] = useMemo(() => {
    type Accum = TileData & { card: import("@/app/types").CookCard };
    const byUrl = new Map<string, Accum>();
    for (const r of allRecipes) {
      const key = r.card.source_url;
      const existing = byUrl.get(key);
      if (!existing) {
        byUrl.set(key, {
          id: r.id,
          title: r.card.title,
          sourceUrl: r.card.source_url,
          photoUrl: r.photoUrl ?? null,
          heroes: heroesFromCard(r.card),
          totalCookCount: r.cookCount,
          latestLastCookedAt: r.lastCookedAt,
          savedAt: r.savedAt,
          scopes: [r.family ?? null],
          card: r.card,
        });
      } else {
        existing.scopes.push(r.family ?? null);
        existing.totalCookCount += r.cookCount;
        existing.latestLastCookedAt = Math.max(
          existing.latestLastCookedAt ?? 0,
          r.lastCookedAt ?? 0
        ) || null;
        if (!existing.photoUrl && r.photoUrl) existing.photoUrl = r.photoUrl;
      }
    }
    return [...byUrl.values()];
  }, [allRecipes]);

  const filtered = useMemo(() => {
    let out = tiles;

    if (filter === "recent") {
      out = [...out]
        .sort(
          (a, b) =>
            (b.latestLastCookedAt ?? b.savedAt) -
            (a.latestLastCookedAt ?? a.savedAt)
        )
        .slice(0, 12);
    } else if (filter === "hits") {
      out = out
        .filter((r) => r.totalCookCount >= 3)
        .sort((a, b) => b.totalCookCount - a.totalCookCount);
    } else if (filter === "never") {
      out = out.filter((r) => r.totalCookCount === 0);
    } else if (filter === "personal") {
      // Only tiles that have at least one personal save
      out = out.filter((r) => r.scopes.some((s) => s === null));
    } else if (typeof filter === "object") {
      out = out.filter((r) =>
        r.scopes.some((s) => s?.id === filter.familyId)
      );
    } else {
      // inspire — default sort: most-cooked, then most-recent, then just-saved
      out = [...out].sort((a, b) => {
        if (b.totalCookCount !== a.totalCookCount)
          return b.totalCookCount - a.totalCookCount;
        return (
          (b.latestLastCookedAt ?? b.savedAt) -
          (a.latestLastCookedAt ?? a.savedAt)
        );
      });
    }

    const q = query.trim().toLowerCase();
    if (q) out = out.filter((r) => r.title.toLowerCase().includes(q));

    return out;
  }, [tiles, filter, query]);

  async function onSync() {
    setSyncing(true);
    try {
      const r = await syncLocalToCloud();
      setSyncResult(
        `Synced ${r.pushed} of ${r.total} local recipes to your account.`
      );
    } catch (e) {
      setSyncResult(e instanceof Error ? e.message : "sync failed");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col px-4 py-10 sm:py-12">
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="t-h1">The rolodex</h1>
            <p className="t-lead mt-1 max-w-[56ch]">
              Everything you&rsquo;ve cooked, wanted to cook, or been inspired by.
              Flip through until something jumps out.
            </p>
          </div>

          <label className="relative inline-flex w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the rolodex…"
              className="flex-1 rounded-full border border-stone-300 bg-stone-50 py-2 pl-9 pr-3 text-sm text-stone-900 shadow-sm placeholder:text-stone-400 focus:border-ochre-500 focus:outline-none focus:ring-2 focus:ring-ochre-200"
            />
          </label>
        </header>

        {signedIn && needsSync && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span className="inline-flex items-center gap-2">
              <CloudUpload className="h-4 w-4" />
              You have local recipes from before signing in. Push them to your
              account?
            </span>
            <button
              type="button"
              onClick={onSync}
              disabled={syncing}
              className="rounded-md bg-amber-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-800 disabled:opacity-60"
            >
              {syncing ? "Syncing…" : "Sync now"}
            </button>
          </div>
        )}
        {syncResult && (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            {syncResult}
          </div>
        )}

        <nav className="mb-6 flex flex-wrap gap-1.5">
          <FilterChip
            label="Inspire me"
            active={filter === "inspire"}
            onClick={() => setFilter("inspire")}
          />
          <FilterChip
            label="Recent"
            active={filter === "recent"}
            onClick={() => setFilter("recent")}
          />
          <FilterChip
            label="Greatest hits"
            active={filter === "hits"}
            onClick={() => setFilter("hits")}
          />
          <FilterChip
            label="Never cooked"
            active={filter === "never"}
            onClick={() => setFilter("never")}
          />
          {signedIn && (
            <FilterChip
              label="Personal"
              active={filter === "personal"}
              onClick={() => setFilter("personal")}
            />
          )}
          {families.map((f) => (
            <FilterChip
              key={f.id}
              label={f.name}
              active={typeof filter === "object" && filter.familyId === f.id}
              onClick={() => setFilter({ familyId: f.id })}
            />
          ))}
        </nav>

        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-10 text-center">
            <p className="t-lead text-stone-600">
              {query.trim()
                ? "Nothing matching that — try another word, or switch filters."
                : tiles.length === 0
                ? "No saved recipes yet. Paste a URL on the home page and click Save."
                : "Nothing in this filter. Pick another one, or clear the search."}
            </p>
          </div>
        ) : (
          <div className="columns-1 gap-3 sm:columns-2 lg:columns-3">
            {filtered.map((tile, i) => (
              <RolodexTile key={tile.id} tile={tile} tall={i % 3 === 0} />
            ))}
          </div>
        )}

        <Link
          href="/"
          className="fixed bottom-6 right-6 z-20 inline-flex items-center gap-2 rounded-full bg-stone-900 px-4 py-2.5 text-sm font-medium text-stone-50 shadow-lg transition hover:bg-stone-800"
        >
          <Plus className="h-4 w-4" /> Paste a URL
        </Link>
      </div>
    </main>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center rounded-full border px-3.5 py-1.5 text-[13px] transition ${
        active
          ? "border-stone-900 bg-stone-900 text-stone-50"
          : "border-stone-300 bg-stone-50 text-stone-700 hover:border-stone-400 hover:text-stone-900"
      }`}
    >
      {label}
    </button>
  );
}
