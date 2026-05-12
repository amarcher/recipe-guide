"use client";

import { useEffect } from "react";
import { Check, Clock, Plus, Users, Baby, X, Sparkles } from "lucide-react";
import { Sprite } from "@/app/components/Sprite";
import { StepIcon } from "@/app/components/StepIcon";
import { MealFace, type MealFaceSubject } from "@/app/components/MealFace";
import { buildMise, formatMiseQuantity } from "@/app/lib/aggregate";
import type { CookCard } from "@/app/types";

export type PeekCandidate = {
  id: string;
  title: string;
  summary: string;
  rationale: string;
  heroIngredientSlugs: string[];
  generatedDishImageUrl: string | null;
  card: CookCard | null;
  approxCookMinutes: number;
  eaters: Array<"ADULTS" | "KIDS">;
  moodTag: string | null;
  committed: boolean;
  pending: boolean;
};

export function CandidatePeekSheet({
  candidate,
  onClose,
  onToggle,
}: {
  candidate: PeekCandidate;
  onClose: () => void;
  onToggle: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const card = candidate.card;
  const mise = card ? buildMise(card, 1) : [];
  const steps = card?.steps ?? [];

  const subject: MealFaceSubject = {
    id: candidate.id,
    title: candidate.title,
    tagline: candidate.summary,
    generatedDishImageUrl: candidate.generatedDishImageUrl,
    heroIngredientSlugs: candidate.heroIngredientSlugs,
    moodTag: candidate.moodTag,
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Preview ${candidate.title}`}
    >
      <button
        type="button"
        aria-label="Close preview"
        onClick={onClose}
        className="absolute inset-0 bg-stone-900/50 backdrop-blur-sm"
      />

      <div
        className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-stone-50 shadow-2xl sm:max-h-[88vh] sm:max-w-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative shrink-0">
          <MealFace
            subject={subject}
            size="peek"
            showCaption={false}
            className="rounded-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-stone-900/55 text-white backdrop-blur transition hover:bg-stone-900/75"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <header className="mb-4">
            {candidate.moodTag && (
              <span
                className="font-serif italic"
                style={{
                  fontSize: "10.5px",
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: "#8a6a2a",
                }}
              >
                {candidate.moodTag.replace(/_/g, " · ")}
              </span>
            )}
            <h2 className="mt-1 font-serif text-[24px] font-medium leading-tight tracking-tight text-stone-900">
              {candidate.title}
            </h2>
            {candidate.summary && (
              <p className="mt-1.5 font-serif text-[15px] italic leading-snug text-stone-600">
                {candidate.summary}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-stone-500">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {candidate.approxCookMinutes} min
              </span>
              <span className="inline-flex items-center gap-1">
                {candidate.eaters.includes("KIDS") &&
                !candidate.eaters.includes("ADULTS") ? (
                  <Baby className="h-3 w-3" />
                ) : (
                  <Users className="h-3 w-3" />
                )}
                {eaterLabel(candidate.eaters)}
              </span>
              {candidate.generatedDishImageUrl && (
                <span
                  className="inline-flex items-center gap-1 text-stone-400"
                  title="AI-generated mockup of the dish"
                >
                  <Sparkles className="h-3 w-3" />
                  Mockup
                </span>
              )}
            </div>
          </header>

          {candidate.rationale && (
            <section className="mb-5 rounded-xl border border-amber-200 bg-amber-50/60 p-3.5">
              <p className="text-[13px] leading-relaxed text-stone-800">
                {candidate.rationale}
              </p>
            </section>
          )}

          {mise.length > 0 && (
            <section className="mb-5">
              <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-stone-500">
                Ingredients
              </h3>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {mise.map((entry) => (
                  <li
                    key={entry.key}
                    className="flex items-center gap-2 rounded-md bg-white px-2 py-1.5 ring-1 ring-stone-200"
                  >
                    <Sprite name={entry.slug ?? entry.item} size={24} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-stone-900">
                        {entry.item}
                      </p>
                      <p className="truncate text-[11px] text-stone-500">
                        {formatMiseQuantity(entry)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {steps.length > 0 && (
            <section className="mb-2">
              <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-stone-500">
                Steps
              </h3>
              <ol className="space-y-2">
                {steps.map((step) => (
                  <li
                    key={step.number}
                    className="flex gap-3 rounded-md bg-white p-3 ring-1 ring-stone-200"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-600">
                      <StepIcon name={step.icon} className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-stone-900">
                        {step.headline}
                      </p>
                      <p className="mt-0.5 text-[13px] leading-snug text-stone-600">
                        {step.action}
                      </p>
                      {step.duration && (
                        <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-stone-500">
                          <Clock className="h-3 w-3" />
                          {step.duration}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {!card && (
            <p className="text-sm text-stone-500">
              Recipe details aren&apos;t available for this candidate yet.
            </p>
          )}
        </div>

        <div className="shrink-0 border-t border-stone-200 bg-stone-50 px-5 py-3 sm:px-6">
          <button
            type="button"
            onClick={onToggle}
            disabled={candidate.pending}
            className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition disabled:opacity-60 ${
              candidate.committed
                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                : "bg-stone-900 text-white hover:bg-stone-800"
            }`}
          >
            {candidate.committed ? (
              <>
                <Check className="h-4 w-4" />
                Picked — remove from menu
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                Pick this meal
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function eaterLabel(eaters: Array<"ADULTS" | "KIDS">): string {
  if (eaters.length === 2) return "Adults + kids";
  return eaters[0] === "ADULTS" ? "Adults" : "Kids";
}
