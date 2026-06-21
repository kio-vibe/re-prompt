---
description: Analyze a specific Codex session by id or transcript path with re-prompt.
---

# re-prompt Retro

Analyze a specific session. Use this when the user has a session id from `/re-prompt-go` or `re-prompt scan`.

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

Default local heuristic report:

```bash
re-prompt retro <session-id-or-path>
```

Optional CLI-enhanced reports:

```bash
re-prompt retro <session-id-or-path> --engine codex
re-prompt retro <session-id-or-path> --engine claude
```

Use `--engine codex` or `--engine claude` only when the user explicitly asks for it.

## Result

Summarize:

- where the session got expensive
- the cited turn evidence
- the better initial prompt
- the most relevant rescue prompt
- whether any AGENTS.md rule was suggested

Do not paste raw transcript content.
