import manifest from "@/sprites/manifest.json";

type SpriteEntry = {
  slug: string;
  label: string;
  aliases: string[];
};

// Pre-compute alias → slug map sorted longest alias first so "ground beef"
// matches before "beef" when both are present.
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
