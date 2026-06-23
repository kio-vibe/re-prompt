---
name: re-prompt
description: Use when the user asks to review, retro, postmortem, or improve a previous Codex coding session with re-prompt. Covers phrases like "re-prompt로 봐줘", "이 Codex 세션 회고해줘", "analyze my last Codex session", or "make a better prompt from this session".
metadata:
  priority: 5
  bashPatterns:
    - '\bre-prompt\b'
  promptSignals:
    phrases:
      - "re-prompt"
      - "Codex session retro"
      - "analyze my Codex session"
      - "review my last Codex session"
      - "better prompt from this session"
      - "re-prompt로 봐줘"
      - "Codex 세션 회고"
      - "이 세션 회고"
      - "다음 프롬프트"
    anyOf:
      - "re-prompt"
      - "retro"
      - "postmortem"
      - "Codex session"
      - "세션"
      - "회고"
      - "프롬프트"
    minScore: 4
---

# re-prompt

Use the local `re-prompt` CLI to review stored Codex sessions and turn session friction into better next prompts.

## Product Boundary

- `re-prompt` reads local Codex stored sessions under `~/.codex/sessions`.
- It does not need raw transcript text pasted into chat.
- Do not ask the user to paste raw rollout JSONL, private code, secrets, or unredacted command output.
- Prefer short redacted excerpts from `re-prompt` output when discussing report quality.

## First Step

Check whether the CLI exists:

```bash
re-prompt --version
```

If missing, direct the user to `/re-prompt-install`. Do not install automatically from a natural-language request.

## Default Flows

For a first look:

```bash
re-prompt go
```

For the latest analyzable session:

```bash
re-prompt last
```

For the best evaluation flow:

```bash
re-prompt scan --since 30d
re-prompt retro <session-id-or-path>
```

For durable AGENTS.md suggestions:

```bash
re-prompt rules --since 30d
```

## Optional Analyzer Engines

`scan`, `go`, and `rules` are heuristic-only.

Only `retro` and `last` support external CLI analyzers:

```bash
re-prompt retro <session-id-or-path> --engine codex
re-prompt retro <session-id-or-path> --engine claude
re-prompt last --engine codex
re-prompt last --engine claude
```

Use these only when the user explicitly asks for Codex or Claude enhanced analysis. These commands send a redacted EvidenceBundle to the selected CLI, not raw transcripts.

## Response Style

When summarizing a report for the user, include:

- Respond in the user's language. If the user writes Korean, summarize in Korean.
- Use the surrounding conversation language for short slash-command messages. If recent conversation is Korean, respond in Korean even when the slash command itself is English.
- Do not announce that you are using the skill unless the user asks.
- Start with the result, not the process.
- Do not paste raw CLI output verbatim; explain it in beginner-friendly wording.
- selected session id and confidence
- main friction point
- strongest turn evidence
- best copy-pasteable next prompt
- whether the report used heuristic mode, Codex, Claude, or fallback

Use this glossary for `re-prompt go` output:

- `Friction` = "꼬였을 가능성" in Korean, "review priority" in English.
- `Turns` = "대화/작업 횟수" in Korean, "conversation length" in English.
- `file_churn` = "파일을 여러 번 고치며 왕복함" in Korean, "repeated file edits" in English.
- `heuristic-only` = "외부 AI 호출 없이 로컬 규칙으로 분석" in Korean, "local rules only, no external AI call" in English.

Keep the summary short and practical.
