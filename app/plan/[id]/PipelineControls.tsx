"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, RefreshCw, AlertCircle, Wand2 } from "lucide-react";

export function PipelineControls({
  planId,
  status,
  hasSkeleton,
}: {
  planId: string;
  status: string;
  hasSkeleton: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "skeleton" | "candidates">(null);
  const [, startTransition] = useTransition();
  const [skeletonGuidance, setSkeletonGuidance] = useState("");
  const [candidatesGuidance, setCandidatesGuidance] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function run(kind: "skeleton" | "candidates") {
    setBusy(kind);
    setError(null);
    try {
      const guidance =
        kind === "skeleton" ? skeletonGuidance.trim() : candidatesGuidance.trim();
      const r = await fetch(`/api/plans/${planId}/${kind}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(guidance ? { guidance } : {}),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error ?? r.statusText);
      }
      if (kind === "skeleton") setSkeletonGuidance("");
      else setCandidatesGuidance("");
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "unknown error");
    } finally {
      setBusy(null);
    }
  }

  const canSkeleton = status === "DRAFT" || status === "INTAKE_COMPLETE" || hasSkeleton;
  const canCandidates = hasSkeleton;

  return (
    <div className="mb-6 rounded-xl border border-stone-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2 text-sm text-stone-600">
        <Sparkles className="h-4 w-4 text-stone-500" />
        <span>Tune the plan</span>
        {error && (
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-rose-700">
            <AlertCircle className="h-3 w-3" />
            {error}
          </span>
        )}
      </div>

      <div className="space-y-3">
        <TuneRow
          label={hasSkeleton ? "Skeleton" : "Skeleton (not yet drafted)"}
          placeholder="e.g. less pasta, more Mediterranean"
          value={skeletonGuidance}
          onChange={setSkeletonGuidance}
          onRun={() => run("skeleton")}
          runLabel={hasSkeleton ? "Tune skeleton" : "Generate skeleton"}
          busy={busy === "skeleton"}
          disabled={!canSkeleton}
        />
        <TuneRow
          label="Candidates (all slots)"
          placeholder={
            canCandidates
              ? "e.g. swap in more veggie options; keep the ones I've saved"
              : "Generate the skeleton first"
          }
          value={candidatesGuidance}
          onChange={setCandidatesGuidance}
          onRun={() => run("candidates")}
          runLabel="Tune candidates"
          busy={busy === "candidates"}
          disabled={!canCandidates}
        />
      </div>
      <p className="mt-3 text-[11px] text-stone-500">
        Committed meals are always preserved. Per-section tune is available on each
        slot below.
      </p>
    </div>
  );
}

function TuneRow({
  label,
  placeholder,
  value,
  onChange,
  onRun,
  runLabel,
  busy,
  disabled,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onRun: () => void;
  runLabel: string;
  busy: boolean;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <label className="shrink-0 text-xs font-medium uppercase tracking-wider text-stone-500 sm:w-40">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || busy}
        placeholder={placeholder}
        className="flex-1 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-900 focus:border-stone-500 focus:outline-none disabled:opacity-50"
      />
      <button
        type="button"
        onClick={onRun}
        disabled={disabled || busy}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-800 transition hover:border-stone-900 disabled:opacity-50"
      >
        {busy ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
        {runLabel}
      </button>
    </div>
  );
}
