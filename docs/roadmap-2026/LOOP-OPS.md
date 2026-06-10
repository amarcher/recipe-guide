# Loop Operations — autonomous roadmap execution

How `/loop` grinds the roadmap into PRs, one discrete task per iteration, with a human gate so it can't drift unreviewed. The agent-team planning layer *writes* the roadmap; this runner *executes* it.

## Mental model

Each loop iteration is a **fresh context window**. Nothing survives in the conversation between iterations — durable state lives only in **git** and in the **Task Queue** section of `EXECUTION-PLAN.md`. Every iteration:

1. starts from freshly-merged `main` (so it builds on the *reviewed* output of the last one — never a PR stack),
2. does exactly one queue task,
3. opens a PR and pauses at a Slack gate,
4. resumes + picks the next task only after the gate clears.

The Slack gate is the anti-drift mechanism. Removing it gives you "full autopilot" (see Variants) at the cost of the sanity checks you wanted.

## Channel binding

**Convention: the Slack channel name matches the repo directory name.** This repo is `recipe-guide`, so its channel is **#recipe-guide** (`C0ATWTGC28J`) in the Ace's Up Labs workspace. The loop should re-resolve this each run via `slack_search_channels` on the repo name rather than trusting a stale ID — channels get recreated.

## Feedback sources

1. **Slack #recipe-guide — WIRED.** The loop searches this channel for messages from Andrew since the last iteration. Anything he posts (a redirect, a veto, "change X", a 👍) outranks the queue.
2. **App / user feedback — NOT YET WIRED (placeholder).** "Comments on blogs or other sources of input about our apps." Pick a concrete source and fill this in before relying on it. Candidate wirings:
   - a `Feedback` table (or reuse `DASHBOARD_DATABASE_URL` metrics) queried for rows since the last iteration;
   - an inbox/forwarding address the loop greps via the Gmail MCP;
   - a file like `docs/roadmap-2026/inbound-feedback.md` that you (or a webhook) drop notes into.
   Until one is wired, the loop treats this source as empty and says so in its Slack post.

   **Handling rule:** recurring feedback themes get *appended to the roadmap backlog for the agent team* — the loop does **not** unilaterally act on a large pivot. Small, unambiguous bug reports it may turn into a queue task directly.

## The iteration prompt

Run with `/loop` (self-paced — omit the interval so each iteration starts when the last hands off):

```
You are executing our roadmap autonomously, ONE task per iteration. Read
docs/roadmap-2026/LOOP-OPS.md and the "Task Queue" section of
docs/roadmap-2026/EXECUTION-PLAN.md first — they are the source of truth. Never
assume memory of prior iterations; all state lives in git and in that queue.
Do exactly one task, hand off cleanly, then stop.

1. SYNC. `git checkout main && git pull`. Confirm a clean working tree. If it's
   dirty, STOP and report — never build on uncommitted state.

2. FEEDBACK FIRST (this overrides the queue):
   - Resolve the channel: slack_search_channels for "recipe-guide" → #recipe-guide.
     Read messages since the last iteration. A redirect/veto/"change X" from
     Andrew supersedes the queue — handle that before picking a new task. Treat
     a 👍 / "approved" on a [review:#NN] task as the gate clearing (step 6).
   - Check the app/user feedback source named in LOOP-OPS.md. If unwired, note
     "no feedback source wired" and continue. Append recurring themes to the
     roadmap backlog for the agent team; do NOT act on a large pivot yourself.

3. PICK. Read the Task Queue. Choose the topmost `[ ]` item under "### Open"
   (skip `[blocked:…]`). Mark it `[wip]`. If it's larger than ~a half-day,
   split it in the queue and do only the first slice. If "### Open" has no `[ ]`
   items, go to step 7.

4. BUILD. Branch `feat/<slug>` off main. Implement ONLY that task — no scope
   creep into adjacent items. Verify: `npx tsc --noEmit`, `npx eslint app`,
   `npm test`, and the verify-ui skill if you touched anything under app/ UI.
   If the task turns out ambiguous or blocked, set it `[blocked: <reason>]` and
   go back to step 3 for the next one.

5. HANDOFF. Commit (end the message with the Co-Authored-By: Claude trailer).
   Open a PR with `gh`. For UI changes, commit verify-ui screenshots to
   docs/screenshots/<slug>/ and link the raw GitHub URLs in the PR body.

6. GATE. Post to #recipe-guide: one line on what you built, the PR link, and
   "sanity check?" (attach screenshots for UI). Set the queue line to
   `[review: #NN]`. Do NOT merge and do NOT start another task until BOTH:
   the Vercel check is SUCCESS, AND Andrew has 👍'd / approved in Slack. When a
   later iteration sees both satisfied, squash-merge, set the line `[done: #NN]`
   (move it under "### Done"), and continue from freshly-merged main.

7. NO WORK LEFT. Post to #recipe-guide: what shipped this cycle, what's
   [blocked] and why, and "roadmap is drained — what's the next increment?"
   Then stop the loop.

Hard rules: one task = one PR. Never force-push or commit directly to main.
Never start task N+1 on top of an unmerged task N. Never edit the execution
layer (CookCardView, MisePlace, Timeline, StepIcon, StepTimer, cook-session.ts,
timer-state.ts, alarm.ts) — new work layers on top.
```

## Variants

- **Full autopilot** (faster, riskier — the drift you were worried about): in step 6, drop the Slack-👍 requirement and gate on Vercel-green alone, matching the standard squash-merge-on-green workflow. Use only when the queue is well-specified and low-risk.
- **Review-batch:** keep building (PR-per-task) without merging, and let Andrew review a stack on his own cadence. Only safe 2–3 deep before rebase pain — prefer the default merge-between-iterations model.

## Pairing with the planning layer

The agent team (brainstorm/roadmap personas) appends concrete tasks to `### Open` in the queue, in the `- [ ] <id> — <task> · branch:<slug> · check:<…>` format. When the loop hits step 7 and the queue is drained, that's the signal to convene the planning layer for the next increment — then restart the loop.
