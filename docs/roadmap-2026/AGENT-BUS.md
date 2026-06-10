# Agent Bus — flat-file direct messages between sessions

A cheap, async, cross-session message bus for the agent team (planning scouts, the standing judge panel, the loop, the chair). Agents "DM" each other by **appending one line to the recipient's inbox file**; a recipient reads *its* unread by reading **one small file** and filtering for unsigned `[ ]` lines. No daemon, no API — just files. Survives restarts; cheap to poll.

When an agent has considered a message it **signs** it — replaces the empty `[ ]` with `[seen:<agent> <ISO-ts>]`. The trail therefore records not just *that* a message was handled but *by whom and when*: a signed line is accountable, an opaque checkmark is not.

Why not only `SendMessage`? That requires the peer to be live and is a direct harness call. The bus is **durable, async, and cross-session**: a scout can drop findings for a peer that hasn't spawned yet; a judge can leave a note the loop reads three iterations later. The two complement each other — use `SendMessage` for live hand-offs, the bus for share-as-you-go signaling.

## Layout (runtime — gitignored, lives at `.agents/bus/`)

```
.agents/bus/
  <agent>.inbox.md      # one inbox per agent; append-only; [ ] unread / [seen:<who> <ts>] considered
  topics/<topic>.md     # broadcast streams subscribers tail (e.g. topics/planning-findings.md)
  payloads/<id>.md      # larger bodies a message line points to (keep inbox lines short)
```

The directory is gitignored — these are high-churn runtime messages, not source. The durable record stays in git, the Task Queue, and the evolution memo. Create the dir on first use: `mkdir -p .agents/bus/topics .agents/bus/payloads`.

## Addresses (stable agent names)

`loop`, `planner` (the convener), `scout-<lens>` (planning scouts), `judge-caretaker` … `judge-architect`, `chair`. Pick a stable name per role so inboxes are predictable.

## Send a DM

Append to `.agents/bus/<recipient>.inbox.md` (create the file if missing):

```
- [ ] <ISO-ts> · from:<me> · <subject> [· payload:.agents/bus/payloads/<id>.md]
```

Keep the line short. Put anything big (findings, diffs, candidate sets) in a `payloads/<id>.md` file and point to it — that keeps every reader's inbox cheap.

## Read your unread (the cheap path)

Read `.agents/bus/<me>.inbox.md`; for each `[ ]` line, act on it (open the payload if referenced), then **sign it**: replace `[ ]` with `[seen:<me> <ISO-ts>]`. **Never delete** — the signature is the audit trail: anyone can see who considered the message and when. Re-reading an already-signed line is a no-op, so polling is safe and idempotent.

```
- [ ] 2026-06-10T03:14Z · from:scout-architect · TTS swap touches alarm-adjacent code, flag it
                ↓ after the loop reads + acts
- [seen:loop 2026-06-10T03:31Z] 2026-06-10T03:14Z · from:scout-architect · TTS swap touches alarm-adjacent code, flag it
```

## Broadcast (one-to-many)

Append to `.agents/bus/topics/<topic>.md`. Because many agents read a topic, signatures **stack** — each reader that considers a line appends its own `[seen:<me> <ts>]` token to the end of that line. A reader skips lines it has already signed. (For very hot topics, a reader may instead keep a "last-seen line N" cursor in its own inbox.) Use a topic when many agents care (e.g. `planning-findings`); a direct inbox when one does.

## Etiquette

- **One concern per message.** Point to payloads; don't inline large diffs.
- **Short inbox lines, fat payloads** — so reading an inbox stays O(small).
- **Sign, don't erase** — consideration is attributable; `[seen:<who> <ts>]` is the record.
- **Idempotent by construction** — a signed line is skipped on re-read, so polling never double-acts.
- **The bus is coordination, not the record** — durable truth is git + the Task Queue + the evolution memo.
