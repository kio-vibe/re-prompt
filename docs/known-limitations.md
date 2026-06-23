# Known Limitations

`re-prompt v0.2.4` is an early dogfood release. It is useful for testing report quality, but it is intentionally narrow.

## Current scope

- Codex stored rollout logs only
- local-first
- heuristic-only by default
- Codex plugin wrapper for first-run UX
- optional Codex/Claude CLI analyzers for `retro` and `last`
- no telemetry
- no npm package yet
- explicit CLI install only; the plugin does not auto-install global packages
- AGENTS.md suggestions are dry-run previews only

## Not included yet

- Claude Code transcript source support
- Claude plugin wrapper
- Cursor, Cline, Gemini, or other coding agents
- dashboard
- cloud sync
- transcript upload or collection
- automatic AGENTS.md apply

## Accuracy limits

Reports are evidence-grounded suggestions, not guaranteed counterfactuals.

`re-prompt` can be wrong when:

- the transcript shape changed and the parser only partially understood it
- the session has multiple unrelated plans
- the real constraint was implicit or outside the transcript
- command failures were exploratory rather than meaningful
- the user corrected direction without using obvious correction language
- a session was too large or malformed to parse fully

Good dogfood feedback points out where the report overclaimed, missed evidence, or produced advice that was technically true but not useful.
