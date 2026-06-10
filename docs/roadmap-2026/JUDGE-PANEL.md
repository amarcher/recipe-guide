# The Persistent Judge Panel

The standing gatekeepers of the autonomous loop. Five long-lived agents — one per product lens — that receive a *stream* of feature hackathons and judge them in sequence, **retaining everything they've judged before**. They are the continuity of taste: a judge that remembers the last 40 features evaluates #41 for *coherent evolution*, not in isolation.

Economics: ~5 ephemeral builders **per feature**, but only **5 judges across all features**. They amortize.

See `LOOP-OPS.md` for how they slot into the loop; this file is the protocol.

## The panel

| Agent name | Lens | Persona source | Core concern |
|---|---|---|---|
| `judge-caretaker` | Caretaker | `positions/01-caretaker.md` | Does this serve real family life — low-friction, warm, for the household? |
| `judge-execution` | Plan-execution | `positions/02-plan-execution.md` | Planner→cook handoff; the execution layer stays sacred and untouched. |
| `judge-visual` | Visual-design | `positions/03-visual-design.md` | Aesthetic quality; does it look and feel considered and on-brand? |
| `judge-sharing` | Sharing-network | `positions/04-sharing-network.md` | Family / sharing / scope semantics are correct. |
| `judge-architect` | Architect | `positions/05-architect.md` | Schema and reliability; sound, tested, gotcha-safe, smallest clean diff. |

## Lifecycle

**Spawn once** (first loop run, or after a restart): start each as a **named background agent**. On spawn, the judge must **rehydrate**:

1. Read its persona file (`positions/0X-*.md`) and embody it.
2. Read its section of `judges-evolution-memo.md` — the durable record of what it has learned about how this app should evolve.
3. Reply "ready" and wait for features.

> Why the memo matters: a standing session eventually compacts or restarts, and in-session memory dies with it. The memo is the judge's persistent brain. It also gives Andrew a readable window into how the panel's taste is sharpening, and it's a natural input for the planning layer's next increment.

**Continue per feature** via `SendMessage` to the same agent — its accumulated context (and memo) carries forward. Never re-spawn a judge that's already alive; that throws away its continuity.

## Per-feature protocol (what the loop sends each judge)

The loop sends the **blind** candidate set — labels `A–E`, lens-of-origin **stripped** (the hackathon rotates the label↔lens mapping with a per-feature salt, so judges cannot learn "A is always caretaker"). Template:

```
FEATURE <id> — <title>
Outcome: <outcome>.  Done-when: <doneWhen>.

Candidates (blind). For each: summary, approach, unified diff, self-checks.
--- A ---
<summary / approach / diff / checks>
--- B ---
…

As the <lens> judge, score EACH candidate on the rubric (1–5 each, with one-line reasons):
  1. Delivers the outcome
  2. Layers cleanly (execution layer untouched; Anthropic-schema / NULL-distinct / vitest-no-prisma gotchas respected)
  3. Product feel (right for this household)
  4. Code health (tsc/eslint/tests green; sound structure)
  5. Smallest clean diff
Then add your lens-specific concern, name your top pick + your veto (if any), and
APPEND a dated one-line note to your section of judges-evolution-memo.md capturing what
this feature taught you about where the app is heading.

Return: { scores: {A:{...}, …}, topPick: "<label>", veto: "<label|none>", oneLineRationale }
```

A judge **veto** is a hard signal — a candidate a lens considers actively wrong (e.g. architect veto = it breaks a gotcha; execution veto = it touched the sacred layer). But a judge veto is **resolved inside the panel by majority** — if a lens vetoes candidate A and the other four still rank A best, the majority overrules the veto and A wins. **This never escalates to Andrew** — the panel governs itself. The chair should not lightly override a veto, but it *can* when the majority clearly does; it records the overruled veto in the rationale.

This is distinct from **Andrew's veto**, which is supreme and lives *outside* the panel: it overrides any consensus, before or after merge, and is the only veto a human casts. The panel never blocks waiting for him.

## The chair (per-feature, ephemeral)

After collecting the five verdicts, the loop spawns a short-lived **chair** with: the five verdicts, the blind candidates, and the evolution memos. The chair:

1. Reaches **consensus by majority** — weighs the five lenses, resolves any judge veto by majority (overruling it if the majority disagrees, and saying so), picks the **winning label**.
2. Writes a **graft list** — the best ideas from the runners-up worth folding into the winner.
3. Hands back `{ winnerLabel, rationale, graftList }`.

The loop then resolves `winnerLabel → branch` via the hackathon's private key, applies the graft onto the winner's branch (a worktree agent), and opens the PR. Merge follows on panel consensus + Vercel green — Andrew's 👍 is not required; his standing veto can override async. The PR body carries the chair's rationale + the panel's scores so Andrew can see *why this version won* if he chooses to look.

The chair is ephemeral on purpose — judging continuity lives in the five standing lenses and the memo, not the chair.

## Anti-bias notes

- **Blind labels, salt-rotated per feature** — kills self-favoritism even though builders and judges share the five lenses.
- **Vetoes are cheap and loud** — a lens should veto freely when something is actually wrong; it's better than a quiet low score lost in the average.
- **The memo is append-only per judge** — never rewrite history; the trail of sharpening taste is the value.

## Bootstrapping checklist (for the loop's step 2)

1. Are `judge-caretaker … judge-architect` alive? If yes, skip.
2. If not, spawn all five as background agents, each rehydrating from persona + memo.
3. Confirm all five reply "ready" before sending the first feature.
