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
re-prompt go --next-style plugin --language auto
```

## Result

Do not paste the raw CLI output back verbatim. Summarize it in the user's language with beginner-friendly wording.

Summarize:

- whether Codex sessions were found
- the rough top candidate, using easy language rather than internal scoring jargon
- that `/re-prompt-go` is only local triage, not the final coach judgment
- the exact `/re-prompt-retro <session-id>` slash command suggested by the CLI
- `/re-prompt-last` and `/re-prompt-rules` as secondary next steps

Do not paste raw transcripts. If no sessions exist, tell the user to run Codex on a coding task first and then retry. Respond in the user's language.
