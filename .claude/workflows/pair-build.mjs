export const meta = {
  name: 'pair-build',
  description: 'Two builders take complementary approaches to one feature in isolated worktrees; returns blind candidates A/B for the standing judge panel',
  whenToUse: 'The BUILD step of the simple agent loop (see docs/agent-loop/PAIR-LOOP.md). Builders only — judging is done by the persistent panel via SendMessage.',
  phases: [
    { title: 'Build', detail: 'two builders, complementary stances, isolated git worktrees' },
  ],
}

// args: { feature: { id, title, outcome, doneWhen, slug, constraints?, approaches? }, salt?: number }
// args may arrive as a real object OR a JSON-encoded string (harness-dependent) — coerce.
const A = typeof args === 'string' ? JSON.parse(args) : (args || {})
const feature = A.feature
if (!feature || !feature.id || !feature.title) {
  throw new Error('pair-build: args.feature with { id, title, outcome, doneWhen, slug } is required (got: ' + (typeof args) + ')')
}
const salt = Math.round(A.salt || 0)

// The pair. Two fixed complementary stances — identical brief, divergent priorities.
// A feature can override via feature.approaches: [{ name, essence }, { name, essence }].
const APPROACHES = (Array.isArray(feature.approaches) && feature.approaches.length === 2)
  ? feature.approaches
  : [
      { name: 'minimalist', essence: 'the smallest clean diff that fully delivers the outcome — lean on existing patterns, add no new surface area, leave the codebase simpler than you found it' },
      { name: 'product', essence: 'the version a family cook would love — product feel, polish, and edge-case care first; go further than the brief where it clearly serves the outcome' },
    ]

const CONSTRAINTS = [
  'HARD CONSTRAINTS (non-negotiable):',
  '- NEVER modify the execution layer: CookCardView, MisePlace, Timeline, StepIcon, StepTimer,',
  '  cook-session.ts, timer-state.ts, alarm.ts. New work LAYERS ON TOP only.',
  '- Respect codebase gotchas: Anthropic structured-output limits (no minItems>1 / maxItems /',
  '  number bounds; describe counts in the prompt and expand drafts server-side), Postgres',
  '  NULL-distinct unique constraints (hand-roll findFirst→create|update), vitest cannot import',
  '  @/app/lib/prisma (extract Prisma-free helpers to test).',
  '- Read AGENTS.md and node_modules/next/dist/docs before reaching for Next.js 16 App Router APIs.',
  feature.constraints ? ('- Feature-specific: ' + feature.constraints) : '',
].filter(Boolean).join('\n')

const BUILD_RESULT = {
  type: 'object',
  additionalProperties: false,
  required: ['approach', 'branch', 'summary', 'design', 'diff', 'checks'],
  properties: {
    approach: { type: 'string' },
    branch: { type: 'string', description: 'pair/<featureId>/<approach>' },
    summary: { type: 'string', description: 'one paragraph: what you built' },
    design: { type: 'string', description: 'key design decisions (do NOT name your stance in code or comments — judging is blind)' },
    diff: { type: 'string', description: 'output of `git diff main...HEAD` (unified). If enormous, keep the most important files and note what you trimmed.' },
    filesChanged: { type: 'array', items: { type: 'string' } },
    checks: {
      type: 'object',
      additionalProperties: false,
      required: ['typecheck', 'lint', 'tests'],
      properties: {
        typecheck: { type: 'string', description: 'pass | fail + one-line note' },
        lint: { type: 'string', description: 'pass | fail + one-line note' },
        tests: { type: 'string', description: 'what you ran and the result' },
      },
    },
  },
}

phase('Build')
const built = await parallel(APPROACHES.map((b) => () =>
  agent(
    `You are the **${b.name}** builder implementing ONE feature for Recipe Guide (repo at the ` +
    `current working directory). A second builder is implementing the SAME feature with a different ` +
    `stance; a standing panel will compare the two blind. Build the best version through your stance: ${b.essence}.\n\n` +
    `FEATURE\n  id: ${feature.id}\n  title: ${feature.title}\n` +
    `  outcome: ${feature.outcome || '(see title)'}\n` +
    `  done-when: ${feature.doneWhen || 'tsc + eslint + tests green; outcome demonstrably met'}\n\n` +
    CONSTRAINTS + '\n\n' +
    `WORK\n` +
    `1. You start in an isolated git worktree. Create your branch BASED ON main so your diff stays clean: \`git checkout -b pair/${feature.id}/${b.name} main\`.\n` +
    `2. Run \`npx prisma generate\` FIRST — the generated Prisma client (app/generated/prisma) is gitignored and absent in a fresh worktree, so tsc and tests fail without it.\n` +
    `3. Implement the feature fully and coherently — real, working code, not a sketch. Let your stance shape the design, but do NOT name it anywhere in code or comments (judging is blind).\n` +
    `4. Verify: \`npx tsc --noEmit\`; \`npx eslint app\`; \`npm test\`; and the verify-ui skill if you touched UI.\n` +
    `5. Commit everything on your branch.\n` +
    `6. Return the structured result; set diff to the output of \`git diff main...HEAD\`.\n\n` +
    `Do NOT open a PR and do NOT touch main. Build, verify, commit, report.`,
    { label: `build:${b.name}`, phase: 'Build', isolation: 'worktree', schema: BUILD_RESULT },
  )
))

const ok = built.filter(Boolean)
if (ok.length < 2) {
  throw new Error(`pair-build: only ${ok.length} builder(s) succeeded; need both for a contest. Re-scope the feature or retry.`)
}

// Blind-label: the salt flips which approach is presented as A vs B per feature, so the
// persistent judges can't learn the mapping. The key is loop-private; judges never see it.
const flip = salt % 2 === 1
const ordered = flip ? [ok[1], ok[0]] : ok
const blindCandidates = ordered.map((r, i) => ({
  label: i === 0 ? 'A' : 'B',
  summary: r.summary,
  design: r.design,
  diff: r.diff,
  filesChanged: r.filesChanged || [],
  checks: r.checks,
}))
const key = ordered.map((r, i) => ({ label: i === 0 ? 'A' : 'B', approach: r.approach, branch: r.branch }))

log(`Built both candidates for ${feature.id} (label→approach key is private; judges receive blind A/B)`)

return { featureId: feature.id, blindCandidates, key }
