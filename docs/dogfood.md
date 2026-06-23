# Dogfooding re-prompt

This guide is for early testers trying `re-prompt` against their own local Codex sessions.

The goal is not to collect raw transcripts. The goal is to learn whether one `/re-prompt` flow can help you pick a chat, see what went wrong in your own wording, and get a better prompt in your own voice.

## Install Or Update The CLI

`re-prompt` is not published to npm yet. Install or update the packaged CLI first:

```bash
npm install -g https://github.com/kio-vibe/re-prompt/releases/download/v0.4.1/re-prompt-0.4.1.tgz
re-prompt --version
```

Expected version:

```txt
0.4.1
```

## Install The Codex Plugin

Then install the local Codex plugin from a repository clone:

```bash
git clone https://github.com/kio-vibe/re-prompt.git
cd re-prompt
codex plugin marketplace add .
codex plugin add re-prompt@re-prompt-local
```

Pass the repository root to `codex plugin marketplace add`; Codex finds `.agents/plugins/marketplace.json` inside it.

Start a new Codex thread after installing the plugin. Then run:

```text
/re-prompt
```

Source CLI install is a fallback for maintainers and contributors:

```bash
pnpm install
pnpm build
node dist/cli.js --version
```

The personal skill installer and plugin install do not install or update the global CLI. If `/re-prompt` says the CLI is outdated, rerun the release tarball install command above.

## Run

Normal dogfood flow:

```text
/re-prompt
1번
2번
```

The first `/re-prompt` call should show a few candidate Codex chats. Choose one by number. After the coaching output, choose another number if you want to keep comparing.

These commands need local Codex stored sessions under your Codex home. They are most useful on a machine where you have already used Codex CLI.

Advanced analyzer comparison remains available from the terminal:

```bash
re-prompt coach <session-id-or-path> --engine codex
re-prompt coach <session-id-or-path> --engine claude
```

These engines receive only a redacted prompt-coach bundle. `candidates`, `scan`, `go`, and `rules` remain heuristic-only.

## What to check

A good coach result:

- makes the candidate list easy to choose from
- explains what each chat was about without exposing raw transcript text
- shows a short piece or summary of what you actually wrote
- says where that wording became ambiguous, late, broad, or hard to execute
- rewrites the prompt in a way that still sounds like you
- gives one rescue line you would actually use mid-session
- makes analyzer fallback visible when Codex or Claude analysis is unavailable

A bad coach result:

- says only "be more specific" or "provide more context"
- invents the user's goal or the session outcome
- sounds like generic AI project-management prose
- loses the user's tone, sentence structure, or directness
- makes the candidate list feel like a scorecard
- leaks local paths, private repo details, secrets, or raw transcript content
- hides analyzer fallback or makes an external analyzer report look more certain than the evidence supports

## What not to share publicly

Do not paste raw Codex transcripts into GitHub issues.

Codex transcripts may contain private code, prompts, local paths, command output, environment details, API keys, credentials, or business context. Share only short redacted excerpts from `re-prompt` output when they are needed to explain the feedback.

Good public feedback:

- "Candidate 1 was actually not the messy session; Candidate 2 was."
- "The rewrite kept my wording, but it missed the actual constraint I cared about."
- "The rescue line was useful, but the candidate summary was too vague."

Avoid public feedback like:

- full transcript JSONL
- private source snippets
- unredacted command output
- absolute home paths
- credentials or config values

See [privacy for dogfood](privacy-for-dogfood.md) before opening an issue.

## Feedback channels

Use the GitHub issue templates:

- [Retro report quality feedback](../.github/ISSUE_TEMPLATE/retro-quality-feedback.yml)
- [Install or parser bug](../.github/ISSUE_TEMPLATE/install-or-parser-bug.yml)
- [False positive or misleading finding](../.github/ISSUE_TEMPLATE/false-positive-or-misleading.yml)

## Dogfood success criteria

Green:

- people understand what `/re-prompt` is asking them to do
- 70% or more of selected coach reports are at least partially right
- 50% or more of rewrites feel copy-pasteable
- serious misleading reports are rare
- no install or parser blockers
- no local path or secret leak reports

Yellow:

- candidate selection feels right, but the coach output is too generic
- rewrites are mostly right, but too polished or not in the user's voice
- advanced reports are useful but the default plugin flow still feels awkward

Red:

- candidate summaries do not explain what the chat was about
- long sessions are repeatedly collapsed into one invented goal
- correction false positives are common
- user intent or outcome is often guessed with high confidence
