// Parse a freeform duration like "10-15 minutes", "1 hour", "30 sec",
// "until golden" → null. Returns minutes (midpoint of any range).
export function parseMinutes(d: string | null): number | null {
  if (!d) return null;
  const lower = d.toLowerCase();
  const re = /(\d+(?:\.\d+)?)(?:\s*(?:to|[-–])\s*(\d+(?:\.\d+)?))?\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\b/g;
  let total = 0;
  let matched = false;
  for (const m of lower.matchAll(re)) {
    matched = true;
    const a = parseFloat(m[1]);
    const b = m[2] ? parseFloat(m[2]) : a;
    const mid = (a + b) / 2;
    const u = m[3];
    if (u.startsWith("h")) total += mid * 60;
    else if (u.startsWith("s")) total += mid / 60;
    else total += mid;
  }
  return matched ? total : null;
}

// Parse a duration to {low, high} minutes. Single value → low === high.
export function parseMinutesRange(
  d: string | null
): { low: number; high: number } | null {
  if (!d) return null;
  const lower = d.toLowerCase();
  const re = /(\d+(?:\.\d+)?)(?:\s*(?:to|[-–])\s*(\d+(?:\.\d+)?))?\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\b/g;
  let low = 0;
  let high = 0;
  let matched = false;
  for (const m of lower.matchAll(re)) {
    matched = true;
    const a = parseFloat(m[1]);
    const b = m[2] ? parseFloat(m[2]) : a;
    const u = m[3];
    const mult = u.startsWith("h") ? 60 : u.startsWith("s") ? 1 / 60 : 1;
    low += a * mult;
    high += b * mult;
  }
  return matched ? { low, high } : null;
}

export function formatClock(secondsRemaining: number): string {
  const s = Math.max(0, Math.ceil(secondsRemaining));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function formatMinutes(min: number): string {
  if (min < 1) return `${Math.round(min * 60)}s`;
  if (min < 60) return `${Math.round(min)}m`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
