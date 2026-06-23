---
name: re-prompt-install
description: Use when the user types /re-prompt-install or asks to check or install the local re-prompt CLI.
metadata:
  priority: 6
  promptSignals:
    phrases:
      - "re-prompt-install"
      - "/re-prompt-install"
      - "install re-prompt"
      - "re-prompt 설치"
---

# re-prompt-install

Check and, only with explicit user approval, install the local `re-prompt` CLI.

## Product Boundary

- Do not ask the user to paste raw rollout JSONL, private code, secrets, or unredacted command output.
- Respond in the user's language. If the user writes Korean, summarize in Korean.
- Do not install anything automatically from a natural-language request.

## Preflight

Run only these checks first:

```bash
node --version
command -v re-prompt
re-prompt --version
re-prompt doctor
```

If `re-prompt --version` prints the expected current version and `re-prompt doctor` succeeds, report setup complete briefly.

## Install

If the CLI is missing, tell the user exactly what will be installed and ask for confirmation before running any install command.

Preferred GitHub Release tarball install:

```bash
npm install -g https://github.com/kio-vibe/re-prompt/releases/download/v0.3.1/re-prompt-0.3.1.tgz
```

## Response Style

Use the surrounding conversation language for short slash-command messages. If recent conversation is Korean, respond in Korean even when the slash command itself is English.

Do not announce that you are using the skill unless the user asks. Start with the result, not the process.

Do not paste raw CLI output verbatim. Summarize it in beginner-friendly wording.

Keep successful setup responses quiet and short.
