"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  Globe,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";

// Roadmap item 2.17 — publish/revoke controls for the Hosted Menu.
// Visibility per decision #2 is PUBLIC-BY-TOKEN: anyone with the URL can
// see the menu. The publish action is explicit (button), revocation
// invalidates the slug forever (decision #2: don't reuse).

export function PublishControls({
  planId,
  publishedSlug,
  publishedAt,
  hostNote: initialHostNote,
  dietaryNote: initialDietaryNote,
  hasCommittedMeals,
}: {
  planId: string;
  publishedSlug: string | null;
  publishedAt: number | null;
  hostNote: string | null;
  dietaryNote: string | null;
  hasCommittedMeals: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [hostNote, setHostNote] = useState(initialHostNote ?? "");
  const [dietaryNote, setDietaryNote] = useState(initialDietaryNote ?? "");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const url = publishedSlug
    ? typeof window !== "undefined"
      ? `${window.location.origin}/menu/${publishedSlug}`
      : `/menu/${publishedSlug}`
    : null;

  async function publish() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/plans/${planId}/publish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          hostNote: hostNote.trim() || undefined,
          dietaryNote: dietaryNote.trim() || undefined,
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error ?? r.statusText);
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "publish failed");
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!confirm("Revoke this menu link? The slug is not reusable.")) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/plans/${planId}/publish`, {
        method: "DELETE",
      });
      if (!r.ok) throw new Error(`${r.status}`);
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "revoke failed");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2400);
    } catch {}
  }

  if (!hasCommittedMeals && !publishedSlug) return null;

  if (publishedSlug) {
    return (
      <section className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-900">
            <Globe className="h-4 w-4" />
            Hosted menu live
          </h2>
          {publishedAt && (
            <span className="text-[11px] text-emerald-800/80">
              published {new Date(publishedAt).toLocaleDateString()}
            </span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <a
            href={url ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-white px-2.5 py-1.5 font-medium text-emerald-900 hover:border-emerald-500"
          >
            View public menu
          </a>
          <button
            type="button"
            onClick={copyLink}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-medium transition ${
              copied
                ? "border-emerald-300 bg-white text-emerald-900"
                : "border-stone-300 bg-white text-stone-700 hover:border-stone-500"
            }`}
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied" : "Copy link"}
          </button>
          <button
            type="button"
            onClick={publish}
            disabled={busy}
            title="Refresh the snapshot from current candidates"
            className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-2.5 py-1.5 font-medium text-stone-700 transition hover:border-stone-500 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Refresh
          </button>
          <button
            type="button"
            onClick={revoke}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md border border-rose-300 bg-white px-2.5 py-1.5 font-medium text-rose-800 transition hover:bg-rose-50 disabled:opacity-60"
          >
            <Trash2 className="h-3 w-3" />
            Revoke
          </button>
        </div>
        {error && (
          <p className="mt-2 text-[11px] text-rose-700">{error}</p>
        )}
      </section>
    );
  }

  return (
    <section className="mb-6 rounded-xl border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-stone-900">
            <Globe className="h-4 w-4 text-stone-500" />
            Publish as a hosted menu
          </h2>
          <p className="mt-1 text-xs text-stone-500">
            Anyone with the URL can read the menu. No accounts required.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition hover:border-stone-500"
        >
          {open ? "Cancel" : "Publish…"}
        </button>
      </div>
      {open && (
        <div className="mt-3 space-y-2">
          <label className="block text-xs">
            <span className="font-medium text-stone-700">
              Host note (optional)
            </span>
            <textarea
              value={hostNote}
              onChange={(e) => setHostNote(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-900 focus:border-stone-500 focus:outline-none"
              placeholder="What's on offer this week, briefly"
            />
          </label>
          <label className="block text-xs">
            <span className="font-medium text-stone-700">
              Dietary note (optional)
            </span>
            <textarea
              value={dietaryNote}
              onChange={(e) => setDietaryNote(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-900 focus:border-stone-500 focus:outline-none"
              placeholder="Allergens, kid-mode, vegetarian options…"
            />
          </label>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={publish}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md bg-stone-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-stone-800 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Globe className="h-3 w-3" />}
              {busy ? "Publishing…" : "Publish menu"}
            </button>
          </div>
          {error && (
            <p className="text-[11px] text-rose-700">{error}</p>
          )}
        </div>
      )}
    </section>
  );
}
