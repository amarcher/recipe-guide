// Prisma-free, dependency-free static analyzer for LLM structured-output schemas.
//
// Anthropic's `output_config.format.schema` (what `generateObject` sends when
// the model is Claude) rejects a specific set of JSON-Schema constructs. The
// rules are documented in CLAUDE.md ("Anthropic structured output gotchas");
// this module encodes them so CI can fail a build the moment a banned construct
// slips into a schema that feeds `generateObject`.
//
// We analyze the *compiled JSON Schema* (via `z.toJSONSchema`) rather than Zod
// source text, because that is exactly the payload the model sees — a regex over
// `.int()` / `.min()` would both miss constructs (e.g. `.positive()` emitting
// `exclusiveMinimum`) and false-positive on harmless string-length bounds.
//
// Kept free of any Prisma / Next import so vitest can load it directly.

export type BannedRuleId =
  | "array-minItems-gt-1"
  | "array-maxItems"
  | "number-minimum"
  | "number-maximum"
  | "number-exclusiveMinimum"
  | "number-exclusiveMaximum"
  | "integer-type";

export interface Violation {
  schemaName: string;
  /** Path into the compiled schema, e.g. `properties.slots.items.properties.count`. */
  path: string;
  rule: BannedRuleId;
  message: string;
}

const STRING_LENGTH_KEYWORDS = new Set(["minLength", "maxLength"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function typeAllows(node: Record<string, unknown>, want: string): boolean {
  const t = node.type;
  if (t === undefined) return true; // untyped node — be conservative, treat as possible
  if (typeof t === "string") return t === want;
  if (Array.isArray(t)) return t.includes(want);
  return false;
}

/**
 * Walk a compiled JSON Schema object and collect every banned construct.
 *
 * Banned (per Anthropic's structured-output limits):
 *   - arrays: `minItems > 1`, any `maxItems`
 *   - numbers/integers: any `minimum` / `maximum` / `exclusiveMinimum` /
 *     `exclusiveMaximum` (covers `.min()` / `.max()` / `.gt()` / `.lt()` /
 *     `.positive()` / `.nonnegative()`)
 *   - `type: "integer"` (Zod's `.int()` — emits the type plus safe-integer bounds)
 *
 * Explicitly allowed and NOT flagged:
 *   - `minItems: 1` (Zod `.min(1)` on arrays is fine)
 *   - `minLength` / `maxLength` on strings
 *   - `minProperties` / `maxProperties` on objects
 */
export function analyzeJsonSchema(schemaName: string, root: unknown): Violation[] {
  const violations: Violation[] = [];

  const visit = (node: unknown, path: string): void => {
    if (Array.isArray(node)) {
      node.forEach((child, i) => visit(child, `${path}[${i}]`));
      return;
    }
    if (!isPlainObject(node)) return;

    const here = path || "<root>";

    // --- integer type (Zod `.int()`) ---
    if (node.type === "integer" || (Array.isArray(node.type) && node.type.includes("integer"))) {
      violations.push({
        schemaName,
        path: here,
        rule: "integer-type",
        message:
          "integer type (Zod `.int()`) is banned — use plain `z.number()` and coerce server-side",
      });
    }

    // --- number bounds (apply only when the node can be numeric) ---
    const numeric = typeAllows(node, "number") || typeAllows(node, "integer");
    if (numeric) {
      const numericBoundRules: Array<[string, BannedRuleId]> = [
        ["minimum", "number-minimum"],
        ["maximum", "number-maximum"],
        ["exclusiveMinimum", "number-exclusiveMinimum"],
        ["exclusiveMaximum", "number-exclusiveMaximum"],
      ];
      for (const [keyword, rule] of numericBoundRules) {
        if (keyword in node) {
          violations.push({
            schemaName,
            path: `${here}.${keyword}`,
            rule,
            message: `number bound \`${keyword}\` is banned (\`.min/.max/.gt/.lt/.positive/.nonnegative\`) — use plain \`z.number()\` and clamp server-side`,
          });
        }
      }
    }

    // --- array item bounds ---
    const isArray = typeAllows(node, "array") || "items" in node || "prefixItems" in node;
    if (isArray) {
      if (typeof node.maxItems === "number") {
        violations.push({
          schemaName,
          path: `${here}.maxItems`,
          rule: "array-maxItems",
          message:
            "`maxItems` is banned on arrays — express the upper bound in `.describe()` and the prompt",
        });
      }
      if (typeof node.minItems === "number" && node.minItems > 1) {
        violations.push({
          schemaName,
          path: `${here}.minItems`,
          rule: "array-minItems-gt-1",
          message: `minItems ${node.minItems} is banned — only \`.min(1)\` is allowed; express larger minimums in \`.describe()\` and the prompt`,
        });
      }
    }

    // --- recurse into every nested schema location ---
    for (const [key, value] of Object.entries(node)) {
      if (STRING_LENGTH_KEYWORDS.has(key)) continue;
      if (key === "enum" || key === "const") continue; // value lists, not sub-schemas
      visit(value, path ? `${path}.${key}` : key);
    }
  };

  visit(root, "");
  return violations;
}

export function formatViolations(violations: Violation[]): string {
  if (violations.length === 0) return "No banned LLM-schema constructs found.";
  const lines = violations.map(
    (v) => `  ✗ [${v.schemaName}] ${v.path}\n      ${v.rule}: ${v.message}`
  );
  return `Found ${violations.length} banned LLM-schema construct(s):\n${lines.join("\n")}`;
}
