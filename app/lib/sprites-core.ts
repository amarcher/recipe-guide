import manifest from "@/sprites/manifest.json";
import type { Aisle } from "./taxonomy";

type SpriteEntry = {
  slug: string;
  label: string;
  aliases: string[];
  url?: string;
  original_url?: string;
  aisle?: Aisle;
};

const ENTRIES = (manifest.sprites as SpriteEntry[]).slice();
const BY_SLUG = new Map<string, SpriteEntry>();
for (const e of ENTRIES) BY_SLUG.set(e.slug, e);
const ALIAS_INDEX: Array<{ alias: string; slug: string }> = [];
for (const e of ENTRIES) {
  for (const a of e.aliases) {
    ALIAS_INDEX.push({ alias: normalize(a), slug: e.slug });
  }
}
ALIAS_INDEX.sort((a, b) => b.alias.length - a.alias.length);

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[(),.]/g, " ")
    .replace(/[-_]/g, " ")
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

export function spriteUrl(slug: string): string | null {
  return BY_SLUG.get(slug)?.url ?? null;
}

export function spriteOriginalUrl(slug: string): string | null {
  return BY_SLUG.get(slug)?.original_url ?? null;
}

export function spriteAisle(slug: string | null): Aisle | null {
  if (!slug) return null;
  return BY_SLUG.get(slug)?.aisle ?? null;
}

export function aisleForName(name: string): Aisle | null {
  return spriteAisle(findSprite(name));
}

export function allSlugs(): string[] {
  return ENTRIES.map((e) => e.slug);
}
