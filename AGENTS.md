# AGENTS.md

## Product

This repository implements `re-prompt`, a local-first CLI that analyzes saved Codex session transcripts and turns session friction into better future prompts.

The product is not a generic prompt improver or prompt scorecard. It is a Codex session postmortem tool.

Core output:
- where the session became expensive or went off track
- evidence by turn index
- better initial prompt
- better rescue prompt
- suggested AGENTS.md patch
- next-session checklist

## MVP Scope

Build Codex-only first.

Do not implement Claude Code, Cursor, Cline, Gemini, dashboards, accounts, telemetry, cloud sync, hook installation, or CodexExecAnalyzer in 0.1.0.

## Engineering Constraints

- TypeScript strict mode.
- Node.js 20+.
- pnpm.
- CLI-first.
- Local-first.
- No telemetry.
- No network calls in 0.1.0.
- Never modify user files unless a command explicitly supports and receives an apply flag. In 0.1.0, AGENTS.md patches are dry-run only.
- Redact secrets before any analyzer use.
- Do not expose raw reasoning items in user-facing reports.
- Parser must be permissive and fixture-driven because Codex transcript shapes may evolve.
- Unknown Codex events must be counted and preserved as previews, not crash the parser.

## Commands

MVP commands:
- `re-prompt doctor`
- `re-prompt scan --since 7d --engine none`
- `re-prompt last --engine none`
- `re-prompt retro <session-id-or-path> --engine none`
- `re-prompt rules --since 30d`
- `re-prompt inspect <session-path> --format json`

## Testing Requirements

Every implementation step must keep these passing:
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

Parser changes require fixtures under `tests/fixtures/codex`.

Signal extractor changes require unit tests.

Markdown renderer changes require snapshot tests.

## Product Quality Bar

Bad output:
- "Be more specific."
- "Provide more context."
- "Your prompt score is 72."

Good output:
- "Turn 8 introduced the compatibility constraint after 5 file edits. Move this exact constraint into the initial prompt."
- "Use this rescue prompt at Turn 8: ..."
- "This belongs in AGENTS.md because it is a durable repo rule, not a one-off instruction."

## Definition of Done

A feature is done only if:
- it has tests
- it handles malformed JSONL
- it works without Codex analyzer via `--engine none`
- it does not write to user files by default
- it has useful error messages
