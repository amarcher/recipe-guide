"use client";

import { useState } from "react";
import { Check, Copy, Loader2, Share2 } from "lucide-react";

// Roadmap items 2.20 + 2.21 / decision #1 — post-cook "share this cook"
// chip. Slotted into the SaveBar after the photo prompt; uses the public
// recipe share token (item 2.20). NEVER touches CookCardView. This is the
// approved carve-out from the execution-layer-untouchable rule.

export function ShareCookChip({
  savedRecipeId,
  recipeTitle,
}: {
  savedRecipeId: string;
  cookLogId: string;
  recipeTitle?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onShare() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/recipes/${savedRecipeId}/share-token`, {
        method: "POST",
      });
      if (!r.ok) throw new Error(`share ${r.status}`);
      const body = (await r.json()) as { token: string };
      const url = `${window.location.origin}/r/${body.token}`;
      setShareUrl(url);

      // Try the platform Web Share API first (mobile primary path);
      // fall back to clipboard.
      if (navigator.share) {
        try {
          await navigator.share({
            title: recipeTitle ?? "A recipe I just cooked",
            text: recipeTitle
              ? `Just cooked: ${recipeTitle}`
              : "Just cooked this — take a look",
            url,
          });
        } catch {
          // user cancelled — leave the chip in "url ready" state
        }
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2400);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "share failed");
    } finally {
      setBusy(false);
    }
  }

  async function copyAgain() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2400);
    } catch {}
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-xs">
      <Share2 className="h-3.5 w-3.5 text-stone-500" />
      <span className="flex-1 text-stone-700">
        Share this cook with a friend.
      </span>
      {!shareUrl ? (
        <button
          type="button"
          disabled={busy}
          onClick={onShare}
          className="inline-flex items-center gap-1.5 rounded-md bg-stone-900 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-stone-800 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Share2 className="h-3 w-3" />}
          {busy ? "Creating link…" : "Share"}
        </button>
      ) : (
        <button
          type="button"
          onClick={copyAgain}
          className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[11px] font-medium transition ${
            copied
              ? "border-emerald-300 bg-emerald-50 text-emerald-900"
              : "border-stone-300 bg-white text-stone-700 hover:border-stone-500"
          }`}
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy link"}
        </button>
      )}
      {error && (
        <span className="w-full text-[11px] text-rose-700">{error}</span>
      )}
    </div>
  );
}
