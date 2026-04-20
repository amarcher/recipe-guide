"use client";

import { useCallback, useSyncExternalStore } from "react";

// Per-step timer state, persisted in localStorage so reloads and new tabs
// see a running timer still counting. Remaining time is always computed from
// wall clock (endAt - Date.now()), never from a stored "remaining" value.

export type TimerStatus =
  | "idle"
  | "running"   // counting toward low end
  | "checking"  // low fired, counting toward high end
  | "paused"
  | "done";

export type TimerState = {
  status: TimerStatus;
  endAt: number | null;
  pausedRemainingMs: number | null;
  firedLow: boolean;
  firedHigh: boolean;
};

export const IDLE: TimerState = {
  status: "idle",
  endAt: null,
  pausedRemainingMs: null,
  firedLow: false,
  firedHigh: false,
};

const PREFIX = "cookcard:v1:timer:";
function keyFor(recipeId: string, stepNumber: number) {
  return `${PREFIX}${recipeId}:${stepNumber}`;
}

const mirror = new Map<string, TimerState>();
const listeners = new Map<string, Set<() => void>>();
let storageBound = false;

function read(k: string): TimerState {
  const cached = mirror.get(k);
  if (cached) return cached;
  let next = IDLE;
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(k);
      if (raw) next = { ...IDLE, ...(JSON.parse(raw) as TimerState) };
    } catch {}
  }
  mirror.set(k, next);
  return next;
}

function write(k: string, s: TimerState) {
  mirror.set(k, s);
  if (typeof window !== "undefined") {
    if (s.status === "idle") window.localStorage.removeItem(k);
    else window.localStorage.setItem(k, JSON.stringify(s));
  }
  listeners.get(k)?.forEach((cb) => cb());
}

function bindStorage() {
  if (storageBound || typeof window === "undefined") return;
  storageBound = true;
  window.addEventListener("storage", (e) => {
    if (!e.key || !e.key.startsWith(PREFIX)) return;
    mirror.delete(e.key);
    listeners.get(e.key)?.forEach((cb) => cb());
  });
}

function subscribe(k: string, cb: () => void) {
  bindStorage();
  let set = listeners.get(k);
  if (!set) {
    set = new Set();
    listeners.set(k, set);
  }
  set.add(cb);
  return () => {
    set!.delete(cb);
  };
}

export function readTimerState(
  recipeId: string,
  stepNumber: number
): TimerState {
  return read(keyFor(recipeId, stepNumber));
}

export function writeTimerState(
  recipeId: string,
  stepNumber: number,
  s: TimerState
) {
  write(keyFor(recipeId, stepNumber), s);
}

export function useTimerState(
  recipeId: string,
  stepNumber: number
): TimerState {
  const k = keyFor(recipeId, stepNumber);
  const sub = useCallback((cb: () => void) => subscribe(k, cb), [k]);
  const snap = useCallback(() => read(k), [k]);
  return useSyncExternalStore(sub, snap, () => IDLE);
}

// Clear every step timer associated with a recipe. Called when a cooking
// session ends, so the next cook starts fresh.
export function clearTimersForRecipe(recipeId: string) {
  if (typeof window === "undefined") return;
  const prefix = `${PREFIX}${recipeId}:`;
  const toDelete: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (k && k.startsWith(prefix)) toDelete.push(k);
  }
  for (const k of toDelete) {
    mirror.delete(k);
    window.localStorage.removeItem(k);
    listeners.get(k)?.forEach((cb) => cb());
  }
}
