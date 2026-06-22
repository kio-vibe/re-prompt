# Privacy for Dogfood

`re-prompt` reads saved local Codex session transcripts. Those transcripts can be sensitive even when the generated report looks harmless.

## Do not share raw transcripts

Do not paste raw Codex rollout JSONL, full transcripts, screenshots of transcripts, or unredacted command output into public issues.

Transcripts may contain:

- private source code
- prompts and task descriptions
- local paths and usernames
- repository names and branch names
- command output
- environment details
- API keys, credentials, tokens, or config values
- customer, business, or product context

## What is safe to share

Prefer short redacted excerpts from `re-prompt` output.

Safe examples:

```txt
The report marked Turn 8 as the first late constraint, but Turn 3 was the first user correction.
```

```txt
The better prompt was useful, but it should have included the existing public API constraint.
```

```txt
The rules preview suggested an AGENTS.md rule from a one-off release task.
```

When sharing excerpts, replace private values with placeholders:

```txt
<repo>
<file>
<command>
<home>
<token>
<private output>
```

## What to redact

Before opening an issue, remove or replace:

- local home paths
- private repo names
- source code snippets
- command output that exposes private data
- branch names that reveal private work
- internal service names
- tokens, credentials, keys, cookies, and URLs with embedded auth
- customer or user data

If an issue requires sensitive detail to reproduce, describe the shape of the data instead of pasting the data itself.

## What re-prompt does locally

`re-prompt` is local-first by default in `v0.2.2`.

- The Codex plugin runs local `re-prompt` commands under the hood.
- The plugin does not upload transcripts.
- The plugin does not auto-install the global CLI; `/re-prompt-install` asks before running install commands.
- It uses deterministic heuristic reports unless you explicitly pass `--engine codex` or `--engine claude` to `retro` or `last`.
- Optional CLI analyzers receive only a redacted evidence bundle, not raw transcripts.
- It redacts common secrets and local home paths before generating reports.
- AGENTS.md suggestions are dry-run previews.

If you use an optional CLI analyzer, that CLI may contact its configured model provider. Do not use `--engine codex` or `--engine claude` on sessions whose redacted evidence bundle is still too sensitive to send through that CLI.

Redaction is a safety layer, not a guarantee. Review anything you paste publicly.
