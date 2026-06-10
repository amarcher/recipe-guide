# Loop Operations — autonomous roadmap execution

How `/loop` turns the roadmap into PRs — **one feature per iteration**, each built as a *hackathon* (several agents compete), judged by a *standing panel* (consensus), merged on that consensus + Vercel green. A human (Andrew) holds a **standing veto** but is never a required gate. The planning layer *writes* the roadmap as features; this runner *executes* each one.

## Mental model

Each loop iteration is a **fresh context window**. Nothing survives in the conversation between iterations — durable state lives only in **git**, the **Task Queue** in `EXECUTION-PLAN.md`, and the **judges' evolution memo**. The exception is the judge panel itself, which is *persistent* (see below).

Every iteration:

1. starts from freshly-merged `main` (builds on *reviewed* output — never a PR stack),
2. takes **one feature** off the queue,
3. runs a **feature hackathon**: ~5 builders each implement it in an isolated worktree,
4. routes the blind candidates to the **standing judge panel**, which reaches consensus,
5. a chair synthesizes the winner (grafting the best of the runners-up) into one PR,
6. merges on **panel consensus + Vercel green** — no human 👍 required,
7. picks the next feature.

**The merge gate is the panel, not the human.** The agent **judge-panel consensus** (automated, taste-driven) plus a green Vercel check is what merges a feature. Andrew holds a **standing veto** — async and non-blocking: he can block a still-open PR or revert a just-merged one whenever he likes (the loop checks for it every iteration, step 3), but the absence of his input **never** stalls the loop. His 👍 is welcome, never required.

Note the two *kinds* of veto, which never collide:
- **A judge's veto** is resolved *inside the panel by majority* — the other lenses can overrule it, fully autonomously. It never escalates to Andrew.
- **Andrew's veto** is supreme and outside the panel — it overrides any consensus, before or after merge.

## Feature sizing — the real lever

There is **no per-feature dial** for builder count or model. The control variable is **how features are scoped.** The planning layer writes every queue entry at a *consistent altitude* — a coherent unit that ~5 agents can each fully implement and a panel can meaningfully compare:

- **Not a micro-task** ("rename this prop") — nothing to contest, wastes the hackathon.
- **Not an epic** ("build social sharing") — too big for one agent to own end-to-end; candidates won't be comparable.
- **A feature** ("auto-sweep abandoned pivot forks", "replace the TTS provider", "promote a kept pivot onto its parent") — one outcome, one PR, a handful of real design choices to vary across builders.

If a feature turns out too big for a builder to finish coherently, it was **mis-scoped** — split it in the queue and take the first piece. Keeping altitude consistent is what makes a ~5-way hackathon the right shape every time, instead of tuning knobs.

## The Feature Hackathon (the BUILD step)

Per feature, run the **`feature-hackathon` workflow** (`.claude/workflows/feature-hackathon.mjs`):

- **~5 ephemeral builders, one per product lens** (caretaker, plan-execution, visual-design, sharing-network, architect), each in its own git worktree, each building the *same* feature *through its bias*. Floor of **2** (always a contest); model-agnostic (no sonnet-vs-haiku selection — the harness's default model for all).
- Each builder reads its persona (`docs/roadmap-2026/positions/0X-*.md`), implements the feature for real, verifies (`tsc`/`eslint`/`tests`/verify-ui), commits on `hack/<featureId>/<lens>`, and returns `{summary, approach, diff, checks}`.
- The workflow **anonymizes** the candidates to `A–E` with a per-feature **salt** rotating the mapping (so the standing judges can't learn "A is always caretaker"), and returns a private `key` (label→lens→branch) that **only the loop** keeps — the judges never see it.

Judging is **not** in this workflow — it routes to the standing panel below.

## The Persistent Judge Panel

Five **standing** judges — one per lens — that receive a *stream* of features and judge them in sequence, **retaining everything they've judged before**. ~5 builders per feature, but only 5 judges across *all* features. Continuity is the point: a judge that remembers the last 40 features evaluates #41 for *coherent evolution*, not in isolation.

See **`docs/roadmap-2026/JUDGE-PANEL.md`** for the full protocol. In brief:

- **Spawned once** as named background agents (`judge-caretaker`, `judge-execution`, `judge-visual`, `judge-sharing`, `judge-architect`); **continued via SendMessage** each feature.
- On spawn / respawn they **rehydrate** from `docs/roadmap-2026/judges-evolution-memo.md` (their durable memory — a standing session eventually compacts or restarts, so in-session memory alone is not enough).
- They score blind candidates `A–E` on the **rubric** (below) and **append to their memo** after each feature.
- A per-feature **chair** (ephemeral) reads the five verdicts + the evolution memos, picks the winner, and writes a **graft list** (best ideas from the runners-up) applied onto the winner's branch.

### The rubric (definition of done)

Every lens scores each candidate on:

1. **Delivers the outcome** — does it actually do what the feature brief defined?
2. **Layers cleanly** — execution layer untouched; respects the gotchas (Anthropic schema limits, NULL-distinct upserts, vitest-no-prisma).
3. **Product feel** — right for *this* household (caretaker + visual weight this).
4. **Code health** — `tsc`/`eslint`/tests green, sound structure (architect weights this).
5. **Smallest clean diff** — solves it without scope creep.

Each lens also brings its own concern (sharing-network checks family/scope semantics, etc.). The panel surfaces the tradeoffs; the chair resolves them.

## Coordination — the agent bus

The team shares work as it goes over a cheap flat-file message bus (see `AGENT-BUS.md`): each agent has an inbox at `.agents/bus/<name>.inbox.md` and reads *its* unread `[ ]` lines, **signing** each one it considers (`[ ]` → `[seen:<name> <ts>]`) so the trail shows who handled what. The loop uses it to drop a feature's context for the judges, leave the chair a pointer to the candidate payloads, and pick up async cross-feature notes the judges leave; the judges use it to flag concerns the loop should act on later. It complements `SendMessage` (live hand-offs) with durable, async, cross-session signaling — and stays cheap because inbox lines are short and big bodies live in `payloads/`.

## Channel binding

**Convention: the Slack channel name matches the repo directory name.** This repo is `recipe-guide`, so its channel is **#recipe-guide** (`C0ATWTGC28J`) in the Ace's Up Labs workspace. The loop should re-resolve this each run via `slack_search_channels` on the repo name rather than trusting a stale ID — channels get recreated.

## Feedback sources

1. **Slack #recipe-guide — WIRED.** The loop searches this channel for messages from Andrew since the last iteration. Anything he posts (a redirect, a veto, "change X", a 👍) outranks the queue.
2. **`docs/roadmap-2026/inbound-feedback.md` — WIRED (file inbox).** A single append-only file the loop reads every iteration. No connectors — a cheap local read. Items are **pushed** in (a Slack webhook, a manual paste, a cron) by appending one line; the loop never reaches out. Each line is `[ ]` (unseen) or `[x]` (processed).

   **Handling rule** (both sources): a small, unambiguous bug/tweak → the loop adds a Task Queue `[ ]` feature directly. A recurring theme or a direction change → *appended to the roadmap backlog for the planning layer*; the loop does **not** act on a large pivot unilaterally. An FYI/praise → no action.

## The iteration prompt

Run with `/loop` (self-paced — omit the interval so each iteration starts when the last hands off):

```
You are the runner executing our roadmap autonomously, ONE feature per iteration, as a
hackathon judged by a standing panel. Read docs/roadmap-2026/LOOP-OPS.md, the "Task Queue"
in docs/roadmap-2026/EXECUTION-PLAN.md, and docs/roadmap-2026/JUDGE-PANEL.md first — they
are the source of truth. Never assume memory of prior iterations; state lives in git, the
queue, and the judges' evolution memo. Build one feature, hand off cleanly, then stop.

1. SYNC. `git checkout main && git pull`. Confirm a clean working tree. If dirty, STOP and
   report — never build on uncommitted state.

2. ENSURE PANEL. Confirm the five persistent judges (judge-caretaker, judge-execution,
   judge-visual, judge-sharing, judge-architect) are alive. If not (first run or after a
   restart), spawn each as a background agent per JUDGE-PANEL.md — each loads its persona
   (positions/0X-*.md) and its section of judges-evolution-memo.md before judging anything.

3. FEEDBACK FIRST + ANDREW'S VETO (overrides everything):
   - slack_search_channels "recipe-guide" → #recipe-guide. Read messages since last iteration.
     A redirect/"change X" from Andrew supersedes the queue. Andrew holds a SUPREME, async veto:
     if he vetoes a `[review:#NN]` feature, do not merge it — rework or drop it per his note; if
     he vetoes a feature merged in a recent iteration, open a revert/rework PR. His silence is
     NOT a blocker — never wait on him. (His 👍 is not required for any merge; see step 8.)
   - Read inbound-feedback.md. For each `[ ]`: small bug → add a Task Queue feature; recurring
     theme/pivot → append to the planning backlog (don't act unilaterally); FYI → none. Flip
     each handled line `[ ]` → `[x]` (never delete).

4. PICK. Read the Task Queue. Take the topmost `[ ]` feature under "### Open" (skip
   [blocked:…]). Mark it `[wip]`. If it's plainly too big for one builder to finish
   coherently, it was mis-scoped: split it in the queue and take the first piece. If "### Open"
   has no `[ ]` features → step 9.

5. HACKATHON (BUILD). Run the `feature-hackathon` workflow with { feature: <the brief>,
   salt: <a per-feature integer, e.g. the feature's position this run> }. It fans out ~5
   lens-builders (floor 2, model-agnostic) in worktrees and returns blind candidates A–E
   ({summary, approach, diff, checks}) plus a PRIVATE key (label→lens→branch). Keep the key;
   the judges must never see it.

6. JUDGE. SendMessage the blind candidates (A–E, no lens identity) to each of the five
   persistent judges. Each scores every candidate on the rubric and appends to its evolution
   memo. Collect the five verdicts.

7. SYNTHESIZE. Spawn an ephemeral chair: give it the five verdicts + the evolution memos.
   It picks the winning label and writes a graft list (best ideas from runners-up). Apply the
   graft onto the winner's branch (a worktree agent). Resolve winner label → branch via the
   private key. Push that branch. Delete the losing hack/ branches + worktrees.

8. HANDOFF + MERGE. Open a PR from the winner branch. PR body = the feature, the panel's
   consensus + why this version won, grafts applied, screenshots for UI. Post to #recipe-guide:
   one line, PR link, "FYI — merging on green unless you veto." Set the queue line `[review: #NN]`.
   Merge gate = **panel consensus (already reached) + Vercel check SUCCESS** — Andrew's 👍 is NOT
   required. When Vercel is green and Andrew has not vetoed (step 3), squash-merge, set
   `[done: #NN]` (move under "### Done"), continue from fresh main.
   (Optional "veto window" variant: hold the merge one iteration after posting, so step 3 gets a
   chance to catch a veto before merge instead of reverting after. Off by default.)

9. NO WORK LEFT. Post to #recipe-guide: what shipped, what's [blocked] and why, and "roadmap
   is drained — what's the next increment?" Then stop the loop.

Hard rules: one feature = one PR. The merge gate is panel consensus + Vercel green; Andrew's
veto can override before or after merge, but his approval is never required. A judge's veto is
resolved inside the panel by majority — it never waits on Andrew. Never force-push or commit
directly to main. Never edit the execution layer (CookCardView, MisePlace, Timeline, StepIcon,
StepTimer, cook-session.ts, timer-state.ts, alarm.ts) — new work layers on top.
```

## Variants

- **Veto window** (catch-before-merge): in step 8, hold the merge one iteration after posting the PR, so step 3 has a chance to see an Andrew veto *before* merge rather than reverting after. Costs one iteration of latency; still never requires his input (auto-merges if un-vetoed). Off by default.
- **Required human approval** (stricter): re-add Andrew's 👍 as a hard merge precondition in step 8 — the loop blocks on him. The inverse of the default; use only when you want to babysit a risky run.
- **Smaller contest:** features that genuinely don't merit five builders can pass `n: 2|3|4` to the hackathon. Floor is 2 — there is always a contest. Prefer fixing scope over shrinking N.

## Pairing with the planning layer

The planning layer (the five-lens roadmap exercise) appends **features** to `### Open` in the Task Queue, at the consistent altitude described above. When the loop hits step 9 and the queue is drained, that's the signal to convene the planning layer for the next increment — then restart the loop. The judges' evolution memo is a useful input there: it records how the panel's taste has been sharpening across everything shipped.
