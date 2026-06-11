"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Replace, Sparkles } from "lucide-react";
import { decidePivot, promotePivot } from "@/app/lib/storage";
import { useConfirm } from "@/app/components/ConfirmDialog";
import type { PivotMetaClient } from "@/app/lib/pivot/meta";

// Decision surface for pivot SavedRecipes. Two states:
//
//   In progress (pivotKept = false) — the post-cook fork the cook hasn't
//   ruled on yet. Three ways out: Discard, Keep as its own copy, or
//   Replace original (fold the fix onto the parent recipe and retire
//   this tile).
//
//   Kept (pivotKept = true) — a quieter panel. The pivot reads as an
//   ordinary recipe now, but as long as its parent still exists we keep
//   offering "Replace original" so a fix that proved itself over a few
//   cooks can still graduate onto the recipe everyone sees.
export function PivotInProgressBanner({
  savedRecipeId,
  pivotMeta,
  pivotKept = false,
  parentRecipeId = null,
}: {
  savedRecipeId: string;
  pivotMeta: PivotMetaClient;
  pivotKept?: boolean;
  parentRecipeId?: string | null;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, setPending] = useState<"keep" | "discard" | "promote" | null>(
    null
  );
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

  async function onPromote() {
    const ok = await confirm({
      title: "Replace the original recipe?",
      message: (
        <>
          The original becomes this fixed version — anyone who can see it sees
          the fix. Your cook history moves over and this copy folds back in,
          so you&rsquo;re left with one recipe. You can undo from the original
          with &ldquo;Reset to original&rdquo;.
        </>
      ),
      confirmLabel: "Replace original",
      tone: "primary",
    });
    if (!ok) return;
    setPending("promote");
    setError(null);
    const res = await promotePivot(savedRecipeId);
    if ("error" in res) {
      setPending(null);
      setError(res.error);
      return;
    }
    router.push(`/recipe/${res.parentId}`);
  }

  if (pivotKept && !parentRecipeId) return null;

  if (pivotKept) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-4 w-4 flex-none text-emerald-700" />
            <p className="text-sm leading-relaxed text-emerald-950">
              <span className="font-medium">Your kept fix</span>
              {" for “"}
              {pivotMeta.problemText}
              {"”. Happy with it? Fold it into "}
              <Link
                href={`/recipe/${parentRecipeId}`}
                className="font-medium underline decoration-emerald-400 underline-offset-2 hover:text-emerald-800"
              >
                the original
              </Link>{" "}
              so it shows up everywhere.
            </p>
          </div>
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <button
              type="button"
              onClick={onPromote}
              disabled={pending !== null}
              className="inline-flex flex-none items-center gap-1.5 self-start rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-60 sm:self-auto"
            >
              {pending === "promote" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Replace className="h-3 w-3" />
              )}
              Replace original
            </button>
            {error && <span className="text-xs text-rose-700">{error}</span>}
          </div>
        </div>
      </div>
    );
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
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-700 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-50 disabled:opacity-60"
        >
          {pending === "keep" ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : null}
          Keep as a copy
        </button>
        {parentRecipeId && (
          <button
            type="button"
            onClick={onPromote}
            disabled={pending !== null}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
          >
            {pending === "promote" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Replace className="h-3 w-3" />
            )}
            Replace original
          </button>
        )}
      </div>
    </div>
  );
}
