"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { CookCard } from "@/app/types";

export type SavedRecipe = {
  id: string;
  card: CookCard;
  savedAt: number;
  lastCookedAt: number | null;
  cookCount: number;
};

const STORAGE_KEY = "cookcard:v1:recipes";

function hashId(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

export function recipeIdFor(card: CookCard): string {
  return hashId(`${card.source_url}|${card.title}`);
}

// In-memory mirror of localStorage. Replaced (not mutated) on every write so
// that snapshots returned to React keep stable references between writes.
let mirror: Record<string, SavedRecipe> | null = null;
let cachedList: SavedRecipe[] | null = null;
const listeners = new Set<() => void>();
let initialized = false;

function readFromStorage(): Record<string, SavedRecipe> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, SavedRecipe>) : {};
  } catch {
    return {};
  }
}

function init() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  mirror = readFromStorage();
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY) return;
    mirror = readFromStorage();
    cachedList = null;
    listeners.forEach((fn) => fn());
  });
}

function notify() {
  cachedList = null;
  listeners.forEach((fn) => fn());
}

function writeMirror(next: Record<string, SavedRecipe>) {
  mirror = next;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
  notify();
}

function getMirror(): Record<string, SavedRecipe> {
  init();
  return mirror ?? {};
}

// Snapshots — must return the same reference between writes for
// useSyncExternalStore to be stable.
function listSnapshot(): SavedRecipe[] {
  if (cachedList) return cachedList;
  cachedList = Object.values(getMirror()).sort(
    (a, b) => (b.lastCookedAt ?? b.savedAt) - (a.lastCookedAt ?? a.savedAt)
  );
  return cachedList;
}

function getSnapshot(id: string): SavedRecipe | null {
  return getMirror()[id] ?? null;
}

function subscribe(cb: () => void) {
  init();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

const EMPTY_LIST: SavedRecipe[] = [];

export function useSavedRecipes(): SavedRecipe[] {
  return useSyncExternalStore(subscribe, listSnapshot, () => EMPTY_LIST);
}

const noopSubscribe = () => () => {};
const trueSnapshot = () => true;
const falseSnapshot = () => false;

export function useSavedRecipe(id: string | null): {
  recipe: SavedRecipe | null;
  loaded: boolean;
} {
  const snapshot = useCallback(
    () => (id ? getSnapshot(id) : null),
    [id]
  );
  const recipe = useSyncExternalStore(subscribe, snapshot, () => null);
  // `loaded` is false during SSR + initial hydration (so the HTML matches),
  // then flips to true on the next client render. We need this 3-state UI
  // (loading / not-found / found) because localStorage doesn't exist on the
  // server — we shouldn't show "not found" until we've actually checked.
  const loaded = useSyncExternalStore(
    noopSubscribe,
    trueSnapshot,
    falseSnapshot
  );
  return { recipe, loaded };
}

// Imperative API
export function listRecipes(): SavedRecipe[] {
  return listSnapshot();
}

export function getRecipe(id: string): SavedRecipe | null {
  return getSnapshot(id);
}

export function saveRecipe(card: CookCard): SavedRecipe {
  const id = recipeIdFor(card);
  const current = getMirror();
  const existing = current[id];
  const entry: SavedRecipe = existing
    ? { ...existing, card }
    : {
        id,
        card,
        savedAt: Date.now(),
        lastCookedAt: null,
        cookCount: 0,
      };
  writeMirror({ ...current, [id]: entry });
  return entry;
}

export function deleteRecipe(id: string) {
  const current = getMirror();
  if (!(id in current)) return;
  const { [id]: _removed, ...rest } = current;
  void _removed;
  writeMirror(rest);
}

export function markCooked(id: string) {
  const current = getMirror();
  const r = current[id];
  if (!r) return;
  const updated: SavedRecipe = {
    ...r,
    lastCookedAt: Date.now(),
    cookCount: (r.cookCount ?? 0) + 1,
  };
  writeMirror({ ...current, [id]: updated });
  writeMise(id, new Set());
}

export function isSaved(id: string): boolean {
  return getSnapshot(id) !== null;
}

// ─── Mise en place checks ───────────────────────────────────────────────────
// Per-recipe set of entry keys the user has gotten out on the counter.
// Cleared automatically when markCooked is called.

const MISE_PREFIX = "cookcard:v1:mise:";
const miseMirror = new Map<string, Set<string>>();
const miseListeners = new Map<string, Set<() => void>>();

function readMise(recipeId: string): Set<string> {
  const cached = miseMirror.get(recipeId);
  if (cached) return cached;
  let next = new Set<string>();
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(MISE_PREFIX + recipeId);
      if (raw) next = new Set(JSON.parse(raw) as string[]);
    } catch {}
  }
  miseMirror.set(recipeId, next);
  return next;
}

function writeMise(recipeId: string, set: Set<string>) {
  miseMirror.set(recipeId, set);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      MISE_PREFIX + recipeId,
      JSON.stringify([...set])
    );
  }
  miseListeners.get(recipeId)?.forEach((fn) => fn());
}

export function toggleMiseCheck(recipeId: string, entryKey: string) {
  const cur = readMise(recipeId);
  const next = new Set(cur);
  if (next.has(entryKey)) next.delete(entryKey);
  else next.add(entryKey);
  writeMise(recipeId, next);
}

export function clearMiseChecks(recipeId: string) {
  writeMise(recipeId, new Set());
}

const EMPTY_SET: ReadonlySet<string> = new Set();

export function useMiseChecks(recipeId: string): ReadonlySet<string> {
  const subscribe = useCallback(
    (cb: () => void) => {
      let s = miseListeners.get(recipeId);
      if (!s) {
        s = new Set();
        miseListeners.set(recipeId, s);
      }
      s.add(cb);
      return () => {
        s!.delete(cb);
      };
    },
    [recipeId]
  );
  const snapshot = useCallback(() => readMise(recipeId), [recipeId]);
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY_SET);
}
