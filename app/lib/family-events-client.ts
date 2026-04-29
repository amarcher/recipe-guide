"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

// Roadmap item 2.13 — client-side family event consumer.
//
// Single primitive used by the Meezing presence ribbon (2.14), the
// notification inbox badge (2.21), and any future live consumer. Default
// behavior: keep an EventSource open, auto-reconnect with a `since` cursor
// when the server suggests it (Vercel Fluid Compute caps long-running
// responses at ~60-90s — see route.ts), and fall back to polling if the
// stream errors twice in a row.
//
// `since` cursor is persisted across page reloads in sessionStorage so the
// notification badge doesn't flash zero unread on F5.

export type FamilyEvent = {
  id: string;
  kind: string;
  planId: string | null;
  savedRecipeId: string | null;
  payload: unknown;
  actorId: string | null;
  createdAt: number;
};

export type FamilyEventsHandle = {
  events: FamilyEvent[];
  lastSeen: number;
  status: "idle" | "streaming" | "polling" | "error";
};

const SINCE_KEY_PREFIX = "cookcard:v1:family-events-since:";

function readSince(familyId: string): number {
  if (typeof window === "undefined") return Date.now() - 60_000;
  try {
    const raw = window.sessionStorage.getItem(SINCE_KEY_PREFIX + familyId);
    if (raw) return Number(raw);
  } catch {}
  return Date.now() - 60_000;
}

function writeSince(familyId: string, ms: number): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SINCE_KEY_PREFIX + familyId, String(ms));
  } catch {}
}

// Subscribe to a family's event stream. Returns the most recent N events
// in arrival order plus the cursor and status. The stream auto-reconnects
// — callers don't need to handle reconnect themselves.
export function useFamilyEvents(
  familyId: string | null,
  options?: { onEvent?: (e: FamilyEvent) => void; bufferSize?: number },
): FamilyEventsHandle {
  const [events, setEvents] = useState<FamilyEvent[]>([]);
  const [lastSeen, setLastSeen] = useState<number>(() =>
    familyId ? readSince(familyId) : 0,
  );
  const [status, setStatus] = useState<FamilyEventsHandle["status"]>("idle");
  const onEventRef = useRef(options?.onEvent);
  // Refs must be assigned in an effect (react-hooks/refs rule under React
  // 19), not during render.
  useLayoutEffect(() => {
    onEventRef.current = options?.onEvent;
  });
  const bufferSize = options?.bufferSize ?? 200;

  useEffect(() => {
    if (!familyId) return;
    const fid: string = familyId;

    let cancelled = false;
    let consecutiveErrors = 0;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let activeSource: EventSource | null = null;
    let cursor = readSince(fid);

    function pushEvent(e: FamilyEvent) {
      cursor = Math.max(cursor, e.createdAt);
      writeSince(fid, cursor);
      setLastSeen(cursor);
      setEvents((prev) => {
        const next = [...prev, e];
        return next.length > bufferSize ? next.slice(-bufferSize) : next;
      });
      onEventRef.current?.(e);
    }

    function startStream() {
      if (cancelled) return;
      setStatus("streaming");
      const url = `/api/families/${fid}/events?since=${cursor}`;
      const src = new EventSource(url);
      activeSource = src;

      src.addEventListener("event", (ev) => {
        try {
          const data = JSON.parse((ev as MessageEvent).data) as FamilyEvent;
          pushEvent(data);
        } catch {}
      });
      src.addEventListener("hello", () => {
        consecutiveErrors = 0;
      });
      src.addEventListener("reconnect", () => {
        src.close();
        if (!cancelled) startStream();
      });
      src.onerror = () => {
        src.close();
        if (cancelled) return;
        consecutiveErrors++;
        if (consecutiveErrors >= 2) {
          startPolling();
        } else {
          // Brief backoff before retry.
          setTimeout(() => {
            if (!cancelled) startStream();
          }, 1000);
        }
      };
    }

    async function pollOnce() {
      try {
        const res = await fetch(
          `/api/families/${fid}/events?mode=poll&since=${cursor}`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error(`poll ${res.status}`);
        const body = (await res.json()) as { events: FamilyEvent[] };
        for (const e of body.events) pushEvent(e);
        consecutiveErrors = 0;
      } catch {
        consecutiveErrors++;
        if (consecutiveErrors > 5) setStatus("error");
      }
    }

    function startPolling() {
      setStatus("polling");
      const tick = async () => {
        if (cancelled) return;
        await pollOnce();
        if (cancelled) return;
        pollTimer = setTimeout(tick, 5000);
      };
      void tick();
    }

    startStream();

    return () => {
      cancelled = true;
      activeSource?.close();
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [familyId, bufferSize]);

  return { events, lastSeen, status };
}
