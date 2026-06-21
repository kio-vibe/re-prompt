# Dogfooding re-prompt

This guide is for early testers trying `re-prompt` against their own local Codex sessions.

The goal is not to collect raw transcripts. The goal is to learn whether `scan -> retro` finds the real moment where a session became expensive, misleading, or hard to recover.

## Install from GitHub Release

`re-prompt` is not published to npm yet. Install the packaged GitHub Release tarball:

```bash
npm install -g https://github.com/kio-vibe/re-prompt/releases/download/v0.2.0/re-prompt-0.2.0.tgz
re-prompt --version
```

Expected version:

```txt
0.2.0
```

Source install is a fallback for maintainers and contributors:

```bash
git clone https://github.com/kio-vibe/re-prompt.git
cd re-prompt
git checkout v0.2.0
pnpm install
pnpm build
node dist/cli.js --version
```

## Run

Fastest first look:

```bash
re-prompt go
```

Quick latest-session report:

```bash
re-prompt last
```

Best evaluation flow:

```bash
re-prompt doctor
re-prompt scan --since 30d
re-prompt retro <session-id-or-path>
```

`doctor`, `scan`, `go`, and `last` need local Codex stored sessions under your Codex home. They are most useful on a machine where you have already used Codex CLI.

Optional analyzer comparison:

```bash
re-prompt retro <session-id-or-path> --engine codex
re-prompt retro <session-id-or-path> --engine claude
```

These engines receive only a redacted evidence bundle. `scan`, `go`, and `rules` remain heuristic-only.

Preview conservative AGENTS.md suggestions from repeated evidence:

```bash
re-prompt rules --since 30d
```

## What to check

A good report:

- cites concrete turn evidence
- names anchors such as files, commands, failures, package managers, or late constraints
- avoids pretending a long mixed session had one clear goal
- marks low confidence when the transcript does not prove intent or outcome
- gives a better prompt you would consider copy-pasting
- ties rescue prompts to a specific turn, failure, or correction
- suggests AGENTS.md rules only for durable repo behavior
- if `--engine codex` or `--engine claude` was used, clearly says whether it used that engine or fell back to heuristic mode

A bad report:

- says only "be more specific" or "provide more context"
- invents the user's goal or the session outcome
- treats a one-off task detail as an AGENTS.md rule
- promotes a failed inspection command into durable workflow advice
- misses the real correction or late constraint
- leaks local paths, private repo details, secrets, or raw transcript content
- hides analyzer fallback or makes an external analyzer report look more certain than the evidence supports

## What not to share publicly

Do not paste raw Codex transcripts into GitHub issues.

Codex transcripts may contain private code, prompts, local paths, command output, environment details, API keys, credentials, or business context. Share only short redacted excerpts from `re-prompt` output when they are needed to explain the feedback.

Good public feedback:

- "The report said Turn 8 was the first late constraint, but the actual correction was Turn 3."
- "The better prompt was useful, but the AGENTS.md suggestion was too specific to one task."
- "The scan ranking put a clean session above the session where commands failed repeatedly."

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

- 70% or more of reports are at least partially right
- 50% or more of better prompts feel copy-pasteable
- serious misleading reports are rare
- no install or parser blockers
- no local path or secret leak reports

Yellow:

- `scan` ranking feels right, but `retro` is too generic
- reports are mostly right, but too long or not actionable
- AGENTS.md suggestions are still too eager

Red:

- long sessions are repeatedly collapsed into one invented goal
- correction false positives are common
- failed inspection commands are promoted into durable rules
- user intent or outcome is often guessed with high confidence
