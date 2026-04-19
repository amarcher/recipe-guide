"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw, BellRing, Check, Eye } from "lucide-react";
import { formatClock } from "@/app/lib/duration";
import { beep, ensureNotificationPermission, notify } from "@/app/lib/alarm";

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
  // Time remaining until the *current* target (low first, then high if range).
  const [remaining, setRemaining] = useState(lowSec);
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
        // Reached current target.
        if (
          isRange &&
          !alertsFired.current.low &&
          // we were targeting low
          status === "running"
        ) {
          alertsFired.current.low = true;
          beep();
          notify(`Step ${stepNumber}: check it`, stepHeadline);
          // Now run to the high end.
          const extra = highSec - lowSec;
          endAt.current = Date.now() + extra * 1000;
          setRemaining(extra);
          setStatus("checking");
          tick.current = window.setTimeout(loop, 200);
          return;
        }
        // Either we reached high (range) or single duration.
        alertsFired.current.high = true;
        setRemaining(0);
        setStatus("done");
        endAt.current = null;
        beep();
        notify(`Step ${stepNumber} done`, stepHeadline);
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
  }, [status, stepNumber, stepHeadline, onComplete, isRange, lowSec, highSec]);

  async function start() {
    await ensureNotificationPermission();
    // If we're at idle, target the low end first.
    // If paused, resume whatever we were doing.
    if (status === "checking") {
      endAt.current = Date.now() + remaining * 1000;
      setStatus("checking");
    } else {
      endAt.current = Date.now() + remaining * 1000;
      setStatus("running");
    }
  }
  function pause() {
    setStatus("paused");
    endAt.current = null;
  }
  function reset() {
    setStatus("idle");
    setRemaining(lowSec);
    endAt.current = null;
    alertsFired.current = { low: false, high: false };
  }

  const tone =
    status === "done"
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
        {status === "checking" && (
          <span className="text-xs font-medium uppercase tracking-wider">
            check now · {formatClock(highSec - lowSec)} until max
          </span>
        )}
        {status === "done" && (
          <span className="text-xs font-medium uppercase tracking-wider">
            time’s up
          </span>
        )}
        {isRange && status === "idle" && (
          <span className="text-[11px] text-stone-400">
            alerts at {formatClock(lowSec)} and {formatClock(highSec)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
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
          onClick={onToggleDone}
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
