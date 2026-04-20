"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useSession, signIn, signOut } from "next-auth/react";
import { LogIn, LogOut, Volume2, FlaskConical } from "lucide-react";
import {
  useAlarmSettings,
  setAlarmSettings,
  getAlarmSettings,
} from "@/app/lib/settings";
import { playBeep, speakText } from "@/app/lib/alarm";

export function AvatarMenu() {
  const session = useSession();
  const settings = useAlarmSettings();
  const [open, setOpen] = useState(false);
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

  function testAlarm() {
    const s = getAlarmSettings();
    playBeep(s.volume);
    if (s.ttsEnabled) speakText("Recipe Guide alarm test");
  }

  // Signed-out: just the Sign in button.
  if (session.status !== "authenticated") {
    return (
      <button
        type="button"
        onClick={() => signIn("google", { callbackUrl: "/" })}
        className="inline-flex items-center gap-1.5 rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700"
      >
        <LogIn className="h-4 w-4" />
        Sign in
      </button>
    );
  }

  const user = session.data!.user;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        aria-expanded={open}
        className="flex items-center rounded-full ring-2 ring-transparent transition hover:ring-stone-300 focus:ring-stone-400 focus:outline-none"
      >
        {user?.image ? (
          <Image
            src={user.image}
            alt={user.name ?? "you"}
            width={32}
            height={32}
            className="rounded-full"
            unoptimized
          />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-200 text-xs font-semibold text-stone-700">
            {(user?.name ?? user?.email ?? "?")[0]?.toUpperCase()}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          className="absolute right-0 top-full z-20 mt-2 w-72 rounded-xl border border-stone-200 bg-white p-4 shadow-lg"
        >
          {/* Identity */}
          <div className="mb-3 border-b border-stone-100 pb-3">
            <div className="text-sm font-semibold text-stone-900">
              {user?.name ?? "Signed in"}
            </div>
            {user?.email && (
              <div className="truncate text-xs text-stone-500">{user.email}</div>
            )}
          </div>

          {/* Alarm settings */}
          <div className="mb-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-500">
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

            <Slider
              label="Volume"
              valueLabel={`${Math.round(settings.volume * 100)}%`}
              min={0}
              max={1}
              step={0.05}
              value={settings.volume}
              onChange={(v) => setAlarmSettings({ volume: v })}
            />
            <Slider
              label="Repeat every"
              valueLabel={`${settings.intervalSec}s`}
              min={3}
              max={20}
              step={1}
              value={settings.intervalSec}
              onChange={(v) =>
                setAlarmSettings({ intervalSec: Math.round(v) })
              }
            />
            <Slider
              label="Stop after"
              valueLabel={`${Math.round(settings.maxSec / 60)} min`}
              min={60}
              max={1800}
              step={60}
              value={settings.maxSec}
              onChange={(v) => setAlarmSettings({ maxSec: Math.round(v) })}
            />

            <button
              type="button"
              onClick={testAlarm}
              className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50"
            >
              <FlaskConical className="h-3.5 w-3.5" />
              Test alarm
            </button>
          </div>

          {/* Sign out */}
          <div className="border-t border-stone-100 pt-3">
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/" })}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>
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

function Slider({
  label,
  valueLabel,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  valueLabel: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="mt-2 block text-xs text-stone-600">
      <span className="flex justify-between">
        <span>{label}</span>
        <span className="tabular-nums text-stone-400">{valueLabel}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="mt-1 w-full accent-stone-900"
      />
    </label>
  );
}
