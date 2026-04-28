import type { CookCard } from "@/app/types";

// Lightweight CookCard shape validation for the PATCH /api/recipes/[id]
// endpoint. Rejects any attempt to change source_url — that field is the
// canonical key into ParsedRecipe and must stay stable. Forking is the
// supported path when a viewer wants a different source.
export type CardValidation =
  | { ok: true; card: CookCard }
  | { ok: false; error: string };

export function validateCardPayload(
  body: unknown,
  canonicalSourceUrl: string
): CardValidation {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "missing card body" };
  }
  const c = body as Partial<CookCard>;
  if (typeof c.title !== "string" || !c.title.trim()) {
    return { ok: false, error: "title required" };
  }
  if (typeof c.source_url !== "string") {
    return { ok: false, error: "source_url required" };
  }
  if (c.source_url !== canonicalSourceUrl) {
    return { ok: false, error: "source_url is read-only — fork to change" };
  }
  if (!Array.isArray(c.steps) || !Array.isArray(c.pantry_ingredients)) {
    return { ok: false, error: "steps and pantry_ingredients must be arrays" };
  }
  if (!Array.isArray(c.equipment)) {
    return { ok: false, error: "equipment must be an array" };
  }
  return { ok: true, card: c as CookCard };
}
