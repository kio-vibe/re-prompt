# re-prompt retro

Selected session:
- Source: codex
- Session: sess-api-compatibility
- Transcript: [redacted-home]/.codex/sessions/2026/06/rollout-sess-api-compatibility.jsonl
- Selected because: explicit session reference
- Turns analyzed: 8
- Selection confidence: high

Source: codex
Session: sess-api-compatibility
Friction: High, 86/100
Outcome: unclear from transcript
Main cause: late_constraint

## What you were trying to do

Low confidence: update the stored Codex session parser and scan flow; exact final goal is unclear from transcript.

## Where it got expensive

The session became expensive after a late compatibility constraint changed the parser assumptions. The useful anchors were `src/sources/codex/locateCodexSessions.ts`, `rollout-*.jsonl`, and the failed verification command `node dist/cli.js scan --since 30d`.

Evidence:
- Turn 3: User added a late constraint: "do not read every rollout file into memory; use bounded metadata reads."
- Turn 5: `node dist/cli.js scan --since 30d` failed with a JavaScript heap out-of-memory error.
- Turn 7: `pnpm test` and `pnpm build` were run after the bounded discovery fix.

## Better initial prompt

```txt
Implement the Codex stored rollout parser with bounded memory behavior. Treat `~/.codex/sessions/**/rollout-*.jsonl` as potentially large, use file stats plus a small metadata prefix for discovery, filter by `--since` before full parsing, and verify with `pnpm test`, `pnpm build`, `node dist/cli.js doctor`, and `node dist/cli.js scan --since 30d`.
```

## Better rescue prompt at Turn 5

```txt
At Turn 5, stop expanding report logic and fix the scan OOM first. Please inspect `src/sources/codex/locateCodexSessions.ts`, avoid full-file reads during discovery, and rerun `node dist/cli.js scan --since 30d` before any release work.
```

## Suggested AGENTS.md patch

No durable AGENTS.md rule suggested.

## Next session checklist

- Name the transcript size and discovery constraints up front.
- Run the same command that failed before claiming the OOM is fixed.
- Keep AGENTS.md suggestions to repeated evidence, not one-off constraints.

## Limitations

- This is a synthetic example, not a real user transcript.
- `re-prompt` 0.1.0 is heuristic-only and may use low confidence when the transcript does not show the final outcome.
