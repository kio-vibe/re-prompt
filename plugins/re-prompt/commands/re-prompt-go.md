---
description: Start the guided re-prompt flow for recent local Codex sessions.
---

# re-prompt Go

Run the first-use guided flow for local Codex session retrospectives.

## Preflight

1. Check the CLI:

```bash
re-prompt --version
```

If missing, run `/re-prompt-install` first. Do not install automatically from this command.

2. Explain that `re-prompt` reads local `~/.codex/sessions` metadata and redacted evidence.

## Command

Run:

```bash
re-prompt go --next-style plugin
```

## Result

Summarize:

- whether Codex sessions were found
- the top ranked high-friction session
- the exact `/re-prompt-retro <session-id>` slash command suggested by the CLI
- `/re-prompt-last` and `/re-prompt-rules` as secondary next steps

Do not paste raw transcripts. If no sessions exist, tell the user to run Codex on a coding task first and then retry. Respond in the user's language.
