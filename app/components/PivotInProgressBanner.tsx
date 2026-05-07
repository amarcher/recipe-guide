"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { decidePivot } from "@/app/lib/storage";
import { useConfirm } from "@/app/components/ConfirmDialog";
import type { PivotMetaClient } from "@/app/lib/pivot/meta";

// Always-on banner for pivot SavedRecipes that haven't been kept yet.
// Surfaces the chef's narrative + the cook's original problem report,
// and asks them to decide before the row clutters their library forever.
export function PivotInProgressBanner({
  savedRecipeId,
  pivotMeta,
}: {
  savedRecipeId: string;
  pivotMeta: PivotMetaClient;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, setPending] = useState<"keep" | "discard" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onKeep() {
    setPending("keep");
    setError(null);
    const ok = await decidePivot(savedRecipeId, "keep");
    setPending(null);
    if (!ok) {
      setError("couldn't save — try again?");
      return;
    }
    router.refresh();
  }

  async function onDiscard() {
    const ok = await confirm({
      title: "Discard this pivot?",
      message: (
        <>
          The fix and your cook progress on it will be deleted. The original
          recipe is untouched.
        </>
      ),
      confirmLabel: "Discard",
      tone: "danger",
    });
    if (!ok) return;
    setPending("discard");
    setError(null);
    const success = await decidePivot(savedRecipeId, "discard");
    if (!success) {
      setPending(null);
      setError("couldn't discard — try again?");
      return;
    }
    router.push("/library");
  }

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-4 w-4 flex-none text-amber-700" />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-800">
            Pivot in progress
          </p>
          <p className="mt-1 text-sm leading-relaxed text-amber-950">
            <span className="font-medium">You said:</span> &ldquo;{pivotMeta.problemText}&rdquo;
          </p>
          {pivotMeta.aiNotes && (
            <p className="mt-1 text-sm leading-relaxed text-amber-950">
              <span className="font-medium">Chef&rsquo;s note:</span> {pivotMeta.aiNotes}
            </p>
          )}
          {pivotMeta.changes.length > 0 && (
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[13px] text-amber-900">
              {pivotMeta.changes.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        {error && (
          <span className="mr-auto text-xs text-rose-700">{error}</span>
        )}
        <button
          type="button"
          onClick={onDiscard}
          disabled={pending !== null}
          className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-60"
        >
          {pending === "discard" ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : null}
          Discard
        </button>
        <button
          type="button"
          onClick={onKeep}
          disabled={pending !== null}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          {pending === "keep" ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : null}
          Keep this pivot
        </button>
      </div>
    </div>
  );
}
