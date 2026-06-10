// Registry of every Zod schema that is handed to `generateObject` as its
// `schema` (and therefore compiled to Anthropic's `output_config.format.schema`).
//
// Keep this list in lockstep with the `schema:` argument at each `generateObject`
// call site. If you add a new structured-output LLM call, register its top-level
// schema here so the CI guard (`scripts/validate-llm-schemas.ts`) covers it.
//
// Prisma-free AND alias-free (relative imports only) so vitest — which has no
// path-alias setup — can load this registry directly in a unit test.
import { z } from "zod";

import {
  PlanIntake,
  MenuSkeleton,
  CandidatesForSlot,
} from "../planner/schemas";
import { PivotedCard, PivotProgressMapping } from "../pivot/schemas";

export interface RegisteredSchema {
  /** Human label used in CI output. */
  name: string;
  /** Where the schema is fed to `generateObject`. */
  usedAt: string;
  /** The compiled JSON Schema, exactly as the model would receive it. */
  jsonSchema: unknown;
}

interface Entry {
  name: string;
  usedAt: string;
  schema: z.ZodType;
}

const ENTRIES: Entry[] = [
  // app/api/plans/[id]/intake/extract/route.ts
  { name: "PlanIntake", usedAt: "app/api/plans/[id]/intake/extract/route.ts", schema: PlanIntake },
  // app/api/plans/[id]/skeleton/route.ts
  { name: "MenuSkeleton", usedAt: "app/api/plans/[id]/skeleton/route.ts", schema: MenuSkeleton },
  // app/api/plans/[id]/candidates/route.ts  (the planner→cook handoff schema)
  { name: "CandidatesForSlot", usedAt: "app/api/plans/[id]/candidates/route.ts", schema: CandidatesForSlot },
  // app/lib/pivot/run.ts (Pass 1 — Revise)
  { name: "PivotedCard", usedAt: "app/lib/pivot/run.ts", schema: PivotedCard },
  // app/lib/pivot/run.ts (Pass 2 — Re-state)
  { name: "PivotProgressMapping", usedAt: "app/lib/pivot/run.ts", schema: PivotProgressMapping },
];

export function getRegisteredSchemas(): RegisteredSchema[] {
  return ENTRIES.map(({ name, usedAt, schema }) => ({
    name,
    usedAt,
    jsonSchema: z.toJSONSchema(schema),
  }));
}
