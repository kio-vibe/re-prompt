---
name: re-prompt-go
description: Use when the user types /re-prompt-go or asks to start the guided re-prompt flow for recent local Codex sessions.
metadata:
  priority: 6
  promptSignals:
    phrases:
      - "re-prompt-go"
      - "/re-prompt-go"
      - "re-prompt go"
      - "recent Codex sessions"
      - "최근 세션"
---

# re-prompt-go

Start the guided local re-prompt flow. This is only rough local triage; the actual prompt coaching happens in `/re-prompt-retro`.

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

Run:

```bash
re-prompt go --next-style plugin --language auto
```

## Response Style

Use the surrounding conversation language for short slash-command messages. If recent conversation is Korean, respond in Korean even when the slash command itself is English.

Do not announce that you are using the skill unless the user asks. Start with the result, not the process.

Do not paste raw CLI output verbatim. Summarize it in beginner-friendly wording.

Organize the summary around:

- the first rough candidate worth inspecting
- why that session is only a candidate, not a final judgment
- the exact next command

Avoid internal scoring jargon such as `Friction`, `file_churn`, `heuristic-only`, or `Main cause`.

Include the exact `/re-prompt-retro <session-id>` next command when one is suggested.
