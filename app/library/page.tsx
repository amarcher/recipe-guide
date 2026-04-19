"use client";

import Link from "next/link";
import { ChefHat, Clock, Trash2 } from "lucide-react";
import { useSavedRecipes, deleteRecipe, markCooked } from "@/app/lib/storage";

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
  const recipes = useSavedRecipes();

  return (
    <main className="flex flex-1 flex-col px-4 py-10 sm:py-14">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-6 flex items-baseline justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
              Library
            </h1>
            <p className="mt-1 text-sm text-stone-600">
              Your saved recipes. Stored on this device for now.
            </p>
          </div>
          <Link
            href="/"
            className="text-sm font-medium text-stone-700 hover:text-stone-900"
          >
            + Parse a new recipe
          </Link>
        </div>

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
                  <div className="text-[11px] uppercase tracking-wider text-stone-400">
                    {new URL(r.card.source_url).hostname.replace(/^www\./, "")}
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
