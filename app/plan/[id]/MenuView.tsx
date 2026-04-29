"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Clock, Users, Baby, Wand2, RefreshCw, X, Flame } from "lucide-react";
import { discoverSprites } from "@/app/lib/sprites";
import { refreshSavedRecipes } from "@/app/lib/storage";
import { MealFace, type MealFaceSubject } from "@/app/components/MealFace";

type Candidate = {
  id: string;
  slot: "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK";
  eaters: Array<"ADULTS" | "KIDS">;
  title: string;
  summary: string;
  rationale: string;
  heroIngredientSlugs: string[];
  approxCookMinutes: number;
  kidFitTag: "RELIABLE" | "STRETCH" | "NEW";
  moodTags: string[];
  rank: number | null;
  badges: string[];
  committed: boolean;
  plannedMealId: string | null;
};

type Group = {
  key: string;
  slot: Candidate["slot"];
  eaters: Array<"ADULTS" | "KIDS">;
  candidates: Candidate[];
};

const SLOT_ORDER: Record<Candidate["slot"], number> = {
  BREAKFAST: 0,
  LUNCH: 1,
  DINNER: 2,
  SNACK: 3,
};

const SLOT_LABEL: Record<Candidate["slot"], string> = {
  BREAKFAST: "Breakfast",
  LUNCH: "Lunch",
  DINNER: "Dinner",
  SNACK: "Snacks",
};

// Mood tags are the single eyebrow signal per the visual-design lens.
// Candidate.moodTags is a ranked list (computed in scoring.ts); we render
// only the first. Badges remain in the data but no longer paint the tile —
// they may resurface in a peek sheet later (item 1.9 follow-up).
function pickMoodTag(c: Candidate): string | null {
  return c.moodTags?.[0] ?? null;
}

function groupCandidates(candidates: Candidate[]): Group[] {
  const byKey = new Map<string, Group>();
  for (const c of candidates) {
    const eaterKey = [...c.eaters].sort().join("+");
    const key = `${c.slot}:${eaterKey}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.candidates.push(c);
    } else {
      byKey.set(key, { key, slot: c.slot, eaters: c.eaters, candidates: [c] });
    }
  }
  return [...byKey.values()].sort((a, b) => {
    if (SLOT_ORDER[a.slot] !== SLOT_ORDER[b.slot]) {
      return SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot];
    }
    return eaterRank(a.eaters) - eaterRank(b.eaters);
  });
}

function eaterRank(eaters: Array<"ADULTS" | "KIDS">): number {
  if (eaters.length === 2) return 0;
  if (eaters[0] === "ADULTS") return 1;
  return 2;
}

function eaterLabel(eaters: Array<"ADULTS" | "KIDS">): string {
  if (eaters.length === 2) return "Adults + kids";
  return eaters[0] === "ADULTS" ? "Adults" : "Kids";
}

function EaterIcon({ eaters }: { eaters: Array<"ADULTS" | "KIDS"> }) {
  if (eaters.includes("KIDS") && !eaters.includes("ADULTS")) {
    return <Baby className="h-3.5 w-3.5" aria-hidden />;
  }
  return <Users className="h-3.5 w-3.5" aria-hidden />;
}

export function MenuView({
  planId,
  candidates,
}: {
  planId: string;
  candidates: Candidate[];
}) {
  const groups = groupCandidates(candidates);
  const committedCount = candidates.filter((c) => c.committed).length;

  useEffect(() => {
    const names = new Set<string>();
    for (const c of candidates) {
      for (const slug of c.heroIngredientSlugs) {
        names.add(slug.replace(/-/g, " "));
      }
    }
    if (names.size) void discoverSprites([...names]);
  }, [candidates]);

  const committed = candidates.filter((c) => c.committed);

  return (
    <div>
      {committed.length > 0 && (
        <QueueView planId={planId} committed={committed} />
      )}

      <div className="mb-5 flex items-baseline justify-between text-sm text-stone-600">
        <span>
          {committedCount} of {candidates.length} picked
        </span>
        <span className="text-xs text-stone-400">
          Tap to pick; tap again to remove.
        </span>
      </div>

      <div className="space-y-8">
        {groups.map((g) => (
          <SectionView key={g.key} planId={planId} group={g} />
        ))}
      </div>
    </div>
  );
}

function QueueView({
  planId,
  committed,
}: {
  planId: string;
  committed: Candidate[];
}) {
  return (
    <section className="mb-8 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4">
      <header className="mb-3 flex items-baseline justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold text-emerald-950">
          <Flame className="h-4 w-4 text-emerald-700" />
          Queued for the week
        </h2>
        <span className="text-xs tabular-nums text-emerald-800">
          {committed.length} meal{committed.length === 1 ? "" : "s"} ready
        </span>
      </header>
      <ul className="grid gap-2 sm:grid-cols-2">
        {committed.map((c) => (
          <QueueRow key={c.id} planId={planId} candidate={c} />
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-emerald-800/80">
        Tap Cook on the night of — drops you into the existing step-by-step guide.
      </p>
    </section>
  );
}

function QueueRow({
  planId,
  candidate,
}: {
  planId: string;
  candidate: Candidate;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onCook() {
    if (!candidate.plannedMealId) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/plans/${planId}/meals/${candidate.plannedMealId}/cook`,
        { method: "POST" }
      );
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error ?? r.statusText);
      }
      const body = (await r.json()) as { savedRecipeId: string };
      await refreshSavedRecipes();
      router.push(`/recipe/${body.savedRecipeId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
      setBusy(false);
    }
  }

  return (
    <li className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-white p-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-stone-900">
          {candidate.title}
        </p>
        <p className="flex items-center gap-2 text-xs text-stone-500">
          <span className="inline-flex items-center gap-1">
            <EaterIcon eaters={candidate.eaters} />
            {eaterLabel(candidate.eaters)}
          </span>
          <span>·</span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {candidate.approxCookMinutes} min
          </span>
        </p>
        {error && (
          <p className="mt-1 text-[11px] text-rose-700">{error}</p>
        )}
      </div>
      <button
        type="button"
        onClick={onCook}
        disabled={busy}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:opacity-60"
      >
        {busy ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Flame className="h-3 w-3" />}
        {busy ? "Opening…" : "Cook"}
      </button>
    </li>
  );
}

function SectionView({ planId, group }: { planId: string; group: Group }) {
  const router = useRouter();
  const committed = group.candidates.filter((c) => c.committed).length;
  const kidOnly = group.eaters.length === 1 && group.eaters[0] === "KIDS";
  const [tuning, setTuning] = useState(false);
  const [guidance, setGuidance] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const outerClass = kidOnly
    ? "rounded-2xl bg-amber-50/70 p-4 ring-1 ring-amber-200"
    : "";
  const titleClass = kidOnly ? "text-amber-950" : "text-stone-900";
  const chipClass = kidOnly
    ? "bg-amber-100 text-amber-900 ring-1 ring-amber-200"
    : "bg-stone-100 text-stone-600";
  const counterClass = kidOnly ? "text-amber-800" : "text-stone-500";

  async function tuneSection() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/plans/${planId}/candidates`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slot: group.slot,
          eaters: group.eaters,
          guidance: guidance.trim() || undefined,
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error ?? r.statusText);
      }
      setGuidance("");
      setTuning(false);
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "tune failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={outerClass}>
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2
          className={`flex flex-wrap items-center gap-2 text-base font-semibold ${titleClass}`}
        >
          {SLOT_LABEL[group.slot]}
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-normal ${chipClass}`}
          >
            <EaterIcon eaters={group.eaters} />
            {eaterLabel(group.eaters)}
          </span>
          <span className={`text-xs font-normal tabular-nums ${counterClass}`}>
            {committed} of {group.candidates.length} picked
          </span>
        </h2>
        <button
          type="button"
          onClick={() => setTuning((v) => !v)}
          className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition ${
            kidOnly
              ? "border-amber-300 bg-white/60 text-amber-900 hover:bg-white"
              : "border-stone-300 bg-white text-stone-700 hover:border-stone-500"
          }`}
          aria-label="Tune this section"
        >
          {tuning ? <X className="h-3 w-3" /> : <Wand2 className="h-3 w-3" />}
          {tuning ? "Cancel" : "Tune this section"}
        </button>
      </header>

      {tuning && (
        <div className="mb-3 flex flex-col gap-2 rounded-lg border border-stone-200 bg-white/80 p-3 sm:flex-row sm:items-center">
          <input
            type="text"
            value={guidance}
            onChange={(e) => setGuidance(e.target.value)}
            disabled={busy}
            placeholder="e.g. swap the turkey options for something with fish"
            className="flex-1 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-900 focus:border-stone-500 focus:outline-none disabled:opacity-50"
          />
          <button
            type="button"
            onClick={tuneSection}
            disabled={busy}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-stone-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-stone-800 disabled:opacity-50"
          >
            {busy ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
            {busy ? "Tuning…" : guidance.trim() ? "Apply guidance" : "Regenerate section"}
          </button>
          {error && (
            <span className="w-full text-xs text-rose-700 sm:w-auto">{error}</span>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {group.candidates.map((c) => (
          <CandidateCard
            key={c.id}
            planId={planId}
            candidate={c}
            kidOnly={kidOnly}
          />
        ))}
      </div>
    </section>
  );
}

function CandidateCard({
  planId,
  candidate: c,
  kidOnly,
}: {
  planId: string;
  candidate: Candidate;
  kidOnly: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [optimisticCommitted, setOptimisticCommitted] = useState<boolean | null>(null);
  const committed = optimisticCommitted ?? c.committed;

  async function toggle() {
    const next = !committed;
    setOptimisticCommitted(next);
    try {
      if (next) {
        const r = await fetch(`/api/plans/${planId}/meals`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ candidateId: c.id }),
        });
        if (!r.ok) throw new Error("commit failed");
      } else if (c.plannedMealId) {
        const r = await fetch(
          `/api/plans/${planId}/meals/${c.plannedMealId}`,
          { method: "DELETE" }
        );
        if (!r.ok) throw new Error("uncommit failed");
      }
      startTransition(() => {
        router.refresh();
        setOptimisticCommitted(null);
      });
    } catch {
      setOptimisticCommitted(null);
    }
  }

  const cardClass = committed
    ? "border-emerald-300 ring-1 ring-emerald-300/50"
    : kidOnly
    ? "border-amber-200 hover:border-amber-400"
    : "border-stone-200 hover:border-stone-300";

  // Roadmap item 1.9 — every candidate gets a face. Vignette mode (rotated
  // hero sprites on a colored wash) is the default; once item 1.13's
  // transparent sprites land the same composition reads as ingredients on
  // cream paper. Summary is repurposed as the tagline (one evocative line);
  // moodTag is the single eyebrow signal. Rationale and the badge soup
  // recede — they may resurface in a peek sheet later.
  const subject: MealFaceSubject = {
    id: c.id,
    title: c.title,
    tagline: c.summary,
    heroIngredientSlugs: c.heroIngredientSlugs,
    moodTag: pickMoodTag(c),
  };

  return (
    <article
      className={`group relative flex flex-col overflow-hidden rounded-xl border bg-stone-50 shadow-sm transition ${cardClass}`}
    >
      <MealFace subject={subject} size="tile" className="rounded-none" />

      <div className="flex items-center justify-between gap-3 border-t border-stone-100 px-4 py-2.5 text-xs text-stone-500">
        <span className="inline-flex shrink-0 items-center gap-1">
          <Clock className="h-3 w-3" />
          {c.approxCookMinutes} min
        </span>
        <span className="inline-flex items-center gap-1">
          <EaterIcon eaters={c.eaters} />
          {eaterLabel(c.eaters)}
        </span>
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          aria-label={committed ? "Remove from menu" : "Add to menu"}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition disabled:opacity-60 ${
            committed
              ? "bg-emerald-600 text-white hover:bg-emerald-700"
              : "border border-stone-300 bg-white text-stone-600 hover:border-stone-900 hover:text-stone-900"
          }`}
        >
          {committed ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        </button>
      </div>
    </article>
  );
}
