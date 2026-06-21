# re-prompt

A local-first Codex session postmortem CLI.

`re-prompt` is not a generic prompt improver. It reads saved local Codex transcripts, finds where a coding session became expensive or misleading, and turns that evidence into better next prompts, rescue prompts, and conservative AGENTS.md suggestions.

## Quick Start

Start by checking that Codex transcripts are visible, then scan recent sessions and choose one to analyze:

```bash
re-prompt doctor
re-prompt scan --since 30d
re-prompt retro <session-id-or-path>
```

Use `last` when you want the most recent analyzable session picked for you:

```bash
re-prompt last --engine none
```

Preview conservative AGENTS.md suggestions from repeated recent evidence:

```bash
re-prompt rules --since 30d
```

## What It Does

`re-prompt` generates a retrospective that shows:

- where the session went off track
- which turns support that diagnosis
- what concrete anchors mattered, such as files, commands, constraints, or failures
- what you should have said up front
- what rescue prompt would have helped mid-session
- whether any repeated evidence is strong enough to suggest an AGENTS.md rule

## Examples

- [scan output](docs/examples/scan-output.txt)
- [retro report](docs/examples/retro-report.md)
- [rules preview](docs/examples/rules-preview.md)

## Commands

```bash
re-prompt doctor
re-prompt scan --since 30d
re-prompt last --engine none
re-prompt retro <session-id-or-path> --engine none
re-prompt inspect <session-id-or-path>
re-prompt rules --since 30d
```

## Privacy

`re-prompt` is local-first and heuristic-only. It reads local Codex transcripts, redacts common secrets and local home paths before analysis, and does not call external analyzers.

AGENTS.md patches are dry-run only in this release.

## Limitations

- Codex stored rollout logs only.
- Best-effort parser because transcript schemas can change.
- Heuristic suggestions are evidence-based, not guaranteed counterfactuals.
