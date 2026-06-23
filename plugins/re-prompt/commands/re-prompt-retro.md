---
description: Analyze a specific Codex session by id or transcript path with re-prompt.
---

# re-prompt Retro

Coach a specific session prompt. Use this when the user has a session id from `/re-prompt-go` or `re-prompt scan`.

## Preflight

Check the CLI:

```bash
re-prompt --version
```

If missing, run `/re-prompt-install` first. Do not install automatically from this command.

## Input

Use the command arguments as the session id or transcript path. If no session id/path is provided, run:

```bash
re-prompt scan --since 30d
```

Then ask the user which `Session` value to analyze.

## Command

Default prompt coach:

```bash
re-prompt coach <session-id-or-path> --engine codex --language auto
```

Detailed forensic report, only when the user explicitly asks for it:

```bash
re-prompt retro <session-id-or-path>
```

Use `re-prompt coach <session-id-or-path> --engine claude --language auto` only when the user explicitly asks for Claude.

## Result

Summarize the coach output:

- what the user actually wrote
- where that wording was hard for the agent to execute
- the rewrite in the user's own voice
- the one rescue line they could use next time

Do not paste raw transcript content.
