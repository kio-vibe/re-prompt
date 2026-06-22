# re-prompt

A local-first Codex session postmortem plugin and CLI.

`re-prompt` is not a generic prompt improver. It reads saved local Codex transcripts, finds where a coding session became expensive or misleading, and turns that evidence into better next prompts, rescue prompts, and conservative AGENTS.md suggestions.

## Install

`re-prompt` is not published to npm yet. For dogfood, start with the Codex plugin:

```bash
git clone https://github.com/kio-vibe/re-prompt.git
cd re-prompt
codex plugin marketplace add .
codex plugin add re-prompt@re-prompt-local
```

Pass the repository root to `codex plugin marketplace add`; Codex finds `.agents/plugins/marketplace.json` inside it.

Requirements:

- Node.js 20+
- local Codex stored sessions
- access to `~/.codex/sessions` on your machine

The plugin uses the `re-prompt` CLI under the hood. Run `/re-prompt-install` from Codex to check or install it explicitly.

## Quick Start

Fastest first look:

```text
/re-prompt-go
```

Quick latest-session report:

```text
/re-prompt-last
```

Best evaluation flow:

```text
/re-prompt-go
/re-prompt-retro <session-id-or-path>
```

Copy the `Session` value from `/re-prompt-go` into `/re-prompt-retro`.

Optional CLI-enhanced reports:

```bash
re-prompt retro <session-id-or-path> --engine codex
re-prompt retro <session-id-or-path> --engine claude
```

The default remains `--engine none`. `codex` and `claude` receive only a redacted evidence bundle, not raw transcripts.

Preview conservative AGENTS.md suggestions from repeated recent evidence:

```text
/re-prompt-rules
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

## Dogfood / Feedback

`v0.2.2` is ready for Codex plugin dogfood, but it is not published to npm yet.

The fastest path is in the [Codex plugin install guide](docs/install-codex-plugin.md).

Start with the [dogfood guide](docs/dogfood.md), read the [privacy guidance](docs/privacy-for-dogfood.md), and check the [known limitations](docs/known-limitations.md) before opening feedback.

Use the GitHub issue templates for:

- [retro report quality feedback](.github/ISSUE_TEMPLATE/retro-quality-feedback.yml)
- [install or parser bugs](.github/ISSUE_TEMPLATE/install-or-parser-bug.yml)
- [false positives or misleading findings](.github/ISSUE_TEMPLATE/false-positive-or-misleading.yml)

Please do not paste raw Codex transcripts, private code, secrets, or unredacted command output into public issues.

## If `/re-p` Does Not Show re-prompt

First confirm the plugin is installed:

```bash
codex plugin list
```

Look for `re-prompt@re-prompt-local`, then open a new Codex thread or restart the Codex app. If `/re-p` still does not show `re-prompt`, install the personal skill picker shim from this repository:

```bash
bash scripts/install-personal-skill.sh
```

This copies only `plugins/re-prompt/skills/re-prompt/SKILL.md` to `$CODEX_HOME/skills/re-prompt/SKILL.md`. It does not upload transcripts, change Codex sessions, or install global packages.

## Commands

Codex plugin commands:

```text
/re-prompt-install
/re-prompt-go
/re-prompt-last
/re-prompt-retro <session-id-or-path>
/re-prompt-rules
```

Underlying CLI commands:

```bash
re-prompt doctor
re-prompt scan --since 30d
re-prompt go
re-prompt last
re-prompt retro <session-id-or-path>
re-prompt retro <session-id-or-path> --engine codex
re-prompt retro <session-id-or-path> --engine claude
re-prompt inspect <session-id-or-path>
re-prompt rules --since 30d
```

## Privacy

`re-prompt` is local-first by default. It reads local Codex transcripts, redacts common secrets and local home paths before analysis, and uses deterministic heuristic reports unless you explicitly pass `--engine codex` or `--engine claude` to `retro` or `last`.

Optional CLI analyzers receive only the redacted evidence bundle. They are not used for `scan`, `go`, or `rules`.

AGENTS.md patches are dry-run only in this release.

## Limitations

- Codex stored rollout logs only.
- Best-effort parser because transcript schemas can change.
- Heuristic suggestions are evidence-based, not guaranteed counterfactuals.

## Maintainer Install

Source CLI install is available for maintainers and contributors:

```bash
git clone https://github.com/kio-vibe/re-prompt.git
cd re-prompt
pnpm install
pnpm build
node dist/cli.js --version
```

Maintainers can smoke-test the packaged CLI before npm publish:

```bash
pnpm pack
mkdir /tmp/re-prompt-install-test
cd /tmp/re-prompt-install-test
npm init -y
npm install /path/to/re-prompt-0.2.2.tgz
npx re-prompt --version
npx re-prompt doctor
```

See [distribution smoke](docs/distribution-smoke.md) for the full packaged CLI check.
