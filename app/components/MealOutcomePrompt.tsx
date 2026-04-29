"use client";

import { useState } from "react";
import { Check, Loader2, ThumbsDown, ThumbsUp, UtensilsCrossed, X } from "lucide-react";

// Roadmap item 2.15 — post-cook 5-second per-eater thumbs prompt.
//
// Slots into the post-cook moment alongside CookPhotoPrompt; not inside
// CookCardView. Adult + Kid are independent rows because the household
// answer is rarely uniform — the kids might refuse the dish the adults
// loved.
//
// Skippable, default-collapsed; a single "same as last time" tap fires both
// rows with their previous verdict (TODO: wire to last MealOutcome lookup).

type Verdict = "ATE" | "PICKED" | "REFUSED";
type Role = "ADULT" | "KID";

const VERDICT_LABEL: Record<Verdict, string> = {
  ATE: "Loved it",
  PICKED: "Picked at it",
  REFUSED: "Refused",
};

export function MealOutcomePrompt({
  planId,
  mealId,
  onComplete,
  onDismiss,
}: {
  planId: string;
  mealId: string;
  onComplete?: () => void;
  onDismiss: () => void;
}) {
  const [adult, setAdult] = useState<Verdict | null>(null);
  const [kid, setKid] = useState<Verdict | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!adult && !kid) return;
    setBusy(true);
    setError(null);
    const entries: Array<{ eaterRole: Role; verdict: Verdict }> = [];
    if (adult) entries.push({ eaterRole: "ADULT", verdict: adult });
    if (kid) entries.push({ eaterRole: "KID", verdict: kid });
    try {
      const r = await fetch(
        `/api/plans/${planId}/meals/${mealId}/outcomes`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entries }),
        },
      );
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error ?? r.statusText);
      }
      setDone(true);
      onComplete?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "save failed");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-sm text-emerald-900">
        <Check className="h-4 w-4" />
        <span>Thanks — the planner just learned something.</span>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 font-semibold text-stone-800">
          <UtensilsCrossed className="h-3.5 w-3.5" />
          How did it land?
        </span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="rounded-md p-1 text-stone-500 hover:bg-stone-200 hover:text-stone-900"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <p className="mb-3 text-xs text-stone-500">
        Two taps and the planner knows what to bring back next week.
      </p>

      <VerdictRow
        label="Adults"
        value={adult}
        onChange={setAdult}
        disabled={busy}
      />
      <VerdictRow
        label="Kids"
        value={kid}
        onChange={setKid}
        disabled={busy}
      />

      <div className="mt-3 flex items-center justify-end gap-2">
        {error && <span className="text-[11px] text-rose-700">{error}</span>}
        <button
          type="button"
          onClick={submit}
          disabled={busy || (!adult && !kid)}
          className="inline-flex items-center gap-1.5 rounded-md bg-stone-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-800 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

function VerdictRow({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: "ATE" | "PICKED" | "REFUSED" | null;
  onChange: (v: Verdict) => void;
  disabled: boolean;
}) {
  return (
    <div className="mt-2 flex items-center gap-2">
      <span className="w-16 shrink-0 text-xs font-medium text-stone-600">
        {label}
      </span>
      <div className="flex flex-1 gap-1.5">
        <Pill
          active={value === "ATE"}
          onClick={() => onChange("ATE")}
          icon={<ThumbsUp className="h-3 w-3" />}
          label={VERDICT_LABEL.ATE}
          disabled={disabled}
        />
        <Pill
          active={value === "PICKED"}
          onClick={() => onChange("PICKED")}
          icon={<UtensilsCrossed className="h-3 w-3" />}
          label={VERDICT_LABEL.PICKED}
          disabled={disabled}
        />
        <Pill
          active={value === "REFUSED"}
          onClick={() => onChange("REFUSED")}
          icon={<ThumbsDown className="h-3 w-3" />}
          label={VERDICT_LABEL.REFUSED}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

function Pill({
  active,
  onClick,
  icon,
  label,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex flex-1 items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-[11px] font-medium transition disabled:opacity-50 ${
        active
          ? "border-emerald-400 bg-emerald-50 text-emerald-900"
          : "border-stone-300 bg-white text-stone-700 hover:border-stone-500"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
