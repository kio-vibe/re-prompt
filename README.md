# re-prompt

A Codex session prompt coach plugin and CLI.

`re-prompt` is not a prompt scorecard. It reads saved local Codex transcripts, looks at what you actually wrote, and coaches a clearer version in your own voice.

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

Quick latest-session coach:

```text
/re-prompt-last
```

Best evaluation flow:

```text
/re-prompt-go
/re-prompt-retro <session-id-or-path>
```

Copy the `Session` value from `/re-prompt-go` into `/re-prompt-retro`.

Underlying AI-assisted coach command:

```bash
re-prompt coach <session-id-or-path> --engine codex
re-prompt coach <session-id-or-path> --engine claude
```

`codex` is the default coach engine. Codex and Claude receive only a redacted prompt-coach bundle, not raw transcripts.

Preview conservative AGENTS.md suggestions from repeated recent evidence:

```text
/re-prompt-rules
```

## What It Does

`re-prompt` coaches the wording of a session prompt:

- what you actually wrote
- where that wording became ambiguous, late, broad, or hard for an agent to execute
- how to rewrite it in your own voice
- one rescue line you could have used mid-session
- when repeated evidence is strong enough to suggest an AGENTS.md rule

## Examples

- [scan output](docs/examples/scan-output.txt)
- [retro report](docs/examples/retro-report.md)
- [rules preview](docs/examples/rules-preview.md)

## Dogfood / Feedback

`v0.3.0` is ready for Codex plugin dogfood, but it is not published to npm yet.

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

Look for `re-prompt@re-prompt-local`, then open a new Codex thread or restart the Codex app. If `/re-prompt-go` still does not show up, install the command-specific personal skill picker shims from this repository:

```bash
bash scripts/install-personal-skill.sh
```

This copies the plugin skills under `plugins/re-prompt/skills/*/SKILL.md` to `$CODEX_HOME/skills/<skill-name>/SKILL.md`. It does not upload transcripts, change Codex sessions, or install global packages.

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
re-prompt coach
re-prompt coach <session-id-or-path>
re-prompt coach <session-id-or-path> --engine claude
re-prompt last
re-prompt retro <session-id-or-path>
re-prompt inspect <session-id-or-path>
re-prompt rules --since 30d
```

## Privacy

`re-prompt` reads local Codex transcripts and redacts common secrets and local home paths before analysis. Plugin coach flows use Codex by default and send only a redacted prompt-coach bundle, not raw transcripts.

`scan`, `go`, and `rules` stay local heuristic-only. `coach` can use Codex, Claude, or local fallback.

AGENTS.md patches are dry-run only in this release.

## Limitations

- Codex stored rollout logs only.
- Best-effort parser because transcript schemas can change.
- Coach suggestions are evidence-grounded, not guaranteed counterfactuals.

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
npm install /path/to/re-prompt-0.3.0.tgz
npx re-prompt --version
npx re-prompt doctor
```

See [distribution smoke](docs/distribution-smoke.md) for the full packaged CLI check.
