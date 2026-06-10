export type PantryItemDTO = {
  id: string;
  display: string;
  slug: string | null;
  unit: string | null;
  quantity: string | null;
  mustUseBy: number | null;
  addedAt: number;
  source: string;
  addedByName: string | null;
};

type PantryItemRowLike = {
  id: string;
  display: string;
  slug: string | null;
  unit: string | null;
  quantity: string | null;
  mustUseBy: Date | null;
  addedAt: Date;
  source: string;
  addedBy?: { name: string | null } | null;
};

export function serializePantryItem(row: PantryItemRowLike): PantryItemDTO {
  return {
    id: row.id,
    display: row.display,
    slug: row.slug,
    unit: row.unit,
    quantity: row.quantity,
    mustUseBy: row.mustUseBy ? row.mustUseBy.getTime() : null,
    addedAt: row.addedAt.getTime(),
    source: row.source,
    addedByName: row.addedBy?.name ?? null,
  };
}
