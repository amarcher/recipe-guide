"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, Loader2 } from "lucide-react";
import {
  AMAZON_FRESH_DEEPLINK_ITEM_CAP,
  GROCERY_VENDORS,
  clipboardList,
  composeQuery,
  type ExportItem,
} from "@/app/lib/grocery-vendors";

// Roadmap items 3.1 + 3.2 — single-button deeplink export. v1 is wired
// to AmazonFresh; the adapter abstraction (`grocery-vendors.ts`) keeps
// Instacart / Walmart one boolean flip away.
//
// UX shape: opens the deeplink in a new tab with the first ~5 items as
// the search query (Amazon's relevance ranking handles the leading match),
// and copies the FULL list to the clipboard so the user can paste-add the
// remaining items into Amazon's search bar without losing anything.

type Status = "idle" | "exporting" | "exported" | "error";

export function GroceryExportButton({
  planId,
  items,
}: {
  planId: string;
  items: ExportItem[];
}) {
  const [status, setStatus] = useState<Status>("idle");

  if (items.length === 0) return null;

  const vendor = GROCERY_VENDORS.amazonFresh;
  const { usedCount } = composeQuery(items);
  const remaining = Math.max(0, items.length - usedCount);

  async function exportNow() {
    setStatus("exporting");
    const url = vendor.deeplink(items);

    // Open the deeplink first so the click counts as a user gesture for
    // popup blockers; the network log + clipboard write follow.
    const tab = typeof window !== "undefined" ? window.open(url, "_blank", "noopener,noreferrer") : null;

    let copied = false;
    if (remaining > 0 && typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(clipboardList(items));
        copied = true;
      } catch {
        copied = false;
      }
    }

    try {
      await fetch(`/api/plans/${planId}/grocery/export`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vendor: vendor.id, itemCount: items.length }),
      });
    } catch {
      // Logging is best-effort; the deeplink already opened.
    }

    setStatus(tab || copied ? "exported" : "error");
    setTimeout(() => setStatus("idle"), 4000);
  }

  return (
    <section className="mt-6 rounded-xl border border-stone-200 bg-white p-4 text-sm">
      <header className="flex items-center justify-between gap-2">
        <h3 className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-500">
          <ExternalLink className="h-3.5 w-3.5" />
          Order online
        </h3>
        <button
          type="button"
          onClick={exportNow}
          disabled={status === "exporting"}
          className="inline-flex items-center gap-1.5 rounded-md bg-stone-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-stone-800 disabled:opacity-50"
        >
          {status === "exporting" ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : status === "exported" ? (
            <Check className="h-3 w-3" />
          ) : (
            <ExternalLink className="h-3 w-3" />
          )}
          Order on {vendor.label} →
        </button>
      </header>
      <p className="mt-1 text-xs text-stone-500">
        {remaining > 0 ? (
          <>
            Opens {vendor.label} prefilled with the first{" "}
            {Math.min(usedCount, AMAZON_FRESH_DEEPLINK_ITEM_CAP)} items. The full
            list is copied to your clipboard — paste it into Amazon&apos;s
            search to add the other {remaining}.
          </>
        ) : (
          <>Opens {vendor.label} prefilled with all {items.length} items.</>
        )}
      </p>
      {status === "exported" && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-emerald-700">
          <Copy className="h-3 w-3" />
          {remaining > 0
            ? "Full list copied to your clipboard."
            : "Tab opened — finish in Amazon."}
        </p>
      )}
      {status === "error" && (
        <p className="mt-2 text-[11px] text-rose-700">
          Couldn&apos;t open the link — check your popup blocker and try again.
        </p>
      )}
    </section>
  );
}
