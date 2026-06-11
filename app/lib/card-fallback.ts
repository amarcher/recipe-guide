// Read-time canonical fallback for frozen card snapshots.
//
// RecipeOverride.cardJson, pivotMeta.revisedCard, MealCandidate.composedCardDraft,
// and MenuItem.snapshotCardJson are all full-card copies frozen at write time.
// When ParsedRecipe.cardJson later gains a field (tagline, generated dish
// photo, whatever comes next), those snapshots silently shadow it forever —
// historically patched with per-field one-shot backfill scripts
// (backfill:taglines, backfill:override-dish-photos). This helper retires
// that pattern: at read time, any enrichment field the snapshot is missing
// falls through to the canonical card. No data migration, no writes.
//
// The split between "snapshot-owned" and "enrichment" is the load-bearing
// decision:
//
//   - SNAPSHOT_OWNED fields are the recipe's structure — what the user edits
//     in CookCardEditor and what a pivot deliberately rewrites. An empty or
//     null value there is a meaningful user state (e.g. servings unknown,
//     equipment cleared) and is NEVER resurrected from canonical.
//   - Everything else on the canonical card is presentation enrichment.
//     Missing (absent key, null, or blank string) falls through. New
//     ParsedRecipe fields get this behavior by default — add a field to
//     SNAPSHOT_OWNED only when users can intentionally clear it and that
//     clear must stick.
//
// Known trade-off: tagline is editable, so a user who deliberately blanks
// their tagline reads the canonical one again. We treat "cleared" as "reset
// to canonical" — the alternative (pre-tagline snapshots never showing a
// tagline) is the bug this exists to fix.
//
// Prisma-free on purpose so vitest can cover it (see card-scope.ts pattern).
import type { CookCard } from "@/app/types";

const SNAPSHOT_OWNED: ReadonlySet<string> = new Set([
  "title",
  "source_url",
  "servings",
  "total_time",
  "active_time",
  "equipment",
  "pantry_ingredients",
  "steps",
]);

function isMissing(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  return typeof value === "string" && value.trim().length === 0;
}

// Fill enrichment fields the snapshot lacks from the canonical card.
// Returns the snapshot unchanged (same reference) when nothing fell through.
export function applyCanonicalFallback(
  snapshot: CookCard,
  canonical: CookCard | null | undefined
): CookCard {
  if (!canonical) return snapshot;
  let merged: Record<string, unknown> | null = null;
  const snap = snapshot as unknown as Record<string, unknown>;
  const canon = canonical as unknown as Record<string, unknown>;
  for (const key of Object.keys(canon)) {
    if (SNAPSHOT_OWNED.has(key)) continue;
    if (isMissing(canon[key])) continue;
    if (!isMissing(snap[key])) continue;
    if (!merged) merged = { ...snap };
    merged[key] = canon[key];
  }
  return merged ? (merged as unknown as CookCard) : snapshot;
}
