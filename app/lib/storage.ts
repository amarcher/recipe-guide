"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useSession } from "next-auth/react";
import type { CookCard } from "@/app/types";
import type { PivotMetaClient } from "@/app/lib/pivot/meta";

export type ViewerAccess = "owner" | "family" | "guest";

export type SavedRecipe = {
  id: string;
  card: CookCard;
  savedAt: number;
  lastCookedAt: number | null;
  cookCount: number;
  family?: { id: string; name: string } | null;
  photoUrl?: string | null;
  videoUrl?: string | null;
  videoAspectRatio?: number | null;
  fromInstagram?: boolean;
  // Populated only by single-fetch (the library list never returns guest rows
  // because it filters to scopes the viewer is in). Undefined ⇒ owner-or-family.
  viewerAccess?: ViewerAccess;
  overrideUpdatedAt?: number | null;
  // Pivot fork tracking — set on rows created via the "Stuck? Adapt the
  // recipe" mid-cook flow. pivotMeta is null on non-pivot rows; pivotKept
  // flips to true at end-of-cook when the user keeps the pivot.
  pivotMeta?: PivotMetaClient | null;
  pivotKept?: boolean;
  pivotedFromSavedRecipeId?: string | null;
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
  localVersion++;
  localListeners.forEach((fn) => fn());
}

let localVersion = 0;
const localByUrlCache = new Map<string, { v: number; arr: SavedRecipe[] }>();
function localSavesByUrl(url: string): SavedRecipe[] {
  const c = localByUrlCache.get(url);
  if (c && c.v === localVersion) return c.arr;
  const arr = Object.values(getLocalMirror()).filter(
    (r) => r.card.source_url === url
  );
  localByUrlCache.set(url, { v: localVersion, arr });
  return arr;
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
  remoteVersion++;
  remoteListeners.forEach((fn) => fn());
}

let remoteVersion = 0;
const remoteByUrlCache = new Map<string, { v: number; arr: SavedRecipe[] }>();
function remoteSavesByUrl(url: string): SavedRecipe[] {
  const c = remoteByUrlCache.get(url);
  if (c && c.v === remoteVersion) return c.arr;
  const arr = Object.values(getRemoteMirror()).filter(
    (r) => r.card.source_url === url
  );
  remoteByUrlCache.set(url, { v: remoteVersion, arr });
  return arr;
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
  photoUrl?: string | null;
  videoUrl?: string | null;
  videoAspectRatio?: number | null;
  fromInstagram?: boolean;
  viewerAccess?: ViewerAccess;
  overrideUpdatedAt?: number | null;
  pivotMeta?: PivotMetaClient | null;
  pivotKept?: boolean;
  pivotedFromSavedRecipeId?: string | null;
};

function serverToLocal(r: ServerRecipeRow): SavedRecipe {
  return {
    id: r.id,
    card: r.card,
    savedAt: r.savedAt,
    lastCookedAt: r.lastCookedAt,
    cookCount: r.cookCount,
    family: r.family,
    photoUrl: r.photoUrl ?? null,
    videoUrl: r.videoUrl ?? null,
    videoAspectRatio: r.videoAspectRatio ?? null,
    fromInstagram: !!r.fromInstagram,
    viewerAccess: r.viewerAccess,
    overrideUpdatedAt: r.overrideUpdatedAt ?? null,
    pivotMeta: r.pivotMeta ?? null,
    pivotKept: r.pivotKept ?? false,
    pivotedFromSavedRecipeId: r.pivotedFromSavedRecipeId ?? null,
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
  const refetchedFor = useRef<string | null>(null);
  useEffect(() => {
    if (mode !== "remote" || !id) return;
    if (!remoteMirror) {
      void fetchRemoteList();
      return;
    }
    // Mirror exists but the id isn't in it — likely just materialized from
    // the planner. Fetch the single row directly and inject into the mirror.
    if (!remoteMirror[id] && refetchedFor.current !== id) {
      refetchedFor.current = id;
      void fetchOneIntoMirror(id);
    }
  }, [mode, id]);

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
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    trueSnapshot,
    falseSnapshot
  );

  // Subscribe to a tiny "did we finish the single-row fetch for this id" flag
  // so we can show Loading while it's in flight and only show the missing-
  // recipe state after the fetch has settled.
  const singleFetchDone = useSyncExternalStore(
    subscribeRemote,
    useCallback(
      () => (id ? attemptedSingleFetch.has(id) : true),
      [id]
    ),
    trueSnapshot
  );

  const remoteFetchPending =
    mode === "remote" && !!id && !remoteValue && !singleFetchDone;
  const loaded = hydrated && !remoteFetchPending;

  return {
    recipe: mode === "remote" ? remoteValue : localValue,
    loaded,
  };
}

// Look up every save matching this card's sourceUrl across all scopes the
// current viewer has access to. Bridges the local-hash / server-cuid id
// mismatch — pass the raw card and we figure out where it lives.
//
// Pivot rows are excluded — the SaveBar consumer treats this as "which of
// my libraries is this recipe in?" and a pivot is a separate, ephemeral
// fork rather than a saved-here scope. Pivot rendering happens through
// the rolodex (which iterates useSavedRecipes) and through the badge on
// the pivot's own recipe page.
export function useSavesForCard(card: { source_url: string }): SavedRecipe[] {
  const mode = useMode();
  useEffect(() => {
    if (mode === "remote" && !remoteMirror) void fetchRemoteList();
  }, [mode]);

  const localSnapshot = useCallback(
    () => filterOutPivots(localSavesByUrl(card.source_url)),
    [card.source_url]
  );
  const remoteSnapshot = useCallback(
    () => filterOutPivots(remoteSavesByUrl(card.source_url)),
    [card.source_url]
  );

  const localValue = useSyncExternalStore(
    subscribeLocal,
    localSnapshot,
    () => EMPTY_LIST
  );
  const remoteValue = useSyncExternalStore(
    subscribeRemote,
    remoteSnapshot,
    () => EMPTY_LIST
  );
  return mode === "remote" ? remoteValue : localValue;
}

const filterOutPivotsCache = new WeakMap<SavedRecipe[], SavedRecipe[]>();
function filterOutPivots(arr: SavedRecipe[]): SavedRecipe[] {
  // useSyncExternalStore demands a stable snapshot reference between calls
  // when nothing changed. Fast path: when the input has no pivots, return
  // the input reference itself. Slow path: cache the filtered copy keyed
  // by the input array so repeated reads hand back the same reference.
  let hasPivot = false;
  for (const r of arr) {
    if (r.pivotMeta) { hasPivot = true; break; }
  }
  if (!hasPivot) return arr;
  const cached = filterOutPivotsCache.get(arr);
  if (cached) return cached;
  const next = arr.filter((r) => !r.pivotMeta);
  filterOutPivotsCache.set(arr, next);
  return next;
}

// ─── Imperative writes ──────────────────────────────────────────────────────

// Tracks whether we should hit the server. Set explicitly via setSignedIn()
// (called from a SessionGate client component) so we don't depend on cookie
// sniffing that can silently mis-route saves to localStorage in production.
let signedInHint = false;
export function setSignedIn(v: boolean) {
  signedInHint = v;
}
export function isSignedInClient(): boolean {
  return signedInHint;
}

// `scopes`: list of (familyId | null), where null = personal library.
// If omitted or empty, defaults to a single null (personal) save. Each scope
// is a separate SavedRecipe row; the server upsert dedupes idempotently.
// Returns the FIRST saved row (used for navigation after save).
export async function saveRecipe(
  card: CookCard,
  options?: { scopes?: Array<string | null>; familyId?: string | null }
): Promise<SavedRecipe> {
  const scopes =
    options?.scopes && options.scopes.length > 0
      ? options.scopes
      : [options?.familyId ?? null];

  if (isSignedInClient()) {
    const ids = await Promise.all(
      scopes.map(async (familyId) => {
        const res = await fetch("/api/recipes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ card, familyId }),
        });
        if (!res.ok) throw new Error(`save failed: ${res.status}`);
        const { id } = (await res.json()) as { id: string };
        return id;
      })
    );
    await fetchRemoteList();
    const firstId = ids[0];
    return remoteMirror?.[firstId] ?? {
      id: firstId,
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

export type PatchResult =
  | { ok: true; overrideUpdatedAt: number }
  | { ok: false; conflict: true; currentUpdatedAt: number }
  | { ok: false; error: string };

// Persist edits as a per-scope override. Pass `ifMatch` (the SavedRecipe's
// current overrideUpdatedAt) to opt into optimistic concurrency — the server
// returns 409 if another writer landed first, surfaced here as
// `{ ok: false, conflict: true }` so the UI can prompt the user to reload.
export async function patchRecipe(
  id: string,
  card: CookCard,
  ifMatch?: number | null
): Promise<PatchResult> {
  if (!isSignedInClient()) return { ok: false, error: "not signed in" };
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (ifMatch != null) headers["If-Match"] = String(ifMatch);
  const res = await fetch(`/api/recipes/${id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(card),
  });
  if (res.status === 409) {
    const body = (await res.json().catch(() => ({}))) as {
      currentUpdatedAt?: number;
    };
    return {
      ok: false,
      conflict: true,
      currentUpdatedAt: body.currentUpdatedAt ?? 0,
    };
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: body.error ?? `${res.status}` };
  }
  const body = (await res.json()) as { ok: true; overrideUpdatedAt: number };
  if (remoteMirror?.[id]) {
    remoteMirror = {
      ...remoteMirror,
      [id]: { ...remoteMirror[id], card, overrideUpdatedAt: body.overrideUpdatedAt },
    };
    notifyRemote();
  }
  return { ok: true, overrideUpdatedAt: body.overrideUpdatedAt };
}

// "Save a copy to my library" for non-owner viewers. Server seeds a new
// SavedRecipe in the viewer's personal scope, plus a personal override
// matching what the visitor was looking at, and returns the new id. We
// re-fetch the library list so the new row is visible immediately.
export async function forkRecipe(
  id: string
): Promise<{ id: string; alreadyExisted: boolean } | { error: string }> {
  if (!isSignedInClient()) return { error: "not signed in" };
  const res = await fetch(`/api/recipes/${id}/fork`, { method: "POST" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return { error: body.error ?? `${res.status}` };
  }
  const body = (await res.json()) as { id: string; alreadyExisted: boolean };
  await fetchRemoteList();
  return body;
}

// Resolve an in-progress pivot fork. "keep" promotes it to a permanent
// personal recipe (pivotKept = true); "discard" deletes it. Returns true
// on success so callers can drive their own UI state machines.
export async function decidePivot(
  id: string,
  action: "keep" | "discard"
): Promise<boolean> {
  if (!isSignedInClient()) return false;
  const res = await fetch(`/api/recipes/${id}/pivot/decision`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  if (!res.ok) return false;
  if (action === "discard") {
    // Mirror the server: drop the row from the local mirror so the rolodex
    // reflects the deletion immediately without waiting for a refetch.
    if (remoteMirror?.[id]) {
      const { [id]: _removed, ...rest } = remoteMirror;
      void _removed;
      remoteMirror = rest;
      notifyRemote();
    }
  } else {
    // keep: refresh just this row so pivotKept flips and the badge clears.
    attemptedSingleFetch.delete(id);
    await fetchOneIntoMirror(id);
  }
  return true;
}

// "Replace original." Folds a pivot fork back onto its parent: the revised
// card becomes the parent's override (at the parent's scope), cook history
// moves over, and the pivot row is deleted. Returns the parent id so the
// caller can navigate there, or an error message for the banner to show.
export async function promotePivot(
  id: string
): Promise<{ parentId: string; scope: "personal" | "family" } | { error: string }> {
  if (!isSignedInClient()) return { error: "not signed in" };
  const res = await fetch(`/api/recipes/${id}/pivot/promote`, { method: "POST" });
  const body = (await res.json().catch(() => ({}))) as {
    parentSavedRecipeId?: string;
    scope?: "personal" | "family";
    error?: string;
  };
  if (!res.ok || !body.parentSavedRecipeId) {
    return { error: body.error ?? `${res.status}` };
  }
  if (remoteMirror?.[id]) {
    const { [id]: _removed, ...rest } = remoteMirror;
    void _removed;
    remoteMirror = rest;
    notifyRemote();
  }
  attemptedSingleFetch.delete(body.parentSavedRecipeId);
  await fetchOneIntoMirror(body.parentSavedRecipeId);
  return { parentId: body.parentSavedRecipeId, scope: body.scope ?? "personal" };
}

// Drop the scope's override row, reverting to the canonical parsed card.
export async function resetRecipeOverride(id: string): Promise<boolean> {
  if (!isSignedInClient()) return false;
  const res = await fetch(`/api/recipes/${id}/override`, { method: "DELETE" });
  if (!res.ok) return false;
  attemptedSingleFetch.delete(id);
  await fetchOneIntoMirror(id);
  return true;
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

export async function markCooked(
  id: string
): Promise<{ cookLogId: string | null }> {
  if (isSignedInClient() && remoteMirror?.[id]) {
    const res = await fetch(`/api/recipes/${id}/cooked`, { method: "POST" });
    let cookLogId: string | null = null;
    if (res.ok) {
      const body = (await res
        .json()
        .catch(() => ({}))) as { cookLogId?: string };
      cookLogId = body.cookLogId ?? null;
    }
    await fetchRemoteList();
    // Also clear remote mise checks (server does this; reflect locally)
    miseLocalMirror.set(id, new Set());
    miseListeners.get(id)?.forEach((cb) => cb());
    return { cookLogId };
  }
  const current = getLocalMirror();
  const r = current[id];
  if (r) {
    const updated: SavedRecipe = {
      ...r,
      lastCookedAt: Date.now(),
      cookCount: (r.cookCount ?? 0) + 1,
    };
    writeLocal({ ...current, [id]: updated });
  }
  writeMiseLocal(id, new Set());
  return { cookLogId: null };
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

// Roadmap item 2.14 — invalidate the per-recipe fetch flag so the next
// caller re-fetches. Used by the family-event consumer when another member
// checks an ingredient: drop the cache, refetch, paint.
export async function refreshRemoteMise(recipeId: string): Promise<void> {
  remoteMiseFetched.delete(recipeId);
  await fetchRemoteMise(recipeId);
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
// Force-refresh the remote mirror. Use when a server-side action creates a
// new SavedRecipe the client needs to see before navigating.
export async function refreshSavedRecipes(): Promise<void> {
  if (!isSignedInClient()) return;
  remoteFetchInflight = null;
  await fetchRemoteList();
}

// Ids we've attempted to single-fetch this page-lifetime. The hook uses this
// to distinguish "haven't looked yet" (keep showing Loading) from "looked and
// it really isn't there" (show missing-recipe state).
const attemptedSingleFetch = new Set<string>();

// Fetch a single saved recipe by id and merge it into the remote mirror.
// Used when the mirror is stale (e.g. just after materializing a planner
// candidate) and we need the new recipe to appear without a full list refetch.
async function fetchOneIntoMirror(id: string): Promise<void> {
  try {
    const res = await fetch(`/api/recipes/${id}`);
    if (res.ok) {
      const body = (await res.json()) as ServerRecipeRow;
      const next = { ...(remoteMirror ?? {}), [id]: serverToLocal(body) };
      remoteMirror = next;
    }
  } catch {
    // ignore — will mark attempted below so UI falls through to missing state
  } finally {
    attemptedSingleFetch.add(id);
    notifyRemote();
  }
}

export function listRecipes(): SavedRecipe[] {
  return localListSnapshot();
}
export function getRecipe(id: string): SavedRecipe | null {
  return getLocalMirror()[id] ?? null;
}
export function isSaved(id: string): boolean {
  return getRecipe(id) !== null;
}
