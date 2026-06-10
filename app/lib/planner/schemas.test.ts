import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  CandidatesForSlot,
  CookCardDraft,
  Candidate,
  MenuSkeleton,
  PlanIntake,
} from "./schemas";
import { analyzeJsonSchema, formatViolations } from "../schema-guard/analyze";

// Roadmap item 1.6 — guard against Anthropic structured-output gotchas.
// `output_config.format.schema` rejects:
//   - arrays with `minItems > 1` or any `maxItems`
//   - numbers/integers with `minimum`, `maximum`, `exclusiveMinimum`,
//     `exclusiveMaximum`, or `type: "integer"`
// (see CLAUDE.md "Anthropic structured output gotchas")
//
// The walker now lives in the shared, CI-backed analyzer
// (app/lib/schema-guard/analyze.ts) — this suite pins the planner schemas to it.
// The full registered set (including the pivot cook-rescue schemas) is asserted
// in app/lib/schema-guard/analyze.test.ts and enforced in CI via
// `npm run validate:llm-schemas`.

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
      const violations = analyzeJsonSchema(name, z.toJSONSchema(schema));
      expect(violations, formatViolations(violations)).toEqual([]);
    });
  }
});
