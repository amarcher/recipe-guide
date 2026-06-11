// READ-ONLY prod-migration verifier — `npm run verify:prod-migration`.
//
// Reports whether the 20260429002752_phase2 migration is applied to the
// production database (DATABASE_URL_UNPOOLED), object by object:
//   - the _prisma_migrations ledger row (finished, not rolled back)
//   - every enum / enum value / table / column / index the migration creates
//   - any other local migrations missing from the prod ledger
//
// This script NEVER migrates and NEVER writes — every statement is a SELECT
// against pg_catalog / information_schema. If the migration is missing, it
// tells you so and points at the runbook; applying it is Andrew's manual
// `npx prisma migrate deploy` step (docs/runbooks/prod-migration.md).

import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const MIGRATION = "20260429002752_phase2";
const RUNBOOK = "docs/runbooks/prod-migration.md";

const EXPECTED_ENUMS = ["MealVerdict", "EaterRole"];
const EXPECTED_ENUM_VALUES = [
  { enumName: "PlannedMealStatus", value: "COOKED_FROM_LEFTOVERS" },
];
const EXPECTED_TABLES = [
  "FamilyEvent",
  "MiseCheckShared",
  "MealOutcome",
  "WeeklyPlanMenuItem",
  "RecipeShareToken",
  "GroceryListShare",
  "Notification",
];
const EXPECTED_COLUMNS: Array<[table: string, column: string]> = [
  ["WeeklyPlan", "dietaryNote"],
  ["WeeklyPlan", "hostNote"],
  ["WeeklyPlan", "publishedAt"],
  ["WeeklyPlan", "publishedSlug"],
  ["PlannedMeal", "cookLogId"],
];
const EXPECTED_INDEXES = [
  "WeeklyPlan_publishedSlug_key",
  "RecipeShareToken_token_key",
  "GroceryListShare_token_key",
  "MiseCheckShared_savedRecipeId_familyId_entryKey_key",
  "Notification_userId_readAt_createdAt_idx",
];

type Check = { label: string; present: boolean };

function mark(present: boolean): string {
  return present ? "  ✓" : "  ✗ MISSING";
}

function localMigrationNames(): string[] {
  const dir = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "prisma",
    "migrations"
  );
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED;
  if (!url) {
    console.error(
      "DATABASE_URL_UNPOOLED is not set. Run via `npm run verify:prod-migration` so .env.local is loaded."
    );
    process.exit(1);
  }

  const sql = neon(url);

  const ledger = (await sql`
    SELECT migration_name, started_at, finished_at, rolled_back_at
    FROM _prisma_migrations
    WHERE migration_name = ${MIGRATION}
  `) as Array<{
    migration_name: string;
    started_at: Date | null;
    finished_at: Date | null;
    rolled_back_at: Date | null;
  }>;

  const enumRows = (await sql`
    SELECT t.typname
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typtype = 'e'
      AND t.typname = ANY(${EXPECTED_ENUMS})
  `) as Array<{ typname: string }>;
  const presentEnums = new Set(enumRows.map((r) => r.typname));

  const enumValueRows = (await sql`
    SELECT t.typname, e.enumlabel
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = ANY(${EXPECTED_ENUM_VALUES.map((v) => v.enumName)})
  `) as Array<{ typname: string; enumlabel: string }>;
  const presentEnumValues = new Set(
    enumValueRows.map((r) => `${r.typname}.${r.enumlabel}`)
  );

  const tableRows = (await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ANY(${EXPECTED_TABLES})
  `) as Array<{ table_name: string }>;
  const presentTables = new Set(tableRows.map((r) => r.table_name));

  const columnTables = [...new Set(EXPECTED_COLUMNS.map(([t]) => t))];
  const columnRows = (await sql`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ANY(${columnTables})
  `) as Array<{ table_name: string; column_name: string }>;
  const presentColumns = new Set(
    columnRows.map((r) => `${r.table_name}.${r.column_name}`)
  );

  const indexRows = (await sql`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = ANY(${EXPECTED_INDEXES})
  `) as Array<{ indexname: string }>;
  const presentIndexes = new Set(indexRows.map((r) => r.indexname));

  const appliedAll = (await sql`
    SELECT migration_name
    FROM _prisma_migrations
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
  `) as Array<{ migration_name: string }>;
  const appliedNames = new Set(appliedAll.map((r) => r.migration_name));

  const ledgerRow = ledger[0];
  const ledgerApplied =
    !!ledgerRow && ledgerRow.finished_at != null && ledgerRow.rolled_back_at == null;

  const checks: Check[] = [
    ...EXPECTED_ENUMS.map((e) => ({
      label: `enum ${e}`,
      present: presentEnums.has(e),
    })),
    ...EXPECTED_ENUM_VALUES.map((v) => ({
      label: `enum value ${v.enumName}.${v.value}`,
      present: presentEnumValues.has(`${v.enumName}.${v.value}`),
    })),
    ...EXPECTED_TABLES.map((t) => ({
      label: `table ${t}`,
      present: presentTables.has(t),
    })),
    ...EXPECTED_COLUMNS.map(([t, c]) => ({
      label: `column ${t}.${c}`,
      present: presentColumns.has(`${t}.${c}`),
    })),
    ...EXPECTED_INDEXES.map((i) => ({
      label: `index ${i}`,
      present: presentIndexes.has(i),
    })),
  ];

  console.log(`Prod-migration verify — ${MIGRATION} (read-only)\n`);

  console.log("_prisma_migrations ledger:");
  if (!ledgerRow) {
    console.log("  ✗ MISSING — no row for this migration");
  } else if (ledgerRow.rolled_back_at != null) {
    console.log(`  ✗ ROLLED BACK at ${ledgerRow.rolled_back_at}`);
  } else if (ledgerRow.finished_at == null) {
    console.log(
      `  ✗ UNFINISHED — started ${ledgerRow.started_at}, never finished (failed migration?)`
    );
  } else {
    console.log(`  ✓ applied, finished ${ledgerRow.finished_at}`);
  }

  console.log("\nObjects created by the migration:");
  for (const c of checks) {
    console.log(`${mark(c.present)}  ${c.label}`);
  }

  const missingObjects = checks.filter((c) => !c.present);
  const localNames = localMigrationNames();
  const unapplied = localNames.filter((n) => !appliedNames.has(n));

  console.log(
    `\nFull ledger: ${appliedNames.size} applied in prod, ${localNames.length} local migration folder(s).`
  );
  if (unapplied.length) {
    console.log("Local migrations NOT applied in prod:");
    for (const n of unapplied) console.log(`  ✗ ${n}`);
  } else {
    console.log("Every local migration folder is applied in prod.");
  }

  console.log("");
  if (ledgerApplied && missingObjects.length === 0) {
    console.log(`VERDICT: APPLIED — ${MIGRATION} is fully present in prod.`);
  } else if (!ledgerRow && missingObjects.length === checks.length) {
    console.log(`VERDICT: NOT APPLIED — ${MIGRATION} is absent from prod.`);
    console.log(
      "\nThis script never migrates. Andrew must apply it himself:\n" +
        "  npx prisma migrate deploy\n" +
        `See ${RUNBOOK} for the full runbook.`
    );
    process.exitCode = 2;
  } else {
    console.log(
      `VERDICT: PARTIAL/DRIFT — ledger ${
        ledgerApplied ? "says applied" : "disagrees"
      }, ${missingObjects.length}/${checks.length} object(s) missing.`
    );
    console.log(
      "\nInvestigate before deploying — do NOT blindly run migrate deploy on a drifted database.\n" +
        `See ${RUNBOOK}.`
    );
    process.exitCode = 2;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
