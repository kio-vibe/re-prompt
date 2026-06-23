---
name: re-prompt
description: Use when the user types /re-prompt or asks to review, coach, retro, postmortem, or improve a previous Codex coding session with re-prompt.
metadata:
  priority: 7
  bashPatterns:
    - '\bre-prompt\b'
  promptSignals:
    phrases:
      - "/re-prompt"
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

Use the local `re-prompt` CLI to help the user choose one stored Codex session, then coach the user's actual prompt wording in their own voice.

## Product Boundary

- `re-prompt` reads local Codex stored sessions under `~/.codex/sessions`.
- Do not ask the user to paste raw rollout JSONL, private code, secrets, or unredacted command output.
- Do not directly read, grep, cat, parse, or inspect `~/.codex/sessions/**/*.jsonl`.
- Do not use ad hoc Node/Python scripts to inspect stored rollout files.
- Do not paste raw CLI output verbatim. Summarize it in beginner-friendly wording.
- When rewriting, rewrite them in the user's own voice rather than generic AI prose.
- Prefer short redacted excerpts from `re-prompt` output when discussing report quality.
- Respond in the user's language. For short slash-command messages, use the surrounding conversation language. If recent conversation is Korean, respond in Korean.
- Do not announce that you are using the skill unless the user asks.
- Start with the result, not the process.
- Before running candidate or coach commands, choose one fixed response language from the conversation: Korean uses `ko`; English uses `en`.
- Do not use visible process narration such as "I'll pull candidates", "코칭 리포트를 만들게요", or "The CLI is current enough".
- The visible answer must start directly with the candidate list or the coaching result.

## First Step

Check whether the CLI exists:

```bash
re-prompt --version
```

Minimum supported CLI version for this skill: `0.4.0`.

If the command is missing, say that the CLI is not installed and ask before running any install command. The current release tarball is:

```bash
npm install -g https://github.com/kio-vibe/re-prompt/releases/download/v0.4.2/re-prompt-0.4.2.tgz
```

If `re-prompt --version` is older than `0.4.0`, do not run `re-prompt candidates`, `scan`, `go`, `coach`, `retro`, direct JSONL reads, or any fallback script. Tell the user briefly that the CLI is outdated and ask whether they want to update:

```text
re-prompt CLI가 오래됐습니다. 현재 버전은 <version>이고, /re-prompt에는 0.4.0 이상이 필요합니다. 아래 명령으로 0.4.2로 업데이트해도 될까요?
```

```bash
npm install -g https://github.com/kio-vibe/re-prompt/releases/download/v0.4.2/re-prompt-0.4.2.tgz
```

Do not install automatically from a natural-language request.

## Safe Failure Behavior

Candidate lists must come from `re-prompt candidates` only.

If `re-prompt candidates` exits non-zero, do not fallback to `scan`, `go`, or manual transcript reading. Do not infer candidates from transcript paths. Stop and summarize the setup problem. Suggest checking:

```bash
re-prompt --version
re-prompt doctor
```

Never open stored rollout files directly as a recovery path.

## Default Conversation Flow

When the user starts with `/re-prompt` or asks to use re-prompt without a specific session:

```bash
re-prompt candidates --format json --top 3 --language ko
re-prompt candidates --format json --top 3 --language en
```

Use exactly one of those commands, based on the fixed response language chosen from the conversation. Do not use `--language auto` in the plugin flow.

Summarize the result as:

- "먼저 볼 후보 3개" / "Three sessions worth reviewing first"
- for each candidate: what the chat was about, why it is worth reviewing, and one short likely issue
- ask the user to choose only a number, such as `1번`, `2번`, or `1`

Do not show internal fields such as scores, `Friction`, `file_churn`, `heuristic-only`, `Main cause`, or raw transcript paths.

## Number Selection

If the user replies with a number and the previous assistant message contains a candidate list, map that number to the matching `sessionId`.

If there is no usable candidate list in the conversation context, rerun:

```bash
re-prompt candidates --format json --top 3 --language ko
re-prompt candidates --format json --top 3 --language en
```

Use the same fixed response language as above.

Then ask the user to choose again.

## Coach The Selected Session

When a candidate is selected, run:

```bash
re-prompt coach <session-id> --engine codex --language ko
re-prompt coach <session-id> --engine codex --language en
```

Use exactly one of those commands, matching the response language used for the candidate list.

Use `--engine claude` only when the user explicitly asks for Claude. If the Codex or Claude analyzer falls back, explain briefly that re-prompt used a safer local fallback.

Summarize the coach output in this order:

1. "다음엔 이렇게 말하면 돼요" / "Say this next time"
2. the short, copy-pasteable rewrite
3. "조금 더 탄탄하게 쓰면" / "If you want the fuller version"
4. the fuller rewrite
5. "왜 이게 더 좋은지" / "Why this works"
6. "중간에 끊고 싶으면 이 한 문장" / "One rescue line"

Put `shortRewriteInYourVoice` first when it exists. Keep the user's sentence shape and tone whenever the coach output provides it. If `shortRewriteInYourVoice` is absent, use the first compact paragraph of `rewriteInYourVoice` as the short rewrite.

## Continue The Loop

After coaching one candidate, suggest another candidate from the previous list:

- Korean: `다른 후보도 볼까요? 2번이나 3번을 말하면 이어서 볼게요.`
- English: `Want to check another candidate? Reply with 2 or 3.`

If the user asks for rules or detailed forensic output, explain that those are advanced CLI flows:

```bash
re-prompt rules --since 30d
re-prompt retro <session-id-or-path>
re-prompt last
```

Keep normal user-facing guidance centered on `/re-prompt`.
