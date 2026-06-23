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

Coach a specific Codex session prompt by id or transcript path.

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
re-prompt coach <session-id-or-path> --engine codex --language auto
```

If no session id/path is provided, run `re-prompt scan --since 30d` and ask which `Session` value to analyze.

Only use `--engine claude` when the user explicitly asks for Claude. Use `re-prompt retro <session-id-or-path>` only when the user asks for the detailed forensic report.

## Response Style

Use the surrounding conversation language for short slash-command messages. If recent conversation is Korean, respond in Korean even when the slash command itself is English.

Do not announce that you are using the skill unless the user asks. Start with the result, not the process.

Do not paste raw CLI output verbatim. Summarize it in beginner-friendly wording.

Organize the summary in this order:

- what the user actually wrote
- where that wording got in the way
- the rewrite in the user's own voice
- the one rescue line they can use next time

Do not paste raw transcript content.
