"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useSession } from "next-auth/react";
import type { CookCard } from "@/app/types";

export type SavedRecipe = {
  id: string;
  card: CookCard;
  savedAt: number;
  lastCookedAt: number | null;
  cookCount: number;
  family?: { id: string; name: string } | null;
};

// Stable hash of (sourceUrl, title). Used as the LOCAL recipe ID. The server
// uses cuids; we map between them with a `localKey` field on the server row
// (set during sync), so the same recipe id works in both modes.
export function recipeIdFor(card: CookCard): string {
  let h = 0x811c9dc5;
  const s = `${card.source_url}|${card.title}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

// ─── LOCAL store (current behavior) ─────────────────────────────────────────

const STORAGE_KEY = "cookcard:v1:recipes";
let localMirror: Record<string, SavedRecipe> | null = null;
let localCachedList: SavedRecipe[] | null = null;
const localListeners = new Set<() => void>();
let localInitialized = false;

function readLocal(): Record<string, SavedRecipe> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, SavedRecipe>) : {};
  } catch {
    return {};
  }
}

function initLocal() {
  if (localInitialized || typeof window === "undefined") return;
  localInitialized = true;
  localMirror = readLocal();
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY) return;
    localMirror = readLocal();
    localCachedList = null;
    localListeners.forEach((fn) => fn());
  });
}

function writeLocal(next: Record<string, SavedRecipe>) {
  localMirror = next;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
  localCachedList = null;
  localListeners.forEach((fn) => fn());
}

function getLocalMirror(): Record<string, SavedRecipe> {
  initLocal();
  return localMirror ?? {};
}

function localListSnapshot(): SavedRecipe[] {
  if (localCachedList) return localCachedList;
  localCachedList = Object.values(getLocalMirror()).sort(
    (a, b) => (b.lastCookedAt ?? b.savedAt) - (a.lastCookedAt ?? a.savedAt)
  );
  return localCachedList;
}

function subscribeLocal(cb: () => void) {
  initLocal();
  localListeners.add(cb);
  return () => {
    localListeners.delete(cb);
  };
}

// ─── REMOTE store (signed-in users) ─────────────────────────────────────────

let remoteMirror: Record<string, SavedRecipe> | null = null;
let remoteCachedList: SavedRecipe[] | null = null;
const remoteListeners = new Set<() => void>();
let remoteFetchInflight: Promise<void> | null = null;

function notifyRemote() {
  remoteCachedList = null;
  remoteListeners.forEach((fn) => fn());
}

function subscribeRemote(cb: () => void) {
  remoteListeners.add(cb);
  return () => {
    remoteListeners.delete(cb);
  };
}

async function fetchRemoteList(): Promise<void> {
  if (remoteFetchInflight) return remoteFetchInflight;
  remoteFetchInflight = (async () => {
    try {
      const res = await fetch("/api/recipes");
      if (!res.ok) return;
      const data = (await res.json()) as { recipes: ServerRecipeRow[] };
      const next: Record<string, SavedRecipe> = {};
      for (const r of data.recipes) {
        next[r.id] = serverToLocal(r);
      }
      remoteMirror = next;
      notifyRemote();
    } finally {
      remoteFetchInflight = null;
    }
  })();
  return remoteFetchInflight;
}

type ServerRecipeRow = {
  id: string;
  sourceUrl: string;
  title: string;
  card: CookCard;
  family: { id: string; name: string } | null;
  savedAt: number;
  lastCookedAt: number | null;
  cookCount: number;
};

function serverToLocal(r: ServerRecipeRow): SavedRecipe {
  return {
    id: r.id,
    card: r.card,
    savedAt: r.savedAt,
    lastCookedAt: r.lastCookedAt,
    cookCount: r.cookCount,
    family: r.family,
  };
}

function getRemoteMirror(): Record<string, SavedRecipe> {
  return remoteMirror ?? {};
}

function remoteListSnapshot(): SavedRecipe[] {
  if (remoteCachedList) return remoteCachedList;
  remoteCachedList = Object.values(getRemoteMirror()).sort(
    (a, b) => (b.lastCookedAt ?? b.savedAt) - (a.lastCookedAt ?? a.savedAt)
  );
  return remoteCachedList;
}

// ─── Mode dispatch ──────────────────────────────────────────────────────────

type Mode = "local" | "remote";

function useMode(): Mode {
  const session = useSession();
  return session.status === "authenticated" ? "remote" : "local";
}

const EMPTY_LIST: SavedRecipe[] = [];
const noopSubscribe = () => () => {};
const trueSnapshot = () => true;
const falseSnapshot = () => false;

export function useSavedRecipes(): SavedRecipe[] {
  const mode = useMode();
  // Kick off initial remote fetch when mode flips to remote.
  useEffect(() => {
    if (mode === "remote" && !remoteMirror) void fetchRemoteList();
  }, [mode]);

  const localValue = useSyncExternalStore(
    subscribeLocal,
    localListSnapshot,
    () => EMPTY_LIST
  );
  const remoteValue = useSyncExternalStore(
    subscribeRemote,
    remoteListSnapshot,
    () => EMPTY_LIST
  );
  return mode === "remote" ? remoteValue : localValue;
}

export function useSavedRecipe(id: string | null): {
  recipe: SavedRecipe | null;
  loaded: boolean;
} {
  const mode = useMode();
  useEffect(() => {
    if (mode === "remote" && !remoteMirror) void fetchRemoteList();
  }, [mode]);

  const localSnapshot = useCallback(
    () => (id ? getLocalMirror()[id] ?? null : null),
    [id]
  );
  const remoteSnapshot = useCallback(
    () => (id ? getRemoteMirror()[id] ?? null : null),
    [id]
  );
  const localValue = useSyncExternalStore(
    subscribeLocal,
    localSnapshot,
    () => null
  );
  const remoteValue = useSyncExternalStore(
    subscribeRemote,
    remoteSnapshot,
    () => null
  );
  const loaded = useSyncExternalStore(
    noopSubscribe,
    trueSnapshot,
    falseSnapshot
  );
  return {
    recipe: mode === "remote" ? remoteValue : localValue,
    loaded,
  };
}

// ─── Imperative writes ──────────────────────────────────────────────────────

export function isSignedInClient(): boolean {
  // Heuristic: check Auth.js cookie. Used by callers that aren't React hooks.
  if (typeof document === "undefined") return false;
  return /(?:^|; )(?:__Secure-)?authjs\.session-token=/.test(document.cookie);
}

export async function saveRecipe(card: CookCard): Promise<SavedRecipe> {
  if (isSignedInClient()) {
    const res = await fetch("/api/recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ card }),
    });
    if (!res.ok) throw new Error(`save failed: ${res.status}`);
    const { id } = (await res.json()) as { id: string };
    await fetchRemoteList();
    return remoteMirror?.[id] ?? {
      id,
      card,
      savedAt: Date.now(),
      lastCookedAt: null,
      cookCount: 0,
    };
  }
  // Local
  const id = recipeIdFor(card);
  const current = getLocalMirror();
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
  writeLocal({ ...current, [id]: entry });
  return entry;
}

export async function deleteRecipe(id: string): Promise<void> {
  if (isSignedInClient() && remoteMirror?.[id]) {
    await fetch(`/api/recipes/${id}`, { method: "DELETE" });
    await fetchRemoteList();
    return;
  }
  const current = getLocalMirror();
  if (!(id in current)) return;
  const { [id]: _removed, ...rest } = current;
  void _removed;
  writeLocal(rest);
}

export async function markCooked(id: string): Promise<void> {
  if (isSignedInClient() && remoteMirror?.[id]) {
    await fetch(`/api/recipes/${id}/cooked`, { method: "POST" });
    await fetchRemoteList();
    // Also clear remote mise checks (server does this; reflect locally)
    miseLocalMirror.set(id, new Set());
    miseListeners.get(id)?.forEach((cb) => cb());
    return;
  }
  const current = getLocalMirror();
  const r = current[id];
  if (!r) return;
  const updated: SavedRecipe = {
    ...r,
    lastCookedAt: Date.now(),
    cookCount: (r.cookCount ?? 0) + 1,
  };
  writeLocal({ ...current, [id]: updated });
  writeMiseLocal(id, new Set());
}

// ─── Mise en place checks ───────────────────────────────────────────────────

const MISE_PREFIX = "cookcard:v1:mise:";
const miseLocalMirror = new Map<string, Set<string>>();
const miseListeners = new Map<string, Set<() => void>>();

function readMiseLocal(recipeId: string): Set<string> {
  const cached = miseLocalMirror.get(recipeId);
  if (cached) return cached;
  let next = new Set<string>();
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(MISE_PREFIX + recipeId);
      if (raw) next = new Set(JSON.parse(raw) as string[]);
    } catch {}
  }
  miseLocalMirror.set(recipeId, next);
  return next;
}

function writeMiseLocal(recipeId: string, set: Set<string>) {
  miseLocalMirror.set(recipeId, set);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      MISE_PREFIX + recipeId,
      JSON.stringify([...set])
    );
  }
  miseListeners.get(recipeId)?.forEach((fn) => fn());
}

const remoteMiseFetched = new Set<string>();
async function fetchRemoteMise(recipeId: string) {
  if (remoteMiseFetched.has(recipeId)) return;
  remoteMiseFetched.add(recipeId);
  try {
    const res = await fetch(`/api/recipes/${recipeId}/mise`);
    if (!res.ok) return;
    const data = (await res.json()) as { checked: string[] };
    miseLocalMirror.set(recipeId, new Set(data.checked));
    miseListeners.get(recipeId)?.forEach((cb) => cb());
  } catch {}
}

export async function toggleMiseCheck(recipeId: string, entryKey: string) {
  const cur = readMiseLocal(recipeId);
  const next = new Set(cur);
  const turningOn = !next.has(entryKey);
  if (turningOn) next.add(entryKey);
  else next.delete(entryKey);
  writeMiseLocal(recipeId, next);
  if (isSignedInClient() && remoteMirror?.[recipeId]) {
    await fetch(`/api/recipes/${recipeId}/mise`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryKey, checked: turningOn }),
    }).catch(() => {});
  }
}

export async function clearMiseChecks(recipeId: string) {
  writeMiseLocal(recipeId, new Set());
  if (isSignedInClient() && remoteMirror?.[recipeId]) {
    await fetch(`/api/recipes/${recipeId}/mise`, { method: "DELETE" }).catch(
      () => {}
    );
  }
}

const EMPTY_SET: ReadonlySet<string> = new Set();

export function useMiseChecks(recipeId: string): ReadonlySet<string> {
  // Trigger a one-time fetch from the server for this recipe id.
  useEffect(() => {
    if (isSignedInClient()) void fetchRemoteMise(recipeId);
  }, [recipeId]);

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
  const snapshot = useCallback(() => readMiseLocal(recipeId), [recipeId]);
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY_SET);
}

// ─── Migration: push localStorage entries to server on first sign-in ────────

const SYNC_FLAG_KEY = "cookcard:v1:synced-to-cloud";

export async function syncLocalToCloud(): Promise<{
  pushed: number;
  total: number;
}> {
  const local = getLocalMirror();
  const entries = Object.values(local);
  let pushed = 0;
  for (const r of entries) {
    try {
      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ card: r.card }),
      });
      if (res.ok) pushed++;
    } catch {}
  }
  if (typeof window !== "undefined") {
    window.localStorage.setItem(SYNC_FLAG_KEY, String(Date.now()));
  }
  await fetchRemoteList();
  return { pushed, total: entries.length };
}

export function hasUnsyncedLocal(): boolean {
  if (typeof window === "undefined") return false;
  if (window.localStorage.getItem(SYNC_FLAG_KEY)) return false;
  return Object.keys(getLocalMirror()).length > 0;
}

// Imperative reads kept for non-hook callers (still local-mode only)
export function listRecipes(): SavedRecipe[] {
  return localListSnapshot();
}
export function getRecipe(id: string): SavedRecipe | null {
  return getLocalMirror()[id] ?? null;
}
export function isSaved(id: string): boolean {
  return getRecipe(id) !== null;
}
