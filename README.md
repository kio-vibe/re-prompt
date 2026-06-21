# re-prompt

A local-first Codex session postmortem CLI.

`re-prompt` is not a generic prompt improver. It reads saved local Codex transcripts, finds where a coding session became expensive or misleading, and turns that evidence into better next prompts, rescue prompts, and conservative AGENTS.md suggestions.

## Install

`re-prompt` is not published to npm yet. For dogfood, install the packaged GitHub Release tarball and start the guided flow:

```bash
npm install -g https://github.com/kio-vibe/re-prompt/releases/download/v0.1.3/re-prompt-0.1.3.tgz
re-prompt go
```

Requirements:

- Node.js 20+
- local Codex stored sessions
- access to `~/.codex/sessions` on your machine

`re-prompt` is most useful where Codex CLI has already been used.

## Quick Start

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

Copy the `Session` value from `scan` into `retro`.

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

## Dogfood / Feedback

`v0.1.3` is ready for release-tarball dogfood, but it is not published to npm yet.

The fastest path is in the [release install guide](docs/install-from-release.md).

Start with the [dogfood guide](docs/dogfood.md), read the [privacy guidance](docs/privacy-for-dogfood.md), and check the [known limitations](docs/known-limitations.md) before opening feedback.

Use the GitHub issue templates for:

- [retro report quality feedback](.github/ISSUE_TEMPLATE/retro-quality-feedback.yml)
- [install or parser bugs](.github/ISSUE_TEMPLATE/install-or-parser-bug.yml)
- [false positives or misleading findings](.github/ISSUE_TEMPLATE/false-positive-or-misleading.yml)

Please do not paste raw Codex transcripts, private code, secrets, or unredacted command output into public issues.

## Commands

```bash
re-prompt doctor
re-prompt scan --since 30d
re-prompt go
re-prompt last
re-prompt retro <session-id-or-path>
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

## Maintainer Install

Source install is available for maintainers and contributors:

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
npm install /path/to/re-prompt-0.1.3.tgz
npx re-prompt --version
npx re-prompt doctor
```

See [distribution smoke](docs/distribution-smoke.md) for the full packaged CLI check.
