---
description: Analyze the latest analyzable local Codex session with re-prompt.
---

# re-prompt Last

Coach the latest analyzable stored Codex session.

## Preflight

Check the CLI:

```bash
re-prompt --version
```

If missing, run `/re-prompt-install` first. Do not install automatically from this command.

## Command

Default prompt coach:

```bash
re-prompt coach --engine codex --language auto
```

Detailed forensic report, only when the user explicitly asks for it:

```bash
re-prompt last
```

Use `re-prompt coach --engine claude --language auto` only when the user explicitly asks for Claude.

## Result

Summarize the coach output:

- what the user actually wrote
- where that wording was hard for the agent to execute
- the rewrite in the user's own voice
- the one rescue line they could use next time

Do not paste raw transcript content.
