"use client";

import { useSyncExternalStore } from "react";

export type RecentParse = {
  url: string;
  title: string;
  parsedAt: number;
};

const KEY = "recipeguide:v1:recent-parses";
const CAP = 20;

let mirror: RecentParse[] | null = null;
const listeners = new Set<() => void>();
let initialized = false;
const EMPTY: RecentParse[] = [];

function readFromStorage(): RecentParse[] {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RecentParse[]) : EMPTY;
  } catch {
    return EMPTY;
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

function write(next: RecentParse[]) {
  mirror = next;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  }
  listeners.forEach((cb) => cb());
}

function getMirror(): RecentParse[] {
  init();
  return mirror ?? EMPTY;
}

function snapshot(): RecentParse[] {
  return getMirror();
}

function subscribe(cb: () => void) {
  init();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useRecentParses(): RecentParse[] {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY);
}

export function pushRecent(p: { url: string; title: string }) {
  const cur = getMirror();
  // Move-to-front, dedupe by URL.
  const filtered = cur.filter((r) => r.url !== p.url);
  write([{ ...p, parsedAt: Date.now() }, ...filtered].slice(0, CAP));
}

export function removeRecent(url: string) {
  write(getMirror().filter((r) => r.url !== url));
}

export function clearRecent() {
  write(EMPTY);
}
