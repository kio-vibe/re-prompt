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

Use the local `re-prompt` CLI to coach stored Codex session prompts and rewrite them in the user's own voice.

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
re-prompt coach --engine codex --language auto
```

For the best evaluation flow:

```bash
re-prompt scan --since 30d
re-prompt coach <session-id-or-path> --engine codex --language auto
```

For durable AGENTS.md suggestions:

```bash
re-prompt rules --since 30d
```

## Optional Analyzer Engines

`scan`, `go`, and `rules` are heuristic-only.

Detailed forensic reports are still available:

```bash
re-prompt retro <session-id-or-path>
re-prompt last
```

Use `coach --engine claude` only when the user explicitly asks for Claude. Coach mode sends a redacted prompt-coach bundle to the selected CLI, not raw transcripts.

## Response Style

When summarizing a report for the user, include:

- Respond in the user's language. If the user writes Korean, summarize in Korean.
- Use the surrounding conversation language for short slash-command messages. If recent conversation is Korean, respond in Korean even when the slash command itself is English.
- Do not announce that you are using the skill unless the user asks.
- Start with the result, not the process.
- Do not paste raw CLI output verbatim; explain it in beginner-friendly wording.
- selected session id and confidence
- what the user actually wrote
- where that wording got in the way
- the rewrite in the user's own voice
- whether the coach used Codex, Claude, or fallback

Avoid internal scoring jargon such as `Friction`, `file_churn`, `heuristic-only`, or `Main cause` in user-facing summaries.

Keep the summary short and practical.
