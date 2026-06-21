---
description: Analyze the latest analyzable local Codex session with re-prompt.
---

# re-prompt Last

Analyze the latest analyzable stored Codex session.

## Preflight

Check the CLI:

```bash
re-prompt --version
```

If missing, run `/re-prompt-install` first. Do not install automatically from this command.

## Command

Default local heuristic report:

```bash
re-prompt last
```

Optional CLI-enhanced reports:

```bash
re-prompt last --engine codex
re-prompt last --engine claude
```

Use `--engine codex` or `--engine claude` only when the user explicitly asks for an enhanced report. These engines receive a redacted EvidenceBundle, not raw transcripts.

## Result

Summarize the report's:

- selected session and selection confidence
- main friction cause
- most useful better prompt or rescue prompt
- analyzer line, including fallback if present

Do not paste raw transcript content.
