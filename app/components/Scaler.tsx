"use client";

import { useState } from "react";

const PRESETS = [
  { label: "½", value: 0.5 },
  { label: "⅔", value: 2 / 3 },
  { label: "1×", value: 1 },
  { label: "1½", value: 1.5 },
  { label: "2×", value: 2 },
  { label: "3×", value: 3 },
];

export function Scaler({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  const [custom, setCustom] = useState("");
  const isPreset = PRESETS.some((p) => Math.abs(p.value - value) < 0.001);

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white p-1 shadow-sm">
      {PRESETS.map((p) => {
        const active = Math.abs(p.value - value) < 0.001;
        return (
          <button
            key={p.label}
            type="button"
            onClick={() => onChange(p.value)}
            className={`rounded-full px-3 py-1 text-sm font-medium transition ${
              active
                ? "bg-stone-900 text-white"
                : "text-stone-600 hover:bg-stone-100"
            }`}
          >
            {p.label}
          </button>
        );
      })}
      <div className="ml-1 flex items-center border-l border-stone-200 pl-2">
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          min="0.1"
          placeholder={isPreset ? "custom" : value.toString()}
          value={custom}
          onChange={(e) => {
            setCustom(e.target.value);
            const n = parseFloat(e.target.value);
            if (!isNaN(n) && n > 0) onChange(n);
          }}
          className="w-16 rounded-md bg-transparent px-2 py-1 text-sm text-stone-700 placeholder:text-stone-400 focus:bg-stone-100 focus:outline-none"
        />
        <span className="pr-1 text-sm text-stone-400">×</span>
      </div>
    </div>
  );
}
