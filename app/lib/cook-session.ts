"use client";

import { useSyncExternalStore } from "react";
import { markCooked } from "@/app/lib/storage";
import { clearTimersForRecipe } from "@/app/lib/timer-state";

// One active cooking session at a time. "Cooking now" replaces the old
// retrospective "I cooked this" — starting a session flips on the timer UI
// and acquires a Screen Wake Lock; finishing records the cook.

export type CookSession = {
  // The id used for local state keying (timer store, mise checks). Stable
  // per (source_url, title) — matches recipeIdFor(card).
  localId: string;
  // The saved record id, if any. This is what markCooked wants — cuid in
  // remote mode, same hash as localId in local mode.
  savedId: string;
  startedAt: number;
};

const KEY = "cookcard:v1:session";
let mirror: CookSession | null | undefined = undefined;
const listeners = new Set<() => void>();
let bound = false;

function read(): CookSession | null {
  if (mirror !== undefined) return mirror;
  if (typeof window === "undefined") {
    mirror = null;
    return null;
  }
  try {
    const raw = window.localStorage.getItem(KEY);
    mirror = raw ? (JSON.parse(raw) as CookSession) : null;
  } catch {
    mirror = null;
  }
  return mirror;
}

function write(next: CookSession | null) {
  mirror = next;
  if (typeof window !== "undefined") {
    if (next) window.localStorage.setItem(KEY, JSON.stringify(next));
    else window.localStorage.removeItem(KEY);
  }
  listeners.forEach((cb) => cb());
}

function bindStorage() {
  if (bound || typeof window === "undefined") return;
  bound = true;
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    mirror = undefined;
    listeners.forEach((cb) => cb());
  });
}

function subscribe(cb: () => void) {
  bindStorage();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useCookSession(): CookSession | null {
  return useSyncExternalStore(subscribe, read, () => null);
}

export function useIsCookingNow(localId: string): boolean {
  const s = useCookSession();
  return s?.localId === localId;
}

export function startCookingSession(s: CookSession) {
  write(s);
}

export async function finishCookingSession(): Promise<{
  cookLogId: string | null;
  savedId: string;
} | null> {
  const s = read();
  if (!s) return null;
  clearTimersForRecipe(s.localId);
  write(null);
  try {
    const r = await markCooked(s.savedId);
    return { cookLogId: r.cookLogId, savedId: s.savedId };
  } catch {
    return { cookLogId: null, savedId: s.savedId };
  }
}

export function cancelCookingSession() {
  const s = read();
  if (!s) return;
  clearTimersForRecipe(s.localId);
  write(null);
}

// Screen Wake Lock — keeps the screen awake while a session is active. Best
// effort: not supported everywhere (Safari ≥ 16.4 required), and the browser
// auto-releases it on tab hide. We reacquire on visibilitychange.
let wakeLockSentinel: WakeLockSentinel | null = null;

async function requestWakeLock() {
  if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
  try {
    wakeLockSentinel = await navigator.wakeLock.request("screen");
    wakeLockSentinel.addEventListener("release", () => {
      wakeLockSentinel = null;
    });
  } catch {
    // Permission/visibility can reject; leave sentinel null.
  }
}

function releaseWakeLock() {
  wakeLockSentinel?.release().catch(() => {});
  wakeLockSentinel = null;
}

// Attach once at module load (client only). The hook is just a subscriber
// that responds to session changes.
if (typeof window !== "undefined") {
  subscribe(() => {
    const active = !!read();
    if (active && !wakeLockSentinel) void requestWakeLock();
    if (!active && wakeLockSentinel) releaseWakeLock();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && read() && !wakeLockSentinel) {
      void requestWakeLock();
    }
  });
}
