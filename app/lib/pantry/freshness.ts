// Use-by freshness math for PantryItem.mustUseBy. Date-only semantics: a
// "use by Thursday" item is fine all of Thursday, so comparisons happen at
// local-midnight granularity, never raw timestamps.

export const NEAR_EXPIRY_DAYS = 3;

export type Freshness = "expired" | "today" | "soon" | "later" | "undated";

function startOfDay(d: Date | number): number {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function daysUntil(mustUseBy: Date | number, now: Date | number): number {
  return Math.round((startOfDay(mustUseBy) - startOfDay(now)) / 86_400_000);
}

export function classifyFreshness(
  mustUseBy: Date | number | null | undefined,
  now: Date | number,
  soonDays: number = NEAR_EXPIRY_DAYS,
): Freshness {
  if (mustUseBy == null) return "undated";
  const d = daysUntil(mustUseBy, now);
  if (d < 0) return "expired";
  if (d === 0) return "today";
  if (d <= soonDays) return "soon";
  return "later";
}

export function isNearExpiry(
  mustUseBy: Date | number | null | undefined,
  now: Date | number,
  soonDays: number = NEAR_EXPIRY_DAYS,
): boolean {
  const f = classifyFreshness(mustUseBy, now, soonDays);
  return f === "expired" || f === "today" || f === "soon";
}

export function freshnessLabel(
  mustUseBy: Date | number | null | undefined,
  now: Date | number,
): string | null {
  if (mustUseBy == null) return null;
  const d = daysUntil(mustUseBy, now);
  if (d < 0) return d === -1 ? "1 day past" : `${-d} days past`;
  if (d === 0) return "Use today";
  if (d === 1) return "Use by tomorrow";
  if (d <= NEAR_EXPIRY_DAYS) return `Use within ${d} days`;
  return `Use by ${new Date(mustUseBy).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}`;
}

// Dated items first (most urgent leading), undated last by recency of adding.
export function compareByUrgency(
  a: { mustUseBy: number | null; addedAt: number },
  b: { mustUseBy: number | null; addedAt: number },
): number {
  if (a.mustUseBy != null && b.mustUseBy != null) return a.mustUseBy - b.mustUseBy;
  if (a.mustUseBy != null) return -1;
  if (b.mustUseBy != null) return 1;
  return b.addedAt - a.addedAt;
}
