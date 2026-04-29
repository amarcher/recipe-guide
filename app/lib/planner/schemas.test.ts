import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  CandidatesForSlot,
  CookCardDraft,
  Candidate,
  MenuSkeleton,
  PlanIntake,
} from "./schemas";

// Roadmap item 1.6 — guard against Anthropic structured-output gotchas.
// `output_config.format.schema` rejects:
//   - arrays with `minItems > 1` or any `maxItems`
//   - numbers/integers with `minimum`, `maximum`, `exclusiveMinimum`,
//     `exclusiveMaximum`, or `type: "integer"`
// (see CLAUDE.md "Anthropic structured output gotchas")
//
// We convert each LLM-bound Zod schema to JSON Schema (the same artifact
// the AI SDK ships to Anthropic) and walk it for banned keywords.

type Violation = { path: string; reason: string };

function findViolations(node: unknown, path: string): Violation[] {
  const out: Violation[] = [];
  if (!node || typeof node !== "object") return out;
  const obj = node as Record<string, unknown>;

  if (obj.type === "integer") {
    out.push({ path, reason: 'type: "integer" — Anthropic rejects (no .int())' });
  }
  if (obj.type === "number" || obj.type === "integer") {
    for (const key of [
      "minimum",
      "maximum",
      "exclusiveMinimum",
      "exclusiveMaximum",
    ]) {
      if (obj[key] !== undefined) {
        out.push({
          path,
          reason: `${key} on numeric — Anthropic rejects (no .min/.max/.positive/.gt etc.)`,
        });
      }
    }
  }
  if (obj.type === "array") {
    if (typeof obj.minItems === "number" && obj.minItems > 1) {
      out.push({
        path,
        reason: `minItems=${obj.minItems} (>1) — Anthropic rejects (.min(1) is OK)`,
      });
    }
    if (obj.maxItems !== undefined) {
      out.push({
        path,
        reason: `maxItems=${String(obj.maxItems)} — Anthropic rejects`,
      });
    }
  }

  // Recurse through known JSON Schema container keywords.
  if (obj.properties && typeof obj.properties === "object") {
    for (const [key, val] of Object.entries(obj.properties)) {
      out.push(...findViolations(val, path ? `${path}.${key}` : key));
    }
  }
  if (obj.items) {
    out.push(...findViolations(obj.items, `${path}[]`));
  }
  for (const key of ["anyOf", "oneOf", "allOf"]) {
    const arr = obj[key];
    if (Array.isArray(arr)) {
      arr.forEach((sub, i) =>
        out.push(...findViolations(sub, `${path}.${key}[${i}]`)),
      );
    }
  }
  if (obj.$defs && typeof obj.$defs === "object") {
    for (const [key, val] of Object.entries(obj.$defs)) {
      out.push(...findViolations(val, `$defs.${key}`));
    }
  }

  return out;
}

const llmSchemas = {
  PlanIntake,
  MenuSkeleton,
  CookCardDraft,
  Candidate,
  CandidatesForSlot,
} as const;

describe("planner LLM schemas — Anthropic structured-output compatibility", () => {
  for (const [name, schema] of Object.entries(llmSchemas)) {
    it(`${name} produces JSON Schema with no banned keywords`, () => {
      const json = z.toJSONSchema(schema);
      const violations = findViolations(json, name);
      // Surface the actual violations in the failure message so a future
      // contributor sees what tripped the guard, not just "expected 0".
      expect(
        violations,
        violations.length
          ? "Anthropic-incompatible keywords detected:\n" +
              violations.map((v) => `  - ${v.path}: ${v.reason}`).join("\n")
          : "ok",
      ).toEqual([]);
    });
  }
});

// Self-tests — if Zod's JSON Schema emission shifts in a future major and
// stops emitting these keywords, the guard would silently pass. These
// assertions make the validator's own breakage loud.
describe("validator self-tests — synthetic bad schemas must trip the guard", () => {
  it("catches z.number().int()", () => {
    const v = findViolations(z.toJSONSchema(z.number().int()), "root");
    expect(v.some((x) => x.reason.includes("integer"))).toBe(true);
  });

  it("catches z.number().min(0).max(1)", () => {
    const v = findViolations(z.toJSONSchema(z.number().min(0).max(1)), "root");
    expect(v.some((x) => /minimum|maximum/.test(x.reason))).toBe(true);
  });

  it("catches z.number().positive()", () => {
    const v = findViolations(z.toJSONSchema(z.number().positive()), "root");
    expect(v.length).toBeGreaterThan(0);
  });

  it("catches z.array(z.string()).min(2)", () => {
    const v = findViolations(
      z.toJSONSchema(z.array(z.string()).min(2)),
      "root",
    );
    expect(v.some((x) => x.reason.includes("minItems"))).toBe(true);
  });

  it("catches z.array(z.string()).max(5)", () => {
    const v = findViolations(
      z.toJSONSchema(z.array(z.string()).max(5)),
      "root",
    );
    expect(v.some((x) => x.reason.includes("maxItems"))).toBe(true);
  });

  it("allows z.array(z.string()).min(1)", () => {
    const v = findViolations(
      z.toJSONSchema(z.array(z.string()).min(1)),
      "root",
    );
    expect(v).toEqual([]);
  });

  it("allows plain z.number()", () => {
    const v = findViolations(z.toJSONSchema(z.number()), "root");
    expect(v).toEqual([]);
  });
});
