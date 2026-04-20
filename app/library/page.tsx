"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ChefHat, Clock, CloudUpload, Trash2, Users } from "lucide-react";
import { useSession } from "next-auth/react";
import {
  useSavedRecipes,
  deleteRecipe,
  markCooked,
  hasUnsyncedLocal,
  syncLocalToCloud,
} from "@/app/lib/storage";
import { useMyFamilies } from "@/app/lib/families";

const noopSubscribe = () => () => {};
const trueSnapshot = () => true;
const falseSnapshot = () => false;

type Filter = "all" | "personal" | { familyId: string };

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

export default function LibraryPage() {
  const allRecipes = useSavedRecipes();
  const session = useSession();
  const signedIn = session.status === "authenticated";
  const { families } = useMyFamilies();
  const mounted = useSyncExternalStore(noopSubscribe, trueSnapshot, falseSnapshot);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const needsSync = mounted && signedIn && !syncResult && hasUnsyncedLocal();

  const recipes = allRecipes.filter((r) => {
    if (filter === "all") return true;
    if (filter === "personal") return !r.family;
    return r.family?.id === filter.familyId;
  });

  async function onSync() {
    setSyncing(true);
    try {
      const r = await syncLocalToCloud();
      setSyncResult(`Synced ${r.pushed} of ${r.total} local recipes to your account.`);
    } catch (e) {
      setSyncResult(e instanceof Error ? e.message : "sync failed");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col px-4 py-10 sm:py-14">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-6 flex items-baseline justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
              Library
            </h1>
            <p className="mt-1 text-sm text-stone-600">
              {signedIn
                ? "Your saved recipes, synced across your devices."
                : "Your saved recipes. Sign in to sync across devices."}
            </p>
          </div>
          <Link
            href="/"
            className="text-sm font-medium text-stone-700 hover:text-stone-900"
          >
            + Parse a new recipe
          </Link>
        </div>

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

        {signedIn && families.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-1 rounded-full border border-stone-200 bg-white p-1 shadow-sm w-fit">
            <FilterTab
              active={filter === "all"}
              onClick={() => setFilter("all")}
              label="All"
              count={allRecipes.length}
            />
            <FilterTab
              active={filter === "personal"}
              onClick={() => setFilter("personal")}
              label="Personal"
              count={allRecipes.filter((r) => !r.family).length}
            />
            {families.map((f) => (
              <FilterTab
                key={f.id}
                active={typeof filter === "object" && filter.familyId === f.id}
                onClick={() => setFilter({ familyId: f.id })}
                label={f.name}
                count={allRecipes.filter((r) => r.family?.id === f.id).length}
              />
            ))}
          </div>
        )}

        {recipes.length === 0 ? (
          <div className="rounded-xl border border-dashed border-stone-300 bg-white p-10 text-center">
            <p className="text-sm text-stone-600">
              No saved recipes yet. Paste a URL on the{" "}
              <Link href="/" className="font-medium text-stone-900 underline">
                home page
              </Link>{" "}
              and click <span className="font-medium">Save to library</span>.
            </p>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {recipes.map((r) => (
              <li
                key={r.id}
                className="group relative flex flex-col rounded-xl border border-stone-200 bg-white p-4 shadow-sm transition hover:border-stone-300"
              >
                <Link href={`/recipe/${r.id}`} className="flex-1">
                  <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-stone-400">
                    <span>
                      {new URL(r.card.source_url).hostname.replace(/^www\./, "")}
                    </span>
                    {r.family && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-stone-600">
                        <Users className="h-3 w-3" />
                        {r.family.name}
                      </span>
                    )}
                  </div>
                  <h2 className="mt-1 line-clamp-2 text-base font-semibold text-stone-900">
                    {r.card.title}
                  </h2>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-stone-500">
                    {r.card.total_time && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {r.card.total_time}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <ChefHat className="h-3 w-3" />
                      {r.cookCount === 0
                        ? "never cooked"
                        : `cooked ${r.cookCount}× · last ${formatRelative(r.lastCookedAt!)}`}
                    </span>
                  </div>
                </Link>
                <div className="mt-3 flex justify-between border-t border-stone-100 pt-3">
                  <button
                    type="button"
                    onClick={() => markCooked(r.id)}
                    className="text-xs font-medium text-stone-600 hover:text-stone-900"
                  >
                    + I cooked this
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Remove "${r.card.title}" from your library?`)) {
                        deleteRecipe(r.id);
                      }
                    }}
                    aria-label="Delete"
                    className="text-stone-400 opacity-0 transition group-hover:opacity-100 hover:text-rose-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

function FilterTab({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition ${
        active
          ? "bg-stone-900 text-white"
          : "text-stone-600 hover:bg-stone-100"
      }`}
    >
      {label}
      <span
        className={`tabular-nums ${
          active ? "text-stone-300" : "text-stone-400"
        }`}
      >
        {count}
      </span>
    </button>
  );
}
