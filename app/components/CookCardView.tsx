"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Eye,
  Wrench,
  Flame,
  Timer,
  Users,
  Hourglass,
} from "lucide-react";
import type { CookCard, Ingredient } from "@/app/types";
import { scaleQty, scaleServings } from "@/app/lib/scale";
import { parseMinutesRange } from "@/app/lib/duration";
import { discoverSprites } from "@/app/lib/sprites";
import { Scaler } from "./Scaler";
import { Timeline } from "./Timeline";
import { StepIcon } from "./StepIcon";
import { StepTimer } from "./StepTimer";
import { MisePlace } from "./MisePlace";
import { Sprite } from "./Sprite";

function IngredientLine({ ing, factor }: { ing: Ingredient; factor: number }) {
  const qty = scaleQty(ing.quantity, factor);
  return (
    <li className="flex items-center gap-2 text-sm text-stone-800">
      <Sprite name={ing.item} size={32} />
      <span className="leading-snug">
        {(qty || ing.unit) && (
          <span className="font-semibold tabular-nums text-stone-900">
            {[qty, ing.unit].filter(Boolean).join(" ")}{" "}
          </span>
        )}
        <span>{ing.item}</span>
        {ing.prep && <span className="text-stone-500">, {ing.prep}</span>}
        {ing.note && <span className="text-stone-400"> ({ing.note})</span>}
      </span>
    </li>
  );
}

function MetaPill({
  icon: Icon,
  children,
  tone = "stone",
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  tone?: "stone" | "rose" | "amber" | "emerald";
}) {
  const tones = {
    stone: "bg-stone-100 text-stone-700 ring-stone-200",
    rose: "bg-rose-50 text-rose-800 ring-rose-200",
    amber: "bg-amber-50 text-amber-800 ring-amber-200",
    emerald: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${tones[tone]}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </span>
  );
}

export function CookCardView({ card }: { card: CookCard }) {
  const [factor, setFactor] = useState(1);
  const [doneSteps, setDoneSteps] = useState<Set<number>>(new Set());
  const servings = scaleServings(card.servings, factor);

  const toggleDone = useCallback((n: number) => {
    setDoneSteps((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  }, []);

  const onStepComplete = useCallback((n: number) => {
    setDoneSteps((prev) => new Set(prev).add(n));
    setTimeout(() => {
      document
        .getElementById(`step-${n + 1}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 400);
  }, []);

  // Fire-and-forget: ask the server for sprites we don't have locally. The
  // recipe renders immediately with fallbacks; sprites swap in via the
  // reactive cache as the response arrives.
  useEffect(() => {
    const names = [
      ...card.pantry_ingredients.map((i) => i.item),
      ...card.steps.flatMap((s) => s.ingredients.map((i) => i.item)),
    ];
    discoverSprites(names);
  }, [card]);

  return (
    <article className="mx-auto w-full max-w-3xl space-y-4">
      <header className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <a
          href={card.source_url}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] uppercase tracking-wider text-stone-400 hover:text-stone-700"
        >
          {new URL(card.source_url).hostname.replace(/^www\./, "")}
        </a>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-stone-900">
          {card.title}
        </h1>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {servings && (
            <MetaPill icon={Users}>
              {servings}
              {factor !== 1 && (
                <span className="ml-1 text-stone-400">
                  (was {card.servings})
                </span>
              )}
            </MetaPill>
          )}
          {card.total_time && (
            <MetaPill icon={Hourglass} tone="amber">
              {card.total_time}
            </MetaPill>
          )}
          {card.active_time && (
            <MetaPill icon={Timer}>{card.active_time} active</MetaPill>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-stone-100 pt-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">
            Scale
          </span>
          <Scaler value={factor} onChange={setFactor} />
        </div>

        {(card.equipment.length > 0 || card.pantry_ingredients.length > 0) && (
          <div className="mt-4 grid gap-3 border-t border-stone-100 pt-4 sm:grid-cols-2">
            {card.equipment.length > 0 && (
              <div className="flex items-start gap-2 text-sm text-stone-600">
                <Wrench className="mt-0.5 h-4 w-4 flex-none text-stone-400" />
                <span>{card.equipment.join(" · ")}</span>
              </div>
            )}
            {card.pantry_ingredients.length > 0 && (
              <div className="flex items-start gap-2 text-sm text-stone-600">
                <Flame className="mt-0.5 h-4 w-4 flex-none text-stone-400" />
                <span>
                  {card.pantry_ingredients
                    .map((i) => {
                      const q = scaleQty(i.quantity, factor);
                      return [q, i.unit, i.item].filter(Boolean).join(" ");
                    })
                    .join(" · ")}
                </span>
              </div>
            )}
          </div>
        )}
      </header>

      <MisePlace card={card} factor={factor} />

      <Timeline steps={card.steps} />

      <ol className="space-y-3">
        {card.steps.map((step) => {
          const isDone = doneSteps.has(step.number);
          const range = parseMinutesRange(step.duration);
          return (
          <li
            key={step.number}
            id={`step-${step.number}`}
            className={`rounded-xl border bg-white p-5 shadow-sm scroll-mt-4 transition ${
              isDone
                ? "border-emerald-200 opacity-60"
                : "border-stone-200"
            }`}
          >
            <div className="flex items-start gap-4">
              <div className="flex flex-col items-center gap-2">
                <div className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-stone-900 text-sm font-semibold text-white">
                  {step.number}
                </div>
                <StepIcon
                  name={step.icon}
                  className="h-5 w-5 text-stone-400"
                />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-lg font-semibold text-stone-900">
                    {step.headline}
                  </h2>
                  <div className="flex flex-wrap gap-1.5">
                    {step.temperature && (
                      <MetaPill icon={Flame} tone="rose">
                        {step.temperature}
                      </MetaPill>
                    )}
                    {step.duration && (
                      <MetaPill icon={Timer} tone="amber">
                        {step.duration}
                      </MetaPill>
                    )}
                  </div>
                </div>

                {step.ingredients.length > 0 && (
                  <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {step.ingredients.map((ing, i) => (
                      <IngredientLine key={i} ing={ing} factor={factor} />
                    ))}
                  </ul>
                )}

                <p className="mt-3 text-sm leading-relaxed text-stone-700">
                  {step.action}
                </p>

                {(step.doneness_cue || step.equipment.length > 0) && (
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-stone-500">
                    {step.doneness_cue && (
                      <span className="inline-flex items-center gap-1.5">
                        <Eye className="h-3.5 w-3.5" />
                        {step.doneness_cue}
                      </span>
                    )}
                    {step.equipment.length > 0 && (
                      <span className="inline-flex items-center gap-1.5">
                        <Wrench className="h-3.5 w-3.5" />
                        {step.equipment.join(", ")}
                      </span>
                    )}
                  </div>
                )}

                {range != null ? (
                  <StepTimer
                    lowSec={Math.round(range.low * 60)}
                    highSec={Math.round(range.high * 60)}
                    stepNumber={step.number}
                    stepHeadline={step.headline}
                    done={isDone}
                    onToggleDone={() => toggleDone(step.number)}
                    onComplete={() => onStepComplete(step.number)}
                  />
                ) : (
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => toggleDone(step.number)}
                      className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium ${
                        isDone
                          ? "bg-emerald-600 text-white hover:bg-emerald-700"
                          : "border border-stone-300 bg-white text-stone-700 hover:bg-stone-50"
                      }`}
                    >
                      {isDone ? "Done" : "Mark done"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </li>
          );
        })}
      </ol>
    </article>
  );
}
