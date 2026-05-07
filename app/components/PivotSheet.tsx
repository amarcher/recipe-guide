"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Sparkles, X } from "lucide-react";

type PivotResult = {
  newSavedRecipeId: string;
  aiNotes: string;
  changes: string[];
  newDoneSteps?: number[];
};

const PIVOT_HANDOFF_PREFIX = "cookcard:v1:pivot-handoff:";

type Phase =
  | { kind: "input" }
  | { kind: "loading" }
  | { kind: "result"; data: PivotResult }
  | { kind: "error"; message: string };

export function PivotSheet({
  savedRecipeId,
  doneSteps,
  miseEntryKeys,
  onClose,
}: {
  savedRecipeId: string;
  doneSteps: number[];
  miseEntryKeys: string[];
  onClose: () => void;
}) {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "input" });
  const [problem, setProblem] = useState("");
  const [discardPending, setDiscardPending] = useState(false);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit() {
    const text = problem.trim();
    if (!text) return;
    setPhase({ kind: "loading" });
    try {
      const res = await fetch(`/api/recipes/${savedRecipeId}/pivot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problemText: text,
          doneSteps,
          miseEntryKeys,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const data = (await res.json()) as PivotResult;
      setPhase({ kind: "result", data });
    } catch (e) {
      setPhase({
        kind: "error",
        message: e instanceof Error ? e.message : "Unknown error",
      });
    }
  }

  async function discardAndClose(newSavedRecipeId: string) {
    setDiscardPending(true);
    try {
      // Best-effort: real pivot endpoint creates a fork up-front, so this
      // cleans the library. Stub endpoint creates nothing — DELETE 404s, we
      // ignore.
      if (newSavedRecipeId !== savedRecipeId) {
        await fetch(`/api/recipes/${newSavedRecipeId}`, { method: "DELETE" });
      }
    } catch {
      // ignore — abandoned pivots surface in the library with the badge
    } finally {
      setDiscardPending(false);
      onClose();
    }
  }

  const headerLabel =
    phase.kind === "loading"
      ? "Calling in the chef…"
      : phase.kind === "result"
        ? "Here’s what to do"
        : phase.kind === "error"
          ? "Couldn’t reach the chef"
          : "What went wrong?";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pivot-title"
      className="fixed inset-0 z-50 flex items-end justify-center px-3 py-4 sm:items-center sm:py-6"
    >
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 bg-stone-950/40 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-stone-200 bg-stone-50 shadow-xl">
        <header className="flex items-center justify-between border-b border-stone-200 bg-white px-5 py-3.5">
          <h2
            id="pivot-title"
            className="inline-flex items-center gap-2 font-serif text-lg font-medium tracking-tight text-stone-900"
          >
            <Sparkles className="h-4 w-4 text-amber-600" />
            {headerLabel}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-stone-500 hover:bg-stone-100 hover:text-stone-900"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="px-5 py-4">
          {phase.kind === "input" && (
            <>
              <p className="text-sm leading-snug text-stone-600">
                Tell the chef what happened. We&rsquo;ll factor in the steps
                you&rsquo;ve already done and what&rsquo;s on your counter, then
                adapt the rest of the recipe &mdash; minimally.
              </p>
              <textarea
                ref={textareaRef}
                value={problem}
                onChange={(e) => setProblem(e.target.value)}
                placeholder="e.g. I added too much tomato paste &mdash; the sauce is too acidic"
                rows={4}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void submit();
                  }
                }}
                className="mt-3 w-full resize-none rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              <ContextSummary
                doneSteps={doneSteps}
                miseCount={miseEntryKeys.length}
              />
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!problem.trim()}
                  onClick={() => void submit()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
                >
                  Get help
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </>
          )}

          {phase.kind === "loading" && (
            <div className="flex flex-col items-center gap-3 py-12 text-sm text-stone-600">
              <Loader2 className="h-6 w-6 animate-spin text-amber-700" />
              <p>Reading the recipe and your progress so far&hellip;</p>
            </div>
          )}

          {phase.kind === "result" && (
            <>
              <blockquote className="rounded-lg border border-amber-200 bg-amber-50/80 p-4 text-sm leading-relaxed text-amber-950">
                <Sparkles className="mb-1 mr-1 inline h-3.5 w-3.5 text-amber-700" />
                {phase.data.aiNotes}
              </blockquote>
              {phase.data.changes.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                    What changes
                  </h3>
                  <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-stone-700">
                    {phase.data.changes.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="mt-4 text-[11px] leading-snug text-stone-500">
                We&rsquo;ll save this as a temporary pivot in your library.
                You decide whether to keep it when you finish cooking.
              </p>
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => void discardAndClose(phase.data.newSavedRecipeId)}
                  disabled={discardPending}
                  className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-60"
                >
                  {discardPending ? "Discarding…" : "Discard"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (phase.data.newDoneSteps && phase.data.newDoneSteps.length > 0) {
                      try {
                        sessionStorage.setItem(
                          PIVOT_HANDOFF_PREFIX + phase.data.newSavedRecipeId,
                          JSON.stringify({ doneSteps: phase.data.newDoneSteps })
                        );
                      } catch {}
                    }
                    router.push(`/recipe/${phase.data.newSavedRecipeId}`);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
                >
                  Use this version
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </>
          )}

          {phase.kind === "error" && (
            <>
              <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                {phase.message}
              </p>
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setPhase({ kind: "input" })}
                  className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800"
                >
                  Try again
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ContextSummary({
  doneSteps,
  miseCount,
}: {
  doneSteps: number[];
  miseCount: number;
}) {
  const stepsCount = doneSteps.length;
  if (stepsCount === 0 && miseCount === 0) {
    return (
      <p className="mt-2 text-[11px] leading-snug text-stone-400">
        Nothing checked off yet &mdash; we&rsquo;ll go just on what you tell us.
      </p>
    );
  }
  const parts: string[] = [];
  if (stepsCount > 0) parts.push(`${stepsCount} step${stepsCount === 1 ? "" : "s"} done`);
  if (miseCount > 0) parts.push(`${miseCount} mise item${miseCount === 1 ? "" : "s"} gathered`);
  return (
    <p className="mt-2 text-[11px] leading-snug text-stone-400">
      Factoring in: {parts.join(" · ")}.
    </p>
  );
}
