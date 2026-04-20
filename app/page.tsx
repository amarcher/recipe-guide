"use client";

import { useState, FormEvent } from "react";
import type { CookCard } from "./types";
import { CookCardView } from "./components/CookCardView";
import { SaveBar } from "./components/SaveBar";

export default function Home() {
  const [url, setUrl] = useState("");
  const [card, setCard] = useState<CookCard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setCard(null);
    try {
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? `Request failed (${res.status})`);
      } else {
        setCard(data as CookCard);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col px-4 py-10 sm:py-14">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
            Recipe Guide
          </h1>
          <p className="mt-1 text-sm text-stone-600">
            Paste any recipe URL. Get a one-screen guide with ingredients
            grouped by step, temperatures, and times.
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="flex flex-col gap-2 sm:flex-row sm:items-center"
        >
          <input
            type="url"
            required
            placeholder="https://alisoneroman.com/recipes/alisons-bolognese/"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-base text-stone-900 shadow-sm placeholder:text-stone-400 focus:border-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-200 sm:text-sm"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center rounded-lg bg-stone-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Parsing…" : "Parse recipe"}
          </button>
        </form>

        {error && (
          <div className="mt-6 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            {error}
          </div>
        )}

        {loading && !card && (
          <div className="mt-10 animate-pulse text-center text-sm text-stone-500">
            Reading the page and re-organizing the recipe…
          </div>
        )}
      </div>

      {card && (
        <div className="mx-auto mt-10 w-full max-w-3xl space-y-4">
          <SaveBar card={card} variant="parse" />
          <CookCardView card={card} />
        </div>
      )}
    </main>
  );
}
