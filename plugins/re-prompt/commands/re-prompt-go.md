---
description: Start the guided re-prompt flow for recent local Codex sessions.
---

# re-prompt Go

Run the first-use guided flow for local Codex session retrospectives.

## Preflight

1. Check the CLI:

```bash
re-prompt --version
```

If missing, run `/re-prompt-install` first. Do not install automatically from this command.

2. Explain that `re-prompt` reads local `~/.codex/sessions` metadata and redacted evidence.

## Command

Run:

```bash
re-prompt go --next-style plugin --language auto
```

## Result

Do not paste the raw CLI output back verbatim. Summarize it in the user's language with beginner-friendly wording.

Use this glossary when translating CLI terms:

- `Friction` means "꼬였을 가능성" in Korean and "review priority" in English.
- `Turns` means "대화/작업 횟수" in Korean and "conversation length" in English.
- `file_churn` means "파일을 여러 번 고치며 왕복함" in Korean and "repeated file edits" in English.
- `heuristic-only` means "외부 AI 호출 없이 로컬 규칙으로 분석" in Korean and "local rules only, no external AI call" in English.

Summarize:

- whether Codex sessions were found
- the top session worth reviewing, using easy language rather than internal scoring jargon
- the exact `/re-prompt-retro <session-id>` slash command suggested by the CLI
- `/re-prompt-last` and `/re-prompt-rules` as secondary next steps

Do not paste raw transcripts. If no sessions exist, tell the user to run Codex on a coding task first and then retry. Respond in the user's language.
