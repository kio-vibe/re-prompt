---
name: re-prompt-retro
description: Use when the user types /re-prompt-retro or asks to analyze a specific Codex session id or transcript path with re-prompt.
metadata:
  priority: 6
  promptSignals:
    phrases:
      - "re-prompt-retro"
      - "/re-prompt-retro"
      - "re-prompt retro"
      - "session id"
      - "세션 ID"
---

# re-prompt-retro

Analyze a specific Codex session by id or transcript path.

## Product Boundary

- `re-prompt` reads local Codex stored sessions under `~/.codex/sessions`.
- Do not ask the user to paste raw rollout JSONL, private code, secrets, or unredacted command output.
- Respond in the user's language. If the user writes Korean, summarize in Korean.

## Command

Check whether the CLI exists:

```bash
re-prompt --version
```

If missing, direct the user to `/re-prompt-install`. Do not install automatically.

If the user provided a session id or transcript path, run:

```bash
re-prompt retro <session-id-or-path>
```

If no session id/path is provided, run `re-prompt scan --since 30d` and ask which `Session` value to analyze.

Only use `--engine codex` or `--engine claude` when the user explicitly asks for enhanced analysis.

## Response Style

Summarize where the session got expensive, the cited turn evidence, the better initial prompt, and the most useful rescue prompt. Do not paste raw transcript content.
