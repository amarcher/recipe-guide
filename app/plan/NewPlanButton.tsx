"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Flame, Plus, RefreshCw } from "lucide-react";

// Roadmap item 1.11 — three weekly modes (caretaker memory). Pre-selecting
// one removes the first awkward intake turn ("what's the vibe?") and steers
// the chat opener so the conversation starts already calibrated. URL-only —
// no schema column. The mode is forwarded as `?mode=` to /plan/[id]/intake;
// IntakeChat reads it and customizes its first assistant bubble.
//
// The picker also forks on plan scope: "just tonight" creates a
// TONIGHT-scoped plan (short intake, one dinner, cook from what's on hand)
// and skips the weekly-mode question entirely.

type Mode = "USE_UP" | "EXPLORE" | "SURVIVAL";

const MODE_OPTIONS: Array<{
  mode: Mode;
  label: string;
  blurb: string;
}> = [
  {
    mode: "USE_UP",
    label: "Use up the kitchen",
    blurb: "The fridge is stacked. Build the week around what's already here.",
  },
  {
    mode: "EXPLORE",
    label: "Try something new",
    blurb: "Energy and curiosity to spare. Stretch a little.",
  },
  {
    mode: "SURVIVAL",
    label: "Just survive",
    blurb: "Feed everyone with the least friction. Repeats are fine.",
  },
];

export function NewPlanButton({
  variant = "primary",
}: {
  variant?: "primary" | "compact";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);

  async function startPlan(scope: "WEEK" | "TONIGHT", mode: Mode | null) {
    setBusy(true);
    setPicking(false);
    try {
      const r = await fetch("/api/plans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      if (!r.ok) throw new Error("failed");
      const { id } = (await r.json()) as { id: string };
      const qs = mode ? `?mode=${mode}` : "";
      router.push(`/plan/${id}/intake${qs}`);
    } catch {
      setBusy(false);
    }
  }

  function openPicker() {
    if (busy) return;
    setPicking(true);
  }

  const buttonClass =
    variant === "compact"
      ? "inline-flex items-center gap-1.5 rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-stone-800 disabled:opacity-60"
      : "inline-flex items-center gap-2 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800 disabled:opacity-60";

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        disabled={busy}
        className={buttonClass}
      >
        {busy ? (
          <RefreshCw className={variant === "compact" ? "h-3 w-3 animate-spin" : "h-4 w-4 animate-spin"} />
        ) : (
          <Plus className={variant === "compact" ? "h-4 w-4" : "h-4 w-4"} />
        )}
        {variant === "compact" ? "New plan" : busy ? "Starting…" : "Start a new plan"}
      </button>

      {picking && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/40 p-4 sm:items-center"
          onClick={() => setPicking(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-stone-50 p-5 shadow-xl ring-1 ring-stone-200"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[11px] uppercase tracking-wider text-stone-400">
              What are we planning?
            </p>
            <h2 className="mt-1 font-serif text-2xl font-medium tracking-tight text-stone-900">
              Tonight, or the whole week?
            </h2>

            <button
              type="button"
              onClick={() => void startPlan("TONIGHT", null)}
              className="mt-4 flex w-full flex-col items-start rounded-xl border border-amber-300 bg-amber-50/70 p-3 text-left transition hover:border-amber-500 hover:shadow-sm"
            >
              <span className="inline-flex items-center gap-1.5 font-serif text-base font-medium text-stone-900">
                <Flame className="h-4 w-4 text-amber-700" />
                Just tonight
              </span>
              <span className="mt-0.5 text-[13px] italic text-stone-600">
                Tell me what&apos;s on hand, get a few dishes to pick from, cook.
              </span>
            </button>

            <p className="mt-4 text-[11px] uppercase tracking-wider text-stone-400">
              Or plan the week — what kind of week?
            </p>
            <div className="mt-2 flex flex-col gap-2">
              {MODE_OPTIONS.map((m) => (
                <button
                  key={m.mode}
                  type="button"
                  onClick={() => void startPlan("WEEK", m.mode)}
                  className="group flex flex-col items-start rounded-xl border border-stone-200 bg-white p-3 text-left transition hover:border-stone-400 hover:shadow-sm"
                >
                  <span className="font-serif text-base font-medium text-stone-900">
                    {m.label}
                  </span>
                  <span className="mt-0.5 text-[13px] italic text-stone-600">
                    {m.blurb}
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => void startPlan("WEEK", null)}
                className="text-sm font-medium text-stone-500 hover:text-stone-800"
              >
                Skip — figure it out in the chat
              </button>
              <button
                type="button"
                onClick={() => setPicking(false)}
                className="text-sm font-medium text-stone-500 hover:text-stone-800"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
