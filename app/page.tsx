"use client";

import { useState, FormEvent } from "react";
import { History, Trash2 } from "lucide-react";
import type { CookCard } from "./types";
import { CookCardView } from "./components/CookCardView";
import { SaveBar } from "./components/SaveBar";
import {
  useRecentParses,
  pushRecent,
  removeRecent,
  clearRecent,
} from "./lib/recent";

export default function Home() {
  const [url, setUrl] = useState("");
  const [card, setCard] = useState<CookCard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recents = useRecentParses();

  async function parseUrl(target: string) {
    if (!target.trim()) return;
    setLoading(true);
    setError(null);
    setCard(null);
    try {
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: target.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? `Request failed (${res.status})`);
      } else {
        const parsed = data as CookCard;
        setCard(parsed);
        pushRecent({ url: parsed.source_url, title: parsed.title });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void parseUrl(url);
  }

  function onClickRecent(u: string) {
    setUrl(u);
    void parseUrl(u);
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

        {!card && !loading && recents.length > 0 && (
          <section className="mt-10">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-500">
                <History className="h-3.5 w-3.5" />
                Recent
              </h2>
              <button
                type="button"
                onClick={clearRecent}
                className="text-xs text-stone-500 hover:text-stone-900 hover:underline"
              >
                clear
              </button>
            </div>
            <ul className="space-y-1">
              {recents.map((r) => (
                <li
                  key={r.url}
                  className="group flex items-center gap-2 rounded-md border border-stone-200 bg-white px-3 py-2 transition hover:border-stone-300"
                >
                  <button
                    type="button"
                    onClick={() => onClickRecent(r.url)}
                    className="flex min-w-0 flex-1 flex-col text-left"
                  >
                    <span className="truncate text-sm font-medium text-stone-900">
                      {r.title}
                    </span>
                    <span className="truncate text-[11px] text-stone-400">
                      {(() => {
                        try {
                          return new URL(r.url).hostname.replace(/^www\./, "");
                        } catch {
                          return r.url;
                        }
                      })()}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => removeRecent(r.url)}
                    aria-label={`Remove ${r.title}`}
                    className="text-stone-400 opacity-0 transition group-hover:opacity-100 hover:text-rose-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-stone-400">
              Stored on this device. Click to re-open — instant from cache.
            </p>
          </section>
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
