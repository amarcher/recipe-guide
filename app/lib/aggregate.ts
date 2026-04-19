import type { CookCard, Ingredient } from "@/app/types";
import { findSprite } from "./sprites";
import { parseQty, formatQty, scaleQty } from "./scale";

export type MiseEntry = {
  key: string;
  item: string;
  unit: string | null;
  slug: string | null;
  // Best-effort summed quantity. null = no parseable numeric (e.g. "to taste").
  numericTotal: number | null;
  // Raw quantity strings (post-scale) shown as fallback if no numericTotal.
  rawParts: string[];
  prepHints: string[];
};

function keyFor(ing: Ingredient): string {
  const slug = findSprite(ing.item);
  const base = slug ?? ing.item.trim().toLowerCase();
  const unit = (ing.unit ?? "").trim().toLowerCase();
  return `${base}|${unit}`;
}

export function buildMise(card: CookCard, factor: number): MiseEntry[] {
  const all: Ingredient[] = [
    ...card.pantry_ingredients,
    ...card.steps.flatMap((s) => s.ingredients),
  ];

  const map = new Map<string, MiseEntry>();
  for (const ing of all) {
    const k = keyFor(ing);
    const slug = findSprite(ing.item);
    let entry = map.get(k);
    if (!entry) {
      entry = {
        key: k,
        item: ing.item,
        unit: ing.unit,
        slug,
        numericTotal: null,
        rawParts: [],
        prepHints: [],
      };
      map.set(k, entry);
    }
    if (ing.prep && !entry.prepHints.includes(ing.prep)) {
      entry.prepHints.push(ing.prep);
    }
    const n = ing.quantity ? parseQty(ing.quantity) : null;
    if (n !== null) {
      entry.numericTotal = (entry.numericTotal ?? 0) + n;
    } else if (ing.quantity) {
      const scaled = scaleQty(ing.quantity, factor);
      if (scaled && !entry.rawParts.includes(scaled)) entry.rawParts.push(scaled);
    }
  }

  // Apply scale to numericTotal here (we summed raw, then scale once).
  for (const entry of map.values()) {
    if (entry.numericTotal !== null) {
      entry.numericTotal = entry.numericTotal * factor;
    }
  }

  return [...map.values()].sort((a, b) => a.item.localeCompare(b.item));
}

export function formatMiseQuantity(entry: MiseEntry): string {
  const parts: string[] = [];
  if (entry.numericTotal !== null) {
    parts.push(formatQty(entry.numericTotal));
  }
  if (entry.unit) parts.push(entry.unit);
  const main = parts.join(" ").trim();
  const extras = entry.rawParts.join(" + ");
  if (main && extras) return `${main} (+ ${extras})`;
  return main || extras || "to taste";
}
