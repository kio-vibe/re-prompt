---
description: Preview conservative AGENTS.md rules from repeated recent re-prompt evidence.
---

# re-prompt Rules

Preview conservative AGENTS.md rule suggestions from recent Codex sessions.

## Preflight

Check the CLI:

```bash
re-prompt --version
```

If missing, run `/re-prompt-install` first. Do not install automatically from this command.

## Command

Run:

```bash
re-prompt rules --since 30d
```

## Safety

This is a dry-run preview. It must not modify AGENTS.md unless a future explicit apply flag exists and the user asks for it.

## Result

Summarize whether any durable repo rules were suggested. If no rules were suggested, say that re-prompt did not find repeated evidence strong enough for AGENTS.md.
