import type { CookCard, Ingredient } from "@/app/types";
import { prisma } from "@/app/lib/prisma";
import { findSprite } from "@/app/lib/sprites-core";
import { parseQty, formatQty } from "@/app/lib/scale";

type Row = {
  slug: string | null;
  display: string;
  unit: string | null;
  numericTotal: number | null;
  rawParts: string[];
};

function rowKey(slug: string | null, display: string, unit: string | null): string {
  const base = slug ?? display.trim().toLowerCase();
  return `${base}|${(unit ?? "").trim().toLowerCase()}`;
}

export function aggregateGrocery(cards: CookCard[]): Row[] {
  const map = new Map<string, Row>();
  for (const card of cards) {
    const all: Ingredient[] = [
      ...card.pantry_ingredients,
      ...card.steps.flatMap((s) => s.ingredients),
    ];
    for (const ing of all) {
      const slug = findSprite(ing.item);
      const key = rowKey(slug, ing.item, ing.unit);
      let row = map.get(key);
      if (!row) {
        row = {
          slug,
          display: ing.item,
          unit: ing.unit,
          numericTotal: null,
          rawParts: [],
        };
        map.set(key, row);
      }
      const n = ing.quantity ? parseQty(ing.quantity) : null;
      if (n !== null) {
        row.numericTotal = (row.numericTotal ?? 0) + n;
      } else if (ing.quantity && !row.rawParts.includes(ing.quantity)) {
        row.rawParts.push(ing.quantity);
      }
    }
  }
  return [...map.values()].sort((a, b) =>
    (a.slug ?? a.display).localeCompare(b.slug ?? b.display)
  );
}

export function formatQuantity(row: Row): string | null {
  const parts: string[] = [];
  if (row.numericTotal !== null) parts.push(formatQty(row.numericTotal));
  if (row.unit) parts.push(row.unit);
  const main = parts.join(" ").trim();
  const extras = row.rawParts.join(" + ");
  if (main && extras) return `${main} (+ ${extras})`;
  return main || extras || null;
}

// Rebuild GroceryItem rows for a plan from its currently-QUEUED PlannedMeals.
// Preserves `purchased` flags for rows whose (slug|display, unit) key still
// matches an aggregated row. Removed rows are deleted — even if previously
// purchased — because if no committed meal needs it, it doesn't belong on
// the list any more.
export async function rebuildGroceryForPlan(planId: string): Promise<void> {
  const meals = await prisma.plannedMeal.findMany({
    where: { planId, status: "QUEUED" },
    include: { candidate: { select: { composedCardDraft: true } } },
  });

  const cards = meals
    .map((m) => m.candidate.composedCardDraft as unknown as CookCard | null)
    .filter((c): c is CookCard => !!c && Array.isArray(c.steps));

  const desired = aggregateGrocery(cards);

  const existing = await prisma.groceryItem.findMany({ where: { planId } });
  const byKey = new Map(existing.map((g) => [rowKey(g.slug, g.display, g.unit), g]));
  const desiredKeys = new Set<string>();

  for (const row of desired) {
    const key = rowKey(row.slug, row.display, row.unit);
    desiredKeys.add(key);
    const prior = byKey.get(key);
    const quantity = formatQuantity(row);
    if (prior) {
      if (prior.quantity !== quantity || prior.display !== row.display) {
        await prisma.groceryItem.update({
          where: { id: prior.id },
          data: { quantity, display: row.display },
        });
      }
    } else {
      await prisma.groceryItem.create({
        data: {
          planId,
          slug: row.slug,
          display: row.display,
          unit: row.unit,
          quantity,
        },
      });
    }
  }

  const toDelete = existing.filter((g) => !desiredKeys.has(rowKey(g.slug, g.display, g.unit)));
  if (toDelete.length) {
    await prisma.groceryItem.deleteMany({
      where: { id: { in: toDelete.map((g) => g.id) } },
    });
  }
}
