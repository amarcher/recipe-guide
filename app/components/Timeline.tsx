"use client";

import type { Step } from "@/app/types";
import { parseMinutesRange, formatMinutes } from "@/app/lib/duration";
import { StepIcon } from "./StepIcon";

const FALLBACK_MIN = 5;

// For the timeline we want "active engagement time", not midpoint. A step like
// "30 minutes to 24 hours" represents 30 minutes of actual work plus optional
// resting; using the midpoint (~12h) makes that one step swallow the whole
// strip. Use the low end of the range for sizing.
export function Timeline({ steps }: { steps: Step[] }) {
  const segments = steps.map((s) => {
    const r = parseMinutesRange(s.duration);
    return { step: s, minutes: r ? r.low : FALLBACK_MIN, known: r !== null };
  });
  const total = segments.reduce((acc, s) => acc + s.minutes, 0);
  if (total === 0) return null;
  const starts: number[] = [];
  segments.reduce((acc, s, i) => {
    starts[i] = acc;
    return acc + s.minutes;
  }, 0);

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
          Timeline
        </h3>
        <span className="text-xs tabular-nums text-stone-500">
          ≈ {formatMinutes(total)} active
        </span>
      </div>
      <div className="flex h-9 w-full overflow-hidden rounded-md bg-stone-100">
        {segments.map((s, i) => {
          const pct = (s.minutes / total) * 100;
          const start = starts[i];
          const tones = [
            "bg-rose-200 hover:bg-rose-300 text-rose-900",
            "bg-amber-200 hover:bg-amber-300 text-amber-900",
            "bg-emerald-200 hover:bg-emerald-300 text-emerald-900",
            "bg-sky-200 hover:bg-sky-300 text-sky-900",
            "bg-violet-200 hover:bg-violet-300 text-violet-900",
            "bg-fuchsia-200 hover:bg-fuchsia-300 text-fuchsia-900",
          ];
          const tone = tones[i % tones.length];
          return (
            <button
              key={s.step.number}
              type="button"
              onClick={() => {
                document
                  .getElementById(`step-${s.step.number}`)
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              style={{ width: `${pct}%` }}
              title={`Step ${s.step.number}: ${s.step.headline} — ${
                s.known ? formatMinutes(s.minutes) : "≈" + formatMinutes(s.minutes)
              } (starts at ${formatMinutes(start)})`}
              className={`group relative flex h-full items-center justify-center border-r border-white/60 last:border-r-0 transition ${tone}`}
            >
              <span className="flex items-center gap-1 text-xs font-semibold">
                <StepIcon name={s.step.icon} className="h-3.5 w-3.5" />
                {pct > 7 && <span>{s.step.number}</span>}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] tabular-nums text-stone-400">
        <span>0</span>
        <span>{formatMinutes(total / 2)}</span>
        <span>{formatMinutes(total)}</span>
      </div>
    </div>
  );
}
