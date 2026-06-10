import { describe, expect, it } from "vitest";
import { z } from "zod";

import { analyzeJsonSchema, formatViolations } from "./analyze";
import { getRegisteredSchemas } from "./registry";

// Roadmap item 1.6 — CI guardrail against Anthropic structured-output gotchas.
// `output_config.format.schema` (what `generateObject` ships to Claude) rejects:
//   - arrays with `minItems > 1` or any `maxItems`
//   - numbers/integers with `minimum`/`maximum`/`exclusiveMinimum`/`exclusiveMaximum`
//   - `type: "integer"` (Zod `.int()`)
// (see CLAUDE.md "Anthropic structured output gotchas")

// A deliberately-bad schema: every banned construct, all at once. The guard
// must catch ALL of them. This is the fixture the feature's done-when calls for.
const DELIBERATELY_BAD = z.object({
  // banned: minItems > 1
  heroes: z.array(z.string()).min(3),
  // banned: maxItems
  themes: z.array(z.string()).max(5),
  // banned: integer type
  servings: z.number().int(),
  // banned: positive -> exclusiveMinimum
  cookMinutes: z.number().positive(),
  // banned: min/max -> minimum/maximum
  intensity: z.number().min(0).max(1),
  nested: z.object({
    // banned inside a nested object + array
    rows: z.array(
      z.object({
        // banned: nonnegative -> minimum
        weight: z.number().nonnegative(),
      })
    ).min(2),
  }),
});

describe("analyzeJsonSchema — deliberately-bad fixture", () => {
  const violations = analyzeJsonSchema("DeliberatelyBad", z.toJSONSchema(DELIBERATELY_BAD));

  it("flags the bad schema (non-empty)", () => {
    expect(violations.length).toBeGreaterThan(0);
  });

  it("catches minItems > 1", () => {
    expect(violations.some((v) => v.rule === "array-minItems-gt-1")).toBe(true);
  });

  it("catches maxItems", () => {
    expect(violations.some((v) => v.rule === "array-maxItems")).toBe(true);
  });

  it("catches integer type (.int())", () => {
    expect(violations.some((v) => v.rule === "integer-type")).toBe(true);
  });

  it("catches .positive() (exclusiveMinimum)", () => {
    expect(violations.some((v) => v.rule === "number-exclusiveMinimum")).toBe(true);
  });

  it("catches .min()/.max() (minimum + maximum)", () => {
    expect(violations.some((v) => v.rule === "number-minimum")).toBe(true);
    expect(violations.some((v) => v.rule === "number-maximum")).toBe(true);
  });

  it("catches a banned construct nested deep inside an object+array", () => {
    expect(
      violations.some(
        (v) => v.rule === "number-minimum" && v.path.includes("rows")
      )
    ).toBe(true);
  });

  it("formats violations into a readable report", () => {
    const report = formatViolations(violations);
    expect(report).toContain("DeliberatelyBad");
    expect(report).toMatch(/banned LLM-schema construct/);
  });
});

// Allowed constructs must NOT trip the guard — guards against over-eager
// matching that would force contributors to weaken legitimate schemas.
describe("analyzeJsonSchema — allowed constructs are not flagged", () => {
  it("allows array .min(1) (minItems: 1)", () => {
    const v = analyzeJsonSchema("ok", z.toJSONSchema(z.array(z.string()).min(1)));
    expect(v).toEqual([]);
  });

  it("allows plain z.number()", () => {
    const v = analyzeJsonSchema("ok", z.toJSONSchema(z.number()));
    expect(v).toEqual([]);
  });

  it("allows string .min()/.max() (minLength/maxLength)", () => {
    const v = analyzeJsonSchema("ok", z.toJSONSchema(z.string().min(2).max(40)));
    expect(v).toEqual([]);
  });

  it("allows enums (value lists, not numeric bounds)", () => {
    const v = analyzeJsonSchema("ok", z.toJSONSchema(z.enum(["A", "B", "C"])));
    expect(v).toEqual([]);
  });
});

// The actual production schemas fed to generateObject must all be clean.
// This is the same assertion the CI script runs, pinned in the unit suite so a
// regression fails locally before it reaches the pipeline. Critically it covers
// the pivot cook-rescue schemas (PivotedCard / PivotProgressMapping), which the
// planner-only schemas.test.ts never checked.
describe("registered LLM schemas — all Anthropic-compatible", () => {
  const registered = getRegisteredSchemas();

  it("registry is non-empty and includes the pivot + candidate schemas", () => {
    const names = registered.map((r) => r.name);
    expect(names).toContain("CandidatesForSlot");
    expect(names).toContain("PivotedCard");
    expect(names).toContain("PivotProgressMapping");
  });

  for (const { name, jsonSchema } of registered) {
    it(`${name} has no banned constructs`, () => {
      const violations = analyzeJsonSchema(name, jsonSchema);
      expect(violations, formatViolations(violations)).toEqual([]);
    });
  }
});
