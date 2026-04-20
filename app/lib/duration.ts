// Parse a freeform duration string. Two failure modes we handle here:
//   "1 hour 30 minutes"                    → compound, sum to 90 min
//   "at least 30 minutes, up to 24 hours"  → range, low=30, high=1440
//
// We disambiguate by inspecting the text BETWEEN consecutive matches: if it
// contains a range word ("to", "or", "up to", "at least", "between", an em
// or en dash), we treat the matches as bounds; otherwise we sum them.

const TOKEN_RE =
  /(\d+(?:\.\d+)?)(?:\s*(?:to|[-–])\s*(\d+(?:\.\d+)?))?\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\b/g;

const RANGE_BETWEEN_RE =
  /\b(to|or|up to|at least|maximum|max|minimum|min|between|until|through|upto)\b|[–-]/;

type Token = {
  low: number;
  high: number;
  index: number;
  end: number;
};

function tokenize(s: string): Token[] {
  const tokens: Token[] = [];
  for (const m of s.matchAll(TOKEN_RE)) {
    const a = parseFloat(m[1]);
    const b = m[2] ? parseFloat(m[2]) : a;
    const u = m[3];
    const mult = u.startsWith("h") ? 60 : u.startsWith("s") ? 1 / 60 : 1;
    const idx = m.index ?? 0;
    tokens.push({
      low: a * mult,
      high: b * mult,
      index: idx,
      end: idx + m[0].length,
    });
  }
  return tokens;
}

function tokensAreRange(text: string, tokens: Token[]): boolean {
  for (let i = 0; i < tokens.length - 1; i++) {
    const between = text.slice(tokens[i].end, tokens[i + 1].index);
    if (RANGE_BETWEEN_RE.test(between)) return true;
  }
  return false;
}

export function parseMinutesRange(
  d: string | null
): { low: number; high: number } | null {
  if (!d) return null;
  const lower = d.toLowerCase();
  const tokens = tokenize(lower);
  if (tokens.length === 0) return null;
  if (tokens.length === 1) return { low: tokens[0].low, high: tokens[0].high };
  if (tokensAreRange(lower, tokens)) {
    return {
      low: tokens[0].low,
      high: tokens[tokens.length - 1].high,
    };
  }
  // Compound: sum all parts.
  let low = 0;
  let high = 0;
  for (const t of tokens) {
    low += t.low;
    high += t.high;
  }
  return { low, high };
}

// Midpoint helper for the timeline strip.
export function parseMinutes(d: string | null): number | null {
  const r = parseMinutesRange(d);
  return r ? (r.low + r.high) / 2 : null;
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
