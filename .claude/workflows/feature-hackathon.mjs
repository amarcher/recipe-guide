export const meta = {
  name: 'feature-hackathon',
  description: 'Run N lens-builders in parallel worktrees on one feature; return blind candidates A–E for the standing judge panel',
  whenToUse: 'The BUILD step of the autonomous /loop runner (see docs/roadmap-2026/LOOP-OPS.md). Builders only — judging is done by the persistent panel via SendMessage.',
  phases: [
    { title: 'Build', detail: 'one lens-builder per persona, isolated git worktrees' },
    { title: 'Assemble', detail: 'collect diffs, anonymize to salt-rotated A–E' },
  ],
}

// args: {
//   feature: { id, title, outcome, doneWhen, slug, constraints? },  // the queue brief
//   n?: number,     // builders to run; default 5, floor 2, capped at the 5 lenses
//   salt?: number,  // rotates the blind label mapping so persistent judges can't learn "A = caretaker"
// }
const feature = args && args.feature
if (!feature || !feature.id || !feature.title) {
  throw new Error('feature-hackathon: args.feature with { id, title, outcome, doneWhen, slug } is required')
}

const LENSES = [
  { lens: 'caretaker',       file: 'docs/roadmap-2026/positions/01-caretaker.md',       essence: 'the household nurturer — does this serve real family life, low-friction and warm?' },
  { lens: 'plan-execution',  file: 'docs/roadmap-2026/positions/02-plan-execution.md',  essence: 'the cook flow — does it respect the untouchable execution layer and the planner→cook handoff?' },
  { lens: 'visual-design',   file: 'docs/roadmap-2026/positions/03-visual-design.md',   essence: 'aesthetic quality — does it look and feel considered and on-brand?' },
  { lens: 'sharing-network', file: 'docs/roadmap-2026/positions/04-sharing-network.md', essence: 'household/social — are family, sharing and scope semantics correct?' },
  { lens: 'architect',       file: 'docs/roadmap-2026/positions/05-architect.md',       essence: 'schema and reliability — is it sound, tested, gotcha-safe, the smallest clean diff?' },
]

const N = Math.max(2, Math.min(LENSES.length, Math.round((args && args.n) || 5)))
const salt = Math.round((args && args.salt) || 0)
const builders = LENSES.slice(0, N)

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
  required: ['lens', 'branch', 'summary', 'approach', 'diff', 'checks'],
  properties: {
    lens: { type: 'string' },
    branch: { type: 'string', description: 'hack/<featureId>/<lens>' },
    summary: { type: 'string', description: 'one paragraph: what you built' },
    approach: { type: 'string', description: 'the key design decisions, made through your lens' },
    diff: { type: 'string', description: 'output of `git diff main...HEAD` (unified). If enormous, keep the most important files and note what you trimmed.' },
    filesChanged: { type: 'array', items: { type: 'string' } },
    checks: {
      type: 'object',
      additionalProperties: false,
      required: ['tsc', 'eslint', 'tests'],
      properties: {
        tsc: { type: 'string', description: 'pass | fail + one-line note' },
        eslint: { type: 'string', description: 'pass | fail + one-line note' },
        tests: { type: 'string', description: 'what you ran and the result' },
      },
    },
  },
}

phase('Build')
const built = await parallel(builders.map((b) => () =>
  agent(
    `You are the **${b.lens}** lens building a competing implementation of ONE feature for ` +
    `Recipe Guide (Next.js 16, repo at the current working directory). This is a hackathon: ` +
    `${N} product lenses each build their own version of the SAME feature, then a standing panel ` +
    `judges them blind. Build the BEST version *through your lens* — ${b.essence}\n\n` +
    `Read your full persona first and embody it: ${b.file}\n\n` +
    `FEATURE\n` +
    `  id: ${feature.id}\n` +
    `  title: ${feature.title}\n` +
    `  outcome: ${feature.outcome || '(see title)'}\n` +
    `  done-when: ${feature.doneWhen || 'tsc + eslint + tests green; outcome demonstrably met'}\n\n` +
    CONSTRAINTS + '\n\n' +
    `WORK\n` +
    `1. You are in your own isolated git worktree off main. Create branch hack/${feature.id}/${b.lens}.\n` +
    `2. Implement the feature fully and coherently — real, working code, not a sketch. Let your lens shape the design choices.\n` +
    `3. Verify: \`npx tsc --noEmit\`; \`npx eslint app\`; \`npm test\`; and the verify-ui skill if you touched UI.\n` +
    `4. Commit everything on your branch (end the message with the Co-Authored-By: Claude trailer).\n` +
    `5. Return the structured result; set diff to the output of \`git diff main...HEAD\`.\n\n` +
    `Do NOT open a PR and do NOT touch main. Build, verify, commit, report.`,
    { label: `build:${b.lens}`, phase: 'Build', isolation: 'worktree', schema: BUILD_RESULT },
  )
))

const ok = built.filter(Boolean)
if (ok.length < 2) {
  throw new Error(`feature-hackathon: only ${ok.length} builder(s) succeeded; need >=2 for a contest. Re-scope the feature or retry.`)
}

phase('Assemble')
// Blind-label with a salt-rotated mapping so the persistent judges can't learn "A is always caretaker".
const LETTERS = ['A', 'B', 'C', 'D', 'E']
const count = ok.length
const blindCandidates = []
const key = [] // loop-only: label -> { lens, branch }. Judges NEVER see this.
ok.forEach((r, i) => {
  const label = LETTERS[(i + salt) % count]
  blindCandidates.push({
    label,
    summary: r.summary,
    approach: r.approach,
    diff: r.diff,
    filesChanged: r.filesChanged || [],
    checks: r.checks,
  })
  key.push({ label, lens: r.lens, branch: r.branch })
})
blindCandidates.sort((a, b) => a.label.localeCompare(b.label))
key.sort((a, b) => a.label.localeCompare(b.label))

log(`Built ${count} candidates for ${feature.id} → ${key.map((k) => k.label + '=' + k.lens).join(', ')} (key is private; judges receive blind ${blindCandidates.map((c) => c.label).join('–')})`)

return { featureId: feature.id, blindCandidates, key }
