#!/usr/bin/env node
// CI guardrail (roadmap 1.6): fail the build when any LLM structured-output
// schema uses a construct Anthropic's `output_config.format.schema` rejects.
//
// Scans every schema registered in app/lib/schema-guard/registry.ts (the exact
// schemas handed to `generateObject` across the planner pipeline and the
// mid-cook pivot), compiles each to JSON Schema, and walks it for banned
// keywords. Banned: array `minItems > 1` / `maxItems`, number bounds
// (`minimum`/`maximum`/`exclusiveMinimum`/`exclusiveMaximum`), `type: "integer"`.
//
// Run: `npm run validate:llm-schemas`  (also wired into .github/workflows/ci.yml)
import { z } from "zod";

import { analyzeJsonSchema, formatViolations, type Violation } from "@/app/lib/schema-guard/analyze";
import { getRegisteredSchemas } from "@/app/lib/schema-guard/registry";

// Self-test: if a future Zod major stops emitting these JSON-Schema keywords,
// the analyzer could go silently green. Prove it still bites a known-bad schema
// before trusting it on the real ones. If THIS fails, the guard — not the
// schemas — is broken.
function selfTest(): void {
  const bad = z.object({
    a: z.array(z.string()).min(2),
    b: z.number().int().positive(),
    c: z.number().min(0).max(1),
    d: z.array(z.string()).max(3),
  });
  const v = analyzeJsonSchema("__selftest__", z.toJSONSchema(bad));
  const expected: Violation["rule"][] = [
    "array-minItems-gt-1",
    "array-maxItems",
    "integer-type",
    "number-exclusiveMinimum",
    "number-minimum",
    "number-maximum",
  ];
  const missing = expected.filter((rule) => !v.some((x) => x.rule === rule));
  if (missing.length > 0) {
    console.error(
      `validate-llm-schemas: self-test FAILED — analyzer no longer detects: ${missing.join(", ")}.\n` +
        "The static guard is broken (likely a Zod JSON-Schema emission change). Fix app/lib/schema-guard/analyze.ts."
    );
    process.exit(2);
  }
}

function main(): void {
  selfTest();

  const registered = getRegisteredSchemas();
  if (registered.length === 0) {
    console.error("validate-llm-schemas: registry is empty — nothing to check (this is almost certainly a mistake).");
    process.exit(2);
  }

  const allViolations: Violation[] = [];
  for (const { name, usedAt, jsonSchema } of registered) {
    const violations = analyzeJsonSchema(name, jsonSchema);
    if (violations.length > 0) {
      allViolations.push(...violations);
      console.error(`\n${name}  (${usedAt})`);
      console.error(formatViolations(violations));
    } else {
      console.log(`ok  ${name}  (${usedAt})`);
    }
  }

  if (allViolations.length > 0) {
    console.error(
      `\nFAIL: ${allViolations.length} banned LLM-schema construct(s) across ${registered.length} registered schema(s).`
    );
    console.error(
      "These will be rejected by Anthropic's structured-output API. See CLAUDE.md \"Anthropic structured output gotchas\" — express counts in `.describe()` + the prompt, expand drafts server-side."
    );
    process.exit(1);
  }

  console.log(`\nPASS: ${registered.length} registered LLM schema(s) are Anthropic-compatible.`);
}

main();
