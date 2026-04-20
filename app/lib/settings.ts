"use client";

import { useSyncExternalStore } from "react";

export type AlarmSettings = {
  enabled: boolean;
  ttsEnabled: boolean;
  notifyEnabled: boolean;
  volume: number; // 0..1
  intervalSec: number; // how often the alarm repeats
  maxSec: number; // safety cap so it doesn't ring forever
};

const DEFAULTS: AlarmSettings = {
  enabled: true,
  ttsEnabled: true,
  notifyEnabled: true,
  volume: 0.8,
  intervalSec: 7,
  maxSec: 5 * 60,
};

const KEY = "cookcard:v1:alarm-settings";

let mirror: AlarmSettings | null = null;
const listeners = new Set<() => void>();
let initialized = false;

function readFromStorage(): AlarmSettings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

function init() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  mirror = readFromStorage();
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    mirror = readFromStorage();
    listeners.forEach((cb) => cb());
  });
}

function getMirror(): AlarmSettings {
  init();
  return mirror ?? DEFAULTS;
}

function subscribe(cb: () => void) {
  init();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function snapshot(): AlarmSettings {
  return getMirror();
}

export function useAlarmSettings(): AlarmSettings {
  return useSyncExternalStore(subscribe, snapshot, () => DEFAULTS);
}

// Imperative read for non-React callers (e.g. inside setInterval bodies).
export function getAlarmSettings(): AlarmSettings {
  return getMirror();
}

export function setAlarmSettings(patch: Partial<AlarmSettings>) {
  const next: AlarmSettings = { ...getMirror(), ...patch };
  mirror = next;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  }
  listeners.forEach((cb) => cb());
}
