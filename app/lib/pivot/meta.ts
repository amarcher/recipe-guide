import type { CookCard } from "@/app/types";

// Server-side shape of SavedRecipe.pivotMeta. The full revised card lives
// here so resolveCard can short-circuit on it without a separate column.
export type PivotMeta = {
  problemText: string;
  aiNotes: string;
  changes: string[];
  revisedCard: CookCard;
  createdAt: number;
};

// What the client actually needs for badge rendering + the keep/discard
// prompt. Drops revisedCard since the resolver already merged it into the
// SavedRecipe's `card` field on the API response.
export type PivotMetaClient = {
  problemText: string;
  aiNotes: string;
  changes: string[];
  createdAt: number;
};

export function slimPivotMetaForClient(value: unknown): PivotMetaClient | null {
  if (!value || typeof value !== "object") return null;
  const m = value as Partial<PivotMeta>;
  if (typeof m.problemText !== "string") return null;
  return {
    problemText: m.problemText,
    aiNotes: typeof m.aiNotes === "string" ? m.aiNotes : "",
    changes: Array.isArray(m.changes) ? m.changes.filter((c): c is string => typeof c === "string") : [],
    createdAt: typeof m.createdAt === "number" ? m.createdAt : 0,
  };
}
