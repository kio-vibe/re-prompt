---
name: re-prompt-rules
description: Use when the user types /re-prompt-rules or asks to preview AGENTS.md rule suggestions from recent re-prompt evidence.
metadata:
  priority: 6
  promptSignals:
    phrases:
      - "re-prompt-rules"
      - "/re-prompt-rules"
      - "re-prompt rules"
      - "AGENTS.md suggestions"
      - "AGENTS.md 규칙"
---

# re-prompt-rules

Preview conservative AGENTS.md rule suggestions from repeated recent Codex session evidence.

## Product Boundary

- `re-prompt rules` is heuristic-only and dry-run only.
- Do not ask the user to paste raw rollout JSONL, private code, secrets, or unredacted command output.
- Respond in the user's language. If the user writes Korean, summarize in Korean.
- Do not apply AGENTS.md changes automatically.

## Command

Check whether the CLI exists:

```bash
re-prompt --version
```

If missing, direct the user to `/re-prompt-install`. Do not install automatically.

Run:

```bash
re-prompt rules --since 30d
```

## Response Style

Summarize whether any durable rule was suggested. If no rule is suggested, explain that this is expected when evidence is one-off or too generic.
