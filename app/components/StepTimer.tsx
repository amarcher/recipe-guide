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
  speakText,
  cancelSpeech,
  ensureNotificationPermission,
  notify,
} from "@/app/lib/alarm";
import { getAlarmSettings } from "@/app/lib/settings";

type Status = "idle" | "running" | "checking" | "paused" | "done";

export function StepTimer({
  lowSec,
  highSec,
  stepNumber,
  stepHeadline,
  done,
  onToggleDone,
  onComplete,
}: {
  lowSec: number;
  highSec: number;
  stepNumber: number;
  stepHeadline: string;
  done: boolean;
  onToggleDone: () => void;
  onComplete: () => void;
}) {
  const isRange = highSec > lowSec + 1;
  const [status, setStatus] = useState<Status>("idle");
  const [remaining, setRemaining] = useState(lowSec);
  const [alarm, setAlarm] = useState<{ kind: "check" | "done" } | null>(null);
  const endAt = useRef<number | null>(null);
  const tick = useRef<number | null>(null);
  const alertsFired = useRef<{ low: boolean; high: boolean }>({
    low: false,
    high: false,
  });

  useEffect(() => {
    function loop() {
      if (endAt.current == null) return;
      const sec = (endAt.current - Date.now()) / 1000;
      if (sec <= 0) {
        if (
          isRange &&
          !alertsFired.current.low &&
          status === "running"
        ) {
          alertsFired.current.low = true;
          endAt.current = Date.now() + (highSec - lowSec) * 1000;
          setRemaining(highSec - lowSec);
          setStatus("checking");
          setAlarm({ kind: "check" });
          tick.current = window.setTimeout(loop, 200);
          return;
        }
        alertsFired.current.high = true;
        setRemaining(0);
        setStatus("done");
        endAt.current = null;
        setAlarm({ kind: "done" });
        onComplete();
        return;
      }
      setRemaining(sec);
      tick.current = window.setTimeout(loop, 200);
    }
    if (status === "running" || status === "checking") {
      tick.current = window.setTimeout(loop, 200);
    }
    return () => {
      if (tick.current != null) {
        clearTimeout(tick.current);
        tick.current = null;
      }
    };
  }, [status, onComplete, isRange, lowSec, highSec]);

  // The looping alarm. Fires immediately, then repeats on `intervalSec` until
  // the user silences it (any timer button) or `maxSec` elapses.
  useEffect(() => {
    if (!alarm) return;
    const settings = getAlarmSettings();
    if (!settings.enabled) return;
    const verb = alarm.kind === "check" ? "Check now" : "Time’s up for";
    const announcement = `${verb}: step ${stepNumber}, ${stepHeadline}`;
    const pulse = () => {
      playBeep(settings.volume);
      if (settings.ttsEnabled) speakText(announcement);
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
  }, [alarm, stepHeadline, stepNumber]);

  function silenceAlarm() {
    setAlarm(null);
  }

  async function start() {
    await ensureNotificationPermission();
    silenceAlarm();
    if (status === "checking") {
      endAt.current = Date.now() + remaining * 1000;
      setStatus("checking");
    } else {
      endAt.current = Date.now() + remaining * 1000;
      setStatus("running");
    }
  }
  function pause() {
    silenceAlarm();
    setStatus("paused");
    endAt.current = null;
  }
  function reset() {
    silenceAlarm();
    setStatus("idle");
    setRemaining(lowSec);
    endAt.current = null;
    alertsFired.current = { low: false, high: false };
  }
  function toggleDone() {
    silenceAlarm();
    onToggleDone();
  }

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
            check now · {formatClock(highSec - lowSec)} until max
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
