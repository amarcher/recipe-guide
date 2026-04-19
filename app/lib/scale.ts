const VULGAR_TO_DEC: Record<string, number> = {
  "½": 0.5,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "¼": 0.25,
  "¾": 0.75,
  "⅛": 0.125,
  "⅜": 0.375,
  "⅝": 0.625,
  "⅞": 0.875,
};

const FRAC_NEAREST: Array<[string, number]> = [
  ["⅛", 0.125],
  ["¼", 0.25],
  ["⅓", 1 / 3],
  ["⅜", 0.375],
  ["½", 0.5],
  ["⅝", 0.625],
  ["⅔", 2 / 3],
  ["¾", 0.75],
  ["⅞", 0.875],
];

export function parseQty(qty: string): number | null {
  let s = qty.trim();
  for (const [v, d] of Object.entries(VULGAR_TO_DEC)) {
    s = s.split(v).join(` ${d} `);
  }
  s = s.replace(/\s+/g, " ").trim();
  // mixed: "1 1/2" or "1 0.5"
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)/);
  if (mixed) {
    return parseInt(mixed[1], 10) + parseInt(mixed[2], 10) / parseInt(mixed[3], 10);
  }
  const mixedDec = s.match(/^(\d+)\s+([\d.]+)/);
  if (mixedDec && parseFloat(mixedDec[2]) < 1) {
    return parseInt(mixedDec[1], 10) + parseFloat(mixedDec[2]);
  }
  const frac = s.match(/^(\d+)\/(\d+)/);
  if (frac) return parseInt(frac[1], 10) / parseInt(frac[2], 10);
  const dec = s.match(/^([\d.]+)/);
  if (dec) return parseFloat(dec[1]);
  return null;
}

export function formatQty(n: number): string {
  if (!isFinite(n)) return "";
  if (n === 0) return "0";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const whole = Math.floor(abs);
  const frac = abs - whole;
  if (frac < 0.02) return `${sign}${whole}`;
  if (frac > 0.98) return `${sign}${whole + 1}`;
  const TOL = 0.03;
  for (const [s, v] of FRAC_NEAREST) {
    if (Math.abs(frac - v) < TOL) {
      return whole > 0 ? `${sign}${whole} ${s}` : `${sign}${s}`;
    }
  }
  // Fallback: 1 decimal place trimmed
  const dec = abs.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  return `${sign}${dec}`;
}

export function scaleQty(qty: string | null, factor: number): string | null {
  if (qty == null) return qty;
  if (factor === 1) return qty;
  const trimmed = qty.trim();
  if (!trimmed) return qty;
  // Range handling like "8-10" or "8–10"
  const range = trimmed.match(/^(\S+)\s*[-–]\s*(\S+)(.*)$/);
  if (range) {
    const a = parseQty(range[1]);
    const b = parseQty(range[2]);
    if (a !== null && b !== null) {
      return `${formatQty(a * factor)}–${formatQty(b * factor)}${range[3] ?? ""}`;
    }
  }
  const n = parseQty(trimmed);
  if (n === null) return qty;
  // Preserve trailing non-numeric tail (e.g. "28-oz" → no, that's a range. "1.5L"?). Match leading number.
  const tail = trimmed.replace(/^[\d./\s½⅓⅔¼¾⅛⅜⅝⅞]+/, "").trim();
  const scaled = formatQty(n * factor);
  return tail ? `${scaled} ${tail}` : scaled;
}

export function scaleServings(servings: string | null, factor: number): string | null {
  if (!servings || factor === 1) return servings;
  return servings.replace(/(\d+(?:\.\d+)?)(?:\s*[-–]\s*(\d+(?:\.\d+)?))?/, (_, a, b) => {
    const lo = parseFloat(a) * factor;
    if (b) {
      const hi = parseFloat(b) * factor;
      return `${formatQty(lo)}–${formatQty(hi)}`;
    }
    return formatQty(lo);
  });
}
