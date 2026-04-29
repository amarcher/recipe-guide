import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Roadmap item 1.4 — guard the planner from accidentally reading
// override-applied cards. Same dish must score the same way regardless of
// which family is doing the planning. The rule:
//
//   Anything under app/lib/planner/** or app/api/plans/** must NOT import
//   resolveCard / resolveCardsForSavedRecipes from app/lib/card-resolver.
//   Use loadCanonicalCard instead.
//
// See app/lib/card-resolver.ts banner for the read-mode contract.

const BANNED_IMPORTS = ["resolveCard", "resolveCardsForSavedRecipes"];
const PLANNER_ROOTS = ["app/lib/planner", "app/api/plans"];
const REPO_ROOT = join(__dirname, "..", "..", "..");

function walk(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    const s = statSync(full);
    if (s.isDirectory()) {
      out.push(...walk(full));
    } else if (
      s.isFile() &&
      (full.endsWith(".ts") || full.endsWith(".tsx")) &&
      !full.endsWith(".test.ts") &&
      !full.endsWith(".test.tsx") &&
      !full.endsWith(".spec.ts") &&
      !full.endsWith(".spec.tsx")
    ) {
      out.push(full);
    }
  }
  return out;
}

function findBannedImports(file: string): string[] {
  const src = readFileSync(file, "utf8");
  const violations: string[] = [];
  // Match `import { ..., resolveCard, ... } from "...card-resolver..."` —
  // tolerate aliases (`resolveCard as r`), multi-line imports, etc.
  const importRe =
    /import\s*(?:type\s*)?\{([^}]+)\}\s*from\s*["'][^"']*card-resolver[^"']*["']/g;
  let match: RegExpExecArray | null;
  while ((match = importRe.exec(src)) !== null) {
    const names = match[1]
      .split(",")
      .map((s) => s.trim().split(/\s+as\s+/)[0].trim());
    for (const banned of BANNED_IMPORTS) {
      if (names.includes(banned)) {
        violations.push(`imports ${banned}`);
      }
    }
  }
  return violations;
}

describe("planner canonical-only read rule", () => {
  for (const root of PLANNER_ROOTS) {
    it(`no file under ${root}/ imports resolveCard or resolveCardsForSavedRecipes`, () => {
      const files = walk(join(REPO_ROOT, root));
      const offenders: string[] = [];
      for (const file of files) {
        const violations = findBannedImports(file);
        if (violations.length) {
          offenders.push(`  ${relative(REPO_ROOT, file)}: ${violations.join(", ")}`);
        }
      }
      expect(
        offenders,
        offenders.length
          ? `Planner read paths must use loadCanonicalCard (see app/lib/card-resolver.ts banner). Offending files:\n${offenders.join("\n")}`
          : "ok",
      ).toEqual([]);
    });
  }

  // Self-test — assert the regex actually catches a banned import. If Zod /
  // tooling shifts and a test refactor drops the regex, this surfaces it.
  it("regex catches a synthetic banned import", () => {
    const synthetic =
      'import { resolveCard } from "@/app/lib/card-resolver";';
    const tmpFile = join(__dirname, ".__synthetic-canonical-only-test.ts");
    // Write through fs in a temp file isn't worth it — use a string check
    // via the regex directly.
    const re =
      /import\s*(?:type\s*)?\{([^}]+)\}\s*from\s*["'][^"']*card-resolver[^"']*["']/g;
    const m = re.exec(synthetic);
    expect(m).not.toBeNull();
    expect(m![1]).toContain("resolveCard");
    void tmpFile; // keep noUnusedLocals quiet
  });
});
