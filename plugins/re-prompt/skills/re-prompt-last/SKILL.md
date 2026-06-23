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

Coach the latest analyzable local Codex session prompt.

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

Default prompt coach:

```bash
re-prompt coach --engine codex --language auto
```

Only use `--engine claude` when the user explicitly asks for Claude. Use `re-prompt last` only when the user asks for the detailed forensic report.

## Response Style

Use the surrounding conversation language for short slash-command messages. If recent conversation is Korean, respond in Korean even when the slash command itself is English.

Do not announce that you are using the skill unless the user asks. Start with the result, not the process.

Do not paste raw CLI output verbatim. Summarize it in beginner-friendly wording.

Summarize what the user actually wrote, where that wording was hard for the agent to execute, the rewrite in the user's own voice, and the one rescue line they can use next time. Keep it short and practical.
