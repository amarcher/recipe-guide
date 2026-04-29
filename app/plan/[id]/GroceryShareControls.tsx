"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, Send, Trash2, Users } from "lucide-react";

// Roadmap item 2.19 — UI for creating + revoking grocery list shares.
// Sits below GroceryList on the planner page when there are items to
// share. Tokens are opaque base64url strings; recipient hits
// /grocery/[token].

type Share = {
  id: string;
  token: string;
  sharedWithEmail: string | null;
  createdAt: number;
  expiresAt: number | null;
};

export function GroceryShareControls({
  planId,
  hasItems,
}: {
  planId: string;
  hasItems: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [shares, setShares] = useState<Share[]>([]);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/plans/${planId}/grocery-share`, {
          cache: "no-store",
        });
        if (!r.ok) return;
        const body = (await r.json()) as { shares: Share[] };
        if (!cancelled) setShares(body.shares);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [planId]);

  async function refresh() {
    try {
      const r = await fetch(`/api/plans/${planId}/grocery-share`, {
        cache: "no-store",
      });
      if (!r.ok) return;
      const body = (await r.json()) as { shares: Share[] };
      setShares(body.shares);
    } catch {}
  }

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/plans/${planId}/grocery-share`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sharedWithEmail: email.trim() || undefined,
          expiresInDays: 7,
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error ?? r.statusText);
      }
      setEmail("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "create failed");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(shareId: string) {
    if (!confirm("Revoke this share? The link will stop working.")) return;
    try {
      await fetch(`/api/plans/${planId}/grocery-share?id=${shareId}`, {
        method: "DELETE",
      });
      await refresh();
      startTransition(() => router.refresh());
    } catch {}
  }

  async function copy(token: string) {
    const url = `${window.location.origin}/grocery/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(token);
      setTimeout(() => setCopiedId((v) => (v === token ? null : v)), 2400);
    } catch {}
  }

  if (!hasItems && shares.length === 0) return null;

  return (
    <section className="mt-6 rounded-xl border border-stone-200 bg-white p-4 text-sm">
      <header className="flex items-center justify-between gap-2">
        <h3 className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-500">
          <Users className="h-3.5 w-3.5" />
          Delegate the shop
        </h3>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-md border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 transition hover:border-stone-500"
        >
          {open ? "Cancel" : "Share list…"}
        </button>
      </header>
      <p className="mt-1 text-xs text-stone-500">
        Send a link — recipient marks items purchased on their phone, and the
        pantry updates here.
      </p>

      {open && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="who's shopping? (optional email)"
            disabled={busy}
            className="flex-1 rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-900 focus:border-stone-500 focus:outline-none disabled:opacity-50"
          />
          <button
            type="button"
            onClick={create}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md bg-stone-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-stone-800 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            Create link
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-[11px] text-rose-700">{error}</p>}

      {shares.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {shares.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center gap-2 rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-xs"
            >
              <span className="flex-1 text-stone-700">
                {s.sharedWithEmail ?? "Anyone with the link"}
                {s.expiresAt && (
                  <span className="ml-2 text-[11px] text-stone-400">
                    expires {new Date(s.expiresAt).toLocaleDateString()}
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => copy(s.token)}
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 transition ${
                  copiedId === s.token
                    ? "border-emerald-300 bg-white text-emerald-900"
                    : "border-stone-300 bg-white text-stone-700 hover:border-stone-500"
                }`}
              >
                {copiedId === s.token ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copiedId === s.token ? "Copied" : "Copy link"}
              </button>
              <button
                type="button"
                onClick={() => revoke(s.id)}
                className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-white px-2 py-1 text-rose-800 transition hover:bg-rose-50"
              >
                <Trash2 className="h-3 w-3" />
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
