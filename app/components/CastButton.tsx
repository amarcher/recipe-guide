"use client";

import { useEffect } from "react";
import { Loader2, Speaker } from "lucide-react";
import {
  connectCast,
  disconnectCast,
  initCast,
  useCastState,
} from "@/app/lib/cast";

export function CastButton() {
  const state = useCastState();

  useEffect(() => {
    void initCast();
  }, []);

  if (state.status === "unsupported") {
    return (
      <button
        type="button"
        disabled
        title={state.error ?? "Cast not supported in this browser"}
        className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs font-medium text-stone-400"
      >
        <Speaker className="h-3.5 w-3.5" />
        Cast
      </button>
    );
  }

  if (state.status === "connected") {
    return (
      <button
        type="button"
        onClick={disconnectCast}
        title={`Casting to ${state.deviceName ?? "speaker"} — click to stop`}
        className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-900 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-900"
      >
        <Speaker className="h-3.5 w-3.5" />
        {state.deviceName ?? "Speaker"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={connectCast}
      disabled={state.status === "connecting" || state.status === "unavailable"}
      title={
        state.error ??
        "Cast timer announcements to a Google Home / Chromecast-compatible speaker"
      }
      className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3 py-1 text-xs font-medium text-stone-700 hover:border-stone-500 disabled:opacity-60"
    >
      {state.status === "connecting" ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Speaker className="h-3.5 w-3.5" />
      )}
      Cast
    </button>
  );
}
