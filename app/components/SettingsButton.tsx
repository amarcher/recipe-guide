"use client";

import { useEffect, useRef, useState } from "react";
import { Settings, Volume2 } from "lucide-react";
import {
  useAlarmSettings,
  setAlarmSettings,
  getAlarmSettings,
} from "@/app/lib/settings";
import { playBeep, speakText } from "@/app/lib/alarm";

export function SettingsButton() {
  const [open, setOpen] = useState(false);
  const settings = useAlarmSettings();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  function test() {
    const s = getAlarmSettings();
    playBeep(s.volume);
    if (s.ttsEnabled) speakText("Recipe Guide alarm test");
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Settings"
        aria-expanded={open}
        className="inline-flex items-center justify-center rounded-md p-2 text-stone-600 hover:bg-stone-100 hover:text-stone-900"
      >
        <Settings className="h-4 w-4" />
      </button>
      {open && (
        <div
          role="dialog"
          className="absolute right-0 top-full z-20 mt-1 w-72 rounded-xl border border-stone-200 bg-white p-4 shadow-lg"
        >
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-500">
            <Volume2 className="h-3.5 w-3.5" /> Timer alarms
          </div>

          <Toggle
            label="Sound"
            checked={settings.enabled}
            onChange={(v) => setAlarmSettings({ enabled: v })}
          />
          <Toggle
            label="Spoken announcement"
            checked={settings.ttsEnabled}
            onChange={(v) => setAlarmSettings({ ttsEnabled: v })}
          />
          <Toggle
            label="Browser notification"
            checked={settings.notifyEnabled}
            onChange={(v) => setAlarmSettings({ notifyEnabled: v })}
          />

          <label className="mt-3 block text-xs text-stone-600">
            <span className="flex justify-between">
              <span>Volume</span>
              <span className="tabular-nums text-stone-400">
                {Math.round(settings.volume * 100)}%
              </span>
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.volume}
              onChange={(e) =>
                setAlarmSettings({ volume: parseFloat(e.target.value) })
              }
              className="mt-1 w-full accent-stone-900"
            />
          </label>

          <label className="mt-3 block text-xs text-stone-600">
            <span className="flex justify-between">
              <span>Repeat every</span>
              <span className="tabular-nums text-stone-400">
                {settings.intervalSec}s
              </span>
            </span>
            <input
              type="range"
              min={3}
              max={20}
              step={1}
              value={settings.intervalSec}
              onChange={(e) =>
                setAlarmSettings({ intervalSec: parseInt(e.target.value, 10) })
              }
              className="mt-1 w-full accent-stone-900"
            />
          </label>

          <label className="mt-3 block text-xs text-stone-600">
            <span className="flex justify-between">
              <span>Stop after</span>
              <span className="tabular-nums text-stone-400">
                {Math.round(settings.maxSec / 60)} min
              </span>
            </span>
            <input
              type="range"
              min={60}
              max={1800}
              step={60}
              value={settings.maxSec}
              onChange={(e) =>
                setAlarmSettings({ maxSec: parseInt(e.target.value, 10) })
              }
              className="mt-1 w-full accent-stone-900"
            />
          </label>

          <button
            type="button"
            onClick={test}
            className="mt-4 w-full rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50"
          >
            Test alarm
          </button>
        </div>
      )}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between py-1.5 text-sm text-stone-700">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${
          checked ? "bg-stone-900" : "bg-stone-300"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
    </label>
  );
}
