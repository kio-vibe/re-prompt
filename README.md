# re-prompt

Turn messy Codex sessions into better next prompts.

## What It Does

`re-prompt` reads saved local Codex transcript files and generates a retrospective:

- where the session went off track
- what context was missing
- what you should have said up front
- what rescue prompt would have helped mid-session
- what belongs in AGENTS.md

## Usage

```bash
re-prompt doctor
re-prompt scan --since 7d --engine none
re-prompt last --engine none
re-prompt retro <session-id-or-path> --engine none
re-prompt rules --since 30d
```

## Privacy

`re-prompt` 0.1.0 is local-first and heuristic-only. It reads local Codex transcripts, redacts common secrets before analysis, and does not call external analyzers.

AGENTS.md patches are dry-run only in 0.1.0.

## Limitations

- Codex stored rollout logs only.
- Best-effort parser because transcript schemas can change.
- Heuristic suggestions are evidence-based, not guaranteed counterfactuals.
