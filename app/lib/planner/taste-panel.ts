// Read-side helpers for surfacing ProfilePreference + MealOutcome data.
// Prisma-free so vitest can import without the path-alias trap.

export type TastePrefKind =
  | "RELIABLE_HIT"
  | "EXPERIMENTING"
  | "HARD_NO"
  | "ASPIRATION";

export type TastePref = {
  id: string;
  kind: TastePrefKind;
  slug: string | null;
  display: string;
  source: string;
  lastConfirmedAt: number;
  evidenceCount: number;
};

export type TasteBuckets = {
  reliable: TastePref[];
  experimenting: TastePref[];
  hardNos: TastePref[];
  aspirations: TastePref[];
};

function byStrength(a: TastePref, b: TastePref): number {
  return (
    b.evidenceCount - a.evidenceCount ||
    b.lastConfirmedAt - a.lastConfirmedAt ||
    a.display.localeCompare(b.display)
  );
}

export function groupPreferences(prefs: TastePref[]): TasteBuckets {
  const buckets: TasteBuckets = {
    reliable: [],
    experimenting: [],
    hardNos: [],
    aspirations: [],
  };
  for (const p of prefs) {
    if (p.kind === "RELIABLE_HIT") buckets.reliable.push(p);
    else if (p.kind === "EXPERIMENTING") buckets.experimenting.push(p);
    else if (p.kind === "HARD_NO") buckets.hardNos.push(p);
    else buckets.aspirations.push(p);
  }
  buckets.reliable.sort(byStrength);
  buckets.experimenting.sort(byStrength);
  buckets.hardNos.sort(byStrength);
  buckets.aspirations.sort(byStrength);
  return buckets;
}

function count(n: number, singular: string, plural: string): string | null {
  if (n === 0) return null;
  return `${n} ${n === 1 ? singular : plural}`;
}

export function tasteSummary(prefs: TastePref[]): string {
  const b = groupPreferences(prefs);
  return [
    count(b.reliable.length, "reliable hit", "reliable hits"),
    count(b.experimenting.length, "experimenting", "experimenting"),
    count(b.hardNos.length, "hard no", "hard nos"),
  ]
    .filter((s): s is string => s !== null)
    .join(" · ");
}

const DAY_MS = 86_400_000;

export function recencyLabel(thenMs: number, nowMs: number): string {
  const days = Math.floor((nowMs - thenMs) / DAY_MS);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days}d ago`;
  if (days < 61) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30.44)}mo ago`;
  return "over a year ago";
}

export function sourceLabel(source: string): string {
  if (source === "intake") return "from your intake chat";
  if (source === "outcome") return "learned from meal check-ins";
  return `from ${source}`;
}

export type OutcomeVerdict = "ATE" | "PICKED" | "REFUSED";

export type OutcomeSnapshot = {
  eaterRole: "ADULT" | "KID";
  verdict: OutcomeVerdict;
  createdAt: number;
};

export type RoleVerdicts = {
  adult: OutcomeVerdict | null;
  kid: OutcomeVerdict | null;
  recordedAt: number | null;
};

export function latestVerdictsByRole(rows: OutcomeSnapshot[]): RoleVerdicts {
  let adult: OutcomeSnapshot | null = null;
  let kid: OutcomeSnapshot | null = null;
  for (const r of rows) {
    if (r.eaterRole === "ADULT" && (!adult || r.createdAt > adult.createdAt)) {
      adult = r;
    }
    if (r.eaterRole === "KID" && (!kid || r.createdAt > kid.createdAt)) {
      kid = r;
    }
  }
  const stamps = [adult?.createdAt, kid?.createdAt].filter(
    (t): t is number => typeof t === "number",
  );
  return {
    adult: adult?.verdict ?? null,
    kid: kid?.verdict ?? null,
    recordedAt: stamps.length ? Math.max(...stamps) : null,
  };
}

export const VERDICT_PHRASE: Record<OutcomeVerdict, string> = {
  ATE: "loved it",
  PICKED: "picked at it",
  REFUSED: "refused it",
};

export function previousVerdictSummary(prev: {
  adult: OutcomeVerdict | null;
  kid: OutcomeVerdict | null;
}): string {
  const parts: string[] = [];
  if (prev.adult) parts.push(`Adults ${VERDICT_PHRASE[prev.adult]}`);
  if (prev.kid) parts.push(`Kids ${VERDICT_PHRASE[prev.kid]}`);
  return parts.join(" · ");
}
