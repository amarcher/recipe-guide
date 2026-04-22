"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import {
  CalendarRange,
  Flame,
  History,
  Library as LibraryIcon,
  Trash2,
} from "lucide-react";
import type { CookCard } from "./types";
import { CookCardView } from "./components/CookCardView";
import { SaveBar } from "./components/SaveBar";
import { useCookSession } from "./lib/cook-session";
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
  const cookSession = useCookSession();

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

  return (
    <main className="flex flex-1 flex-col px-4 py-10 sm:py-14">
      <div className="mx-auto w-full max-w-3xl">
        {!card && !loading && (
          <header className="mb-8">
            <h1 className="t-h1">What are we cooking?</h1>
            <p className="t-lead mt-2 max-w-[56ch]">
              Planning the week, cooking something specific tonight, or just
              flipping through for inspiration — pick a path.
            </p>
          </header>
        )}

        {cookSession && !card && !loading && (
          <Link
            href={`/recipe/${cookSession.savedId}`}
            className="mb-6 flex items-center gap-3 rounded-2xl border border-amber-300 bg-amber-100/60 px-5 py-4 transition hover:border-amber-400"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-600 text-white">
              <Flame className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-900">
                You&rsquo;re cooking
              </p>
              <p className="truncate font-serif text-lg font-medium text-stone-900">
                Pick up where you left off
              </p>
            </div>
            <span className="text-sm font-medium text-amber-900">Resume →</span>
          </Link>
        )}

        {!card && !loading && (
          <div className="grid gap-3 sm:grid-cols-2">
            <PathCard
              href="/plan"
              icon={<CalendarRange className="h-5 w-5" />}
              title="Plan the week"
              body="A Sunday-night conversation for what you're cooking Mon–Fri. Opens the week you've already started, or lets you spin up a fresh one."
              cta="Open the planner"
              tone="ochre"
            />
            <PathCard
              href="/library"
              icon={<LibraryIcon className="h-5 w-5" />}
              title="Browse the rolodex"
              body="Your cooked-before and saved-for-later recipes, laid out for flipping through until something jumps out."
              cta="Open the library"
              tone="paper"
            />
          </div>
        )}

        {!card && !loading && (
          <section className="mt-8 rounded-2xl border border-stone-300 bg-stone-50 p-5 shadow-sm sm:p-6">
            <div className="mb-3 flex items-baseline gap-2">
              <h2 className="t-h3">Cooking something specific?</h2>
              <span className="text-[11px] uppercase tracking-wider text-stone-500">
                Paste a URL
              </span>
            </div>
            <p className="t-meta mb-4">
              Any recipe page turns into a one-screen guide — ingredients grouped
              by step, temperatures, times, mise checked off.
            </p>
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
                className="flex-1 rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-base text-stone-900 shadow-sm placeholder:text-stone-400 focus:border-ochre-500 focus:outline-none focus:ring-2 focus:ring-ochre-200 sm:text-sm"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center justify-center rounded-lg bg-ochre-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-ochre-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Parse recipe
              </button>
            </form>

            {error && (
              <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                {error}
              </div>
            )}

            {recents.length > 0 && (
              <div className="mt-5 border-t border-stone-200 pt-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                    <History className="h-3 w-3" />
                    Recent parses
                  </h3>
                  <button
                    type="button"
                    onClick={clearRecent}
                    className="text-xs text-stone-500 hover:text-stone-900 hover:underline"
                  >
                    clear
                  </button>
                </div>
                <ul className="space-y-1">
                  {recents.slice(0, 5).map((r) => (
                    <li
                      key={r.url}
                      className="group flex items-center gap-2 rounded-md border border-stone-200 bg-white px-3 py-2 transition hover:border-stone-400"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setUrl(r.url);
                          void parseUrl(r.url);
                        }}
                        className="flex min-w-0 flex-1 flex-col text-left"
                      >
                        <span className="truncate text-sm font-medium text-stone-900">
                          {r.title}
                        </span>
                        <span className="truncate text-[11px] text-stone-400">
                          {hostOf(r.url)}
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
                <p className="mt-2 text-[11px] italic text-stone-400">
                  Stored on this device. Click to re-open — instant from cache.
                </p>
              </div>
            )}
          </section>
        )}

        {loading && !card && (
          <div className="mt-10 animate-pulse text-center font-serif italic text-sm text-stone-500">
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

function PathCard({
  href,
  icon,
  title,
  body,
  cta,
  tone,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  cta: string;
  tone: "ochre" | "paper";
}) {
  const toneStyles =
    tone === "ochre"
      ? "border-ochre-300 bg-ochre-50 hover:border-ochre-500"
      : "border-stone-300 bg-stone-50 hover:border-stone-500";
  const iconWrap =
    tone === "ochre"
      ? "bg-ochre-600 text-white"
      : "bg-stone-900 text-stone-50";
  const ctaColor = tone === "ochre" ? "text-ochre-800" : "text-stone-900";
  return (
    <Link
      href={href}
      className={`flex flex-col gap-3 rounded-2xl border p-5 shadow-sm transition ${toneStyles}`}
    >
      <span
        className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${iconWrap}`}
      >
        {icon}
      </span>
      <div>
        <h3 className="t-h3">{title}</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-stone-600">{body}</p>
      </div>
      <span className={`mt-auto text-sm font-medium ${ctaColor}`}>{cta} →</span>
    </Link>
  );
}

function hostOf(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
}
