"use client";

import { useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  BellRing,
  BellOff,
  Check,
  Eye,
} from "lucide-react";
import { formatClock } from "@/app/lib/duration";
import {
  playBeep,
  primeAudio,
  vibrate,
  speakText,
  cancelSpeech,
  ensureNotificationPermission,
  notify,
} from "@/app/lib/alarm";
import { getAlarmSettings } from "@/app/lib/settings";
import { speakOnCast, useCastState } from "@/app/lib/cast";
import {
  readTimerState,
  useTimerState,
  writeTimerState,
  type TimerState,
} from "@/app/lib/timer-state";

type AlarmKind = "check" | "done";

function deriveRemainingMs(s: TimerState, lowMs: number): number {
  if (s.status === "running" || s.status === "checking") {
    return s.endAt == null ? lowMs : Math.max(0, s.endAt - Date.now());
  }
  if (s.status === "paused") return s.pausedRemainingMs ?? lowMs;
  if (s.status === "done") return 0;
  return lowMs;
}

export function StepTimer({
  recipeId,
  lowSec,
  highSec,
  stepNumber,
  stepHeadline,
  done,
  onToggleDone,
  onComplete,
}: {
  recipeId: string;
  lowSec: number;
  highSec: number;
  stepNumber: number;
  stepHeadline: string;
  done: boolean;
  onToggleDone: () => void;
  onComplete: () => void;
}) {
  const isRange = highSec > lowSec + 1;
  const lowMs = lowSec * 1000;
  const highMs = highSec * 1000;
  const persisted = useTimerState(recipeId, stepNumber);
  const cast = useCastState();

  const [alarm, setAlarm] = useState<{ kind: AlarmKind } | null>(null);
  const [remainingMs, setRemainingMs] = useState<number>(() =>
    deriveRemainingMs(persisted, lowMs)
  );
  const tick = useRef<number | null>(null);

  // Drive ticking + phase transitions. On mount with a persisted running
  // timer whose endAt is already in the past, the first loop iteration
  // detects it and fires — so no separate catch-up effect is needed.
  useEffect(() => {
    if (persisted.status !== "running" && persisted.status !== "checking") {
      if (tick.current != null) {
        clearTimeout(tick.current);
        tick.current = null;
      }
      return;
    }
    let cancelled = false;
    function loop() {
      if (cancelled) return;
      const s = readTimerState(recipeId, stepNumber);
      if (s.endAt == null) return;
      const now = Date.now();
      if (now >= s.endAt) {
        if (s.status === "running" && isRange && !s.firedLow) {
          writeTimerState(recipeId, stepNumber, {
            ...s,
            status: "checking",
            endAt: now + (highMs - lowMs),
            firedLow: true,
          });
          setAlarm({ kind: "check" });
          // Effect re-run (on status change) will restart the loop.
          return;
        }
        writeTimerState(recipeId, stepNumber, {
          ...s,
          status: "done",
          endAt: null,
          firedLow: true,
          firedHigh: true,
        });
        setAlarm({ kind: "done" });
        onComplete();
        return;
      }
      setRemainingMs(s.endAt - now);
      tick.current = window.setTimeout(loop, 200);
    }
    tick.current = window.setTimeout(loop, 0);
    return () => {
      cancelled = true;
      if (tick.current != null) {
        clearTimeout(tick.current);
        tick.current = null;
      }
    };
  }, [persisted.status, recipeId, stepNumber, isRange, lowMs, highMs, onComplete]);

  function update(patch: Partial<TimerState>) {
    writeTimerState(recipeId, stepNumber, { ...persisted, ...patch });
  }

  // Looping alarm pulse. Fires immediately then repeats until silenced or the
  // safety cap expires.
  useEffect(() => {
    if (!alarm) return;
    const settings = getAlarmSettings();
    if (!settings.enabled) return;
    const verb = alarm.kind === "check" ? "Check now" : "Time’s up for";
    const announcement = `${verb}: step ${stepNumber}, ${stepHeadline}`;
    const pulse = () => {
      vibrate();
      if (cast.status === "connected") {
        // When casting, the Home is the speaker — don't duplicate audio on
        // the computer. Vibration still fires so you feel it on your phone.
        void speakOnCast(announcement);
        return;
      }
      const audible = playBeep(settings.volume);
      if (settings.ttsEnabled) speakText(announcement);
      if (!audible) {
        console.info("[alarm] audio muted — relying on vibration");
      }
    };
    pulse();
    if (settings.notifyEnabled) notify(`Step ${stepNumber}: ${stepHeadline}`, verb);
    const interval = window.setInterval(pulse, settings.intervalSec * 1000);
    const cap = window.setTimeout(
      () => setAlarm(null),
      settings.maxSec * 1000
    );
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(cap);
      cancelSpeech();
    };
  }, [alarm, stepHeadline, stepNumber, cast.status]);

  function silenceAlarm() {
    setAlarm(null);
  }

  async function start() {
    primeAudio();
    await ensureNotificationPermission();
    silenceAlarm();
    const phaseMs = persisted.status === "checking" ? highMs - lowMs : lowMs;
    const leftMs =
      persisted.status === "paused"
        ? persisted.pausedRemainingMs ?? phaseMs
        : phaseMs;
    const nextStatus: TimerState["status"] =
      persisted.status === "checking" ? "checking" : "running";
    update({
      status: nextStatus,
      endAt: Date.now() + leftMs,
      pausedRemainingMs: null,
      firedLow: persisted.firedLow || nextStatus === "checking",
      firedHigh: false,
    });
  }

  function pause() {
    silenceAlarm();
    const remMs =
      persisted.endAt != null ? Math.max(0, persisted.endAt - Date.now()) : 0;
    update({
      status: "paused",
      endAt: null,
      pausedRemainingMs: remMs,
    });
  }

  function reset() {
    silenceAlarm();
    writeTimerState(recipeId, stepNumber, {
      status: "idle",
      endAt: null,
      pausedRemainingMs: null,
      firedLow: false,
      firedHigh: false,
    });
  }

  function toggleDone() {
    silenceAlarm();
    onToggleDone();
  }

  const status = persisted.status;
  const displayMs =
    status === "running" || status === "checking"
      ? remainingMs
      : status === "paused"
      ? persisted.pausedRemainingMs ?? lowMs
      : status === "done"
      ? 0
      : lowMs;
  const remaining = displayMs / 1000;
  const checkRemSec = status === "checking" ? remaining : highSec - lowSec;

  const tone =
    alarm
      ? "bg-rose-50 ring-rose-300 text-rose-900 animate-pulse"
      : status === "done"
      ? "bg-emerald-50 ring-emerald-300 text-emerald-900"
      : status === "checking"
      ? "bg-orange-50 ring-orange-400 text-orange-900"
      : status === "running"
      ? "bg-amber-50 ring-amber-300 text-amber-900"
      : "bg-stone-50 ring-stone-200 text-stone-700";

  return (
    <div
      className={`mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg p-2 ring-1 ring-inset ${tone}`}
    >
      <div className="flex items-center gap-2">
        {status === "checking" ? (
          <Eye className="h-4 w-4" />
        ) : (
          <BellRing className="h-4 w-4" />
        )}
        <span className="font-mono text-lg font-semibold tabular-nums">
          {formatClock(remaining)}
        </span>
        {alarm && (
          <span className="text-xs font-bold uppercase tracking-wider">
            {alarm.kind === "check" ? "check now" : "time’s up"}
          </span>
        )}
        {!alarm && status === "checking" && (
          <span className="text-xs font-medium uppercase tracking-wider">
            check now · {formatClock(checkRemSec)} until max
          </span>
        )}
        {!alarm && status === "done" && (
          <span className="text-xs font-medium uppercase tracking-wider">
            time’s up
          </span>
        )}
        {isRange && status === "idle" && !alarm && (
          <span className="text-[11px] text-stone-400">
            alerts at {formatClock(lowSec)} and {formatClock(highSec)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        {alarm && (
          <button
            type="button"
            onClick={silenceAlarm}
            className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700"
          >
            <BellOff className="h-3.5 w-3.5" /> Silence
          </button>
        )}
        {status !== "running" && status !== "checking" && status !== "done" && (
          <button
            type="button"
            onClick={start}
            className="inline-flex items-center gap-1 rounded-md bg-stone-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-700"
          >
            <Play className="h-3.5 w-3.5" /> Start
          </button>
        )}
        {(status === "running" || status === "checking") && (
          <button
            type="button"
            onClick={pause}
            className="inline-flex items-center gap-1 rounded-md bg-stone-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-700"
          >
            <Pause className="h-3.5 w-3.5" /> Pause
          </button>
        )}
        {(status === "paused" || status === "done") && (
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </button>
        )}
        <button
          type="button"
          onClick={toggleDone}
          aria-pressed={done}
          className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium ${
            done
              ? "bg-emerald-600 text-white hover:bg-emerald-700"
              : "border border-stone-300 bg-white text-stone-700 hover:bg-stone-50"
          }`}
        >
          <Check className="h-3.5 w-3.5" />
          {done ? "Done" : "Mark done"}
        </button>
      </div>
    </div>
  );
}
