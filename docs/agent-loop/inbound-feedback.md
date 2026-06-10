# Inbound feedback — loop inbox

An append-only inbox the `/loop` runner reads on **every** iteration (step 2 of the prompt in `LOOP-OPS.md`). Deliberately a single local file — no connectors, no API calls, cheap to read every cycle.

Each line is one item: `[ ]` = unseen, `[x]` = the loop has processed it.

## How items get in (push, not pull)

Anything can append a line — a Slack webhook, a manual paste, a cron job. The **only** contract is the line format. Keep it append-only: add lines, never rewrite or delete them.

**Line format:**

```
- [ ] <ISO-date> · <source> · <who> — <verbatim text>
```

Examples:

```
- [ ] 2026-06-09 · slack#recipe-guide · andrew — Tonight page feels cramped on mobile
- [ ] 2026-06-09 · blog-comment · anon — "love it but the timer beep is too quiet"
```

A minimal Slack-webhook appender is just one shell line, e.g.:

```bash
printf '\n- [ ] %s · slack#%s · %s — %s\n' "$DATE" "$CHANNEL" "$USER" "$TEXT" \
  >> docs/agent-loop/inbound-feedback.md
```

(Wiring the actual webhook is out of scope here — the file works today with manual paste.)

## How the loop handles each unseen item

1. **Small, unambiguous bug/tweak** → add a `[ ]` item to the Task Queue in `QUEUE.md`.
2. **Recurring theme / direction change** → append to the roadmap backlog for the agent team. The loop does **not** act on a large pivot unilaterally.
3. **FYI / praise** → no action.

Then flip the line `[ ]` → `[x]` so it isn't reprocessed. **Never delete** — `[x]` is the audit trail of what's been triaged.

---

## Inbox

<!-- append new items below this line; the loop flips [ ] → [x] in place -->
