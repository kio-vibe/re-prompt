---
name: re-prompt-last
description: Use when the user types /re-prompt-last or asks to analyze the latest local Codex session with re-prompt.
metadata:
  priority: 6
  promptSignals:
    phrases:
      - "re-prompt-last"
      - "/re-prompt-last"
      - "re-prompt last"
      - "latest Codex session"
      - "최근 Codex 세션"
---

# re-prompt-last

Analyze the latest analyzable local Codex session.

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

Default local heuristic report:

```bash
re-prompt last
```

Only use `--engine codex` or `--engine claude` when the user explicitly asks for enhanced analysis.

## Response Style

Summarize the selected session, confidence, main friction point, strongest evidence, and best next prompt. Keep it short and practical.
