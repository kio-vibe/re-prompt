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

Start the guided local re-prompt flow.

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

- the first session worth reviewing
- why that session is worth reviewing
- the exact next command

Use this glossary:

- `Friction` = "꼬였을 가능성" in Korean, "review priority" in English.
- `Turns` = "대화/작업 횟수" in Korean, "conversation length" in English.
- `file_churn` = "파일을 여러 번 고치며 왕복함" in Korean, "repeated file edits" in English.
- `heuristic-only` = "외부 AI 호출 없이 로컬 규칙으로 분석" in Korean, "local rules only, no external AI call" in English.

Include the exact `/re-prompt-retro <session-id>` next command when one is suggested.
