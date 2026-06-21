$ re-prompt rules --since 30d

Index: AGENTS.md
===================================================================
--- AGENTS.md	current
+++ AGENTS.md	proposed
@@
+## Lessons from recent Codex sessions
+
+- Do not claim completion after file edits until `pnpm test` has run or the reason it could not run is stated.
+- Before refactors, state compatibility assumptions and preserve durable API, schema, and data-processing invariants.

Rules are dry-run previews in this release. They are suggested only from repeated recent evidence or concrete repository anchors.
