"use client";

import { useCallback, useSyncExternalStore } from "react";
import manifest from "@/sprites/manifest.json";

type SpriteEntry = {
  slug: string;
  label: string;
  aliases: string[];
};

const ENTRIES = (manifest.sprites as SpriteEntry[]).slice();
const ALIAS_INDEX: Array<{ alias: string; slug: string }> = [];
for (const e of ENTRIES) {
  for (const a of e.aliases) {
    ALIAS_INDEX.push({ alias: normalize(a), slug: e.slug });
  }
}
ALIAS_INDEX.sort((a, b) => b.alias.length - a.alias.length);

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[(),.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function findSprite(name: string): string | null {
  const n = normalize(name);
  if (!n) return null;
  for (const { alias, slug } of ALIAS_INDEX) {
    if (n.includes(alias)) return slug;
  }
  return null;
}

export function spriteUrl(slug: string): string {
  return `/sprites/${slug}.png`;
}

export function allSlugs(): string[] {
  return ENTRIES.map((e) => e.slug);
}

// ─── Cached URL lookups (stable references for useSyncExternalStore) ─────────

const staticUrlCache = new Map<string, string | null>();
function getStaticUrl(name: string): string | null {
  const norm = normalize(name);
  if (staticUrlCache.has(norm)) return staticUrlCache.get(norm) ?? null;
  const slug = findSprite(name);
  const url = slug ? spriteUrl(slug) : null;
  staticUrlCache.set(norm, url);
  return url;
}

// Dynamic cache — sprites generated at runtime via /api/sprites/discover.
// In-memory only for now; refresh = re-discover.
const dynamicMap = new Map<string, string>();
const listeners = new Set<() => void>();
const inFlight = new Set<string>();

function notify() {
  listeners.forEach((cb) => cb());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getEffectiveUrl(name: string): string | null {
  const norm = normalize(name);
  const dyn = dynamicMap.get(norm);
  if (dyn) return dyn;
  return getStaticUrl(name);
}

export function useSpriteUrl(name: string): string | null {
  const snapshot = useCallback(() => getEffectiveUrl(name), [name]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

// Imperative read for non-React callers.
export function lookupSpriteUrl(name: string): string | null {
  return getEffectiveUrl(name);
}

// ─── Discovery — batch-request missing sprites from the server ──────────────

export async function discoverSprites(names: string[]): Promise<void> {
  const fresh: string[] = [];
  const seen = new Set<string>();
  for (const raw of names) {
    const name = (raw ?? "").trim();
    if (!name) continue;
    const norm = normalize(name);
    if (seen.has(norm)) continue;
    seen.add(norm);
    if (dynamicMap.has(norm)) continue;
    if (inFlight.has(norm)) continue;
    if (getStaticUrl(name)) continue;
    fresh.push(name);
    inFlight.add(norm);
  }
  if (fresh.length === 0) return;

  try {
    const res = await fetch("/api/sprites/discover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ names: fresh }),
    });
    if (!res.ok) return;
    const data = (await res.json()) as {
      results: Record<string, { url?: string; error?: string }>;
    };
    let any = false;
    for (const [name, result] of Object.entries(data.results ?? {})) {
      if (result?.url) {
        dynamicMap.set(normalize(name), result.url);
        any = true;
      }
    }
    if (any) notify();
  } catch {
    // ignore — sprites just won't appear; fallback chips remain
  } finally {
    fresh.forEach((n) => inFlight.delete(normalize(n)));
  }
}
