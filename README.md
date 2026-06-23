# re-prompt

A Codex session prompt coach plugin and CLI.

`re-prompt` is not a prompt scorecard. It reads saved local Codex transcripts, helps you pick one session worth reviewing, then rewrites your actual prompt in your own voice.

## Install

`re-prompt` is not published to npm yet. For dogfood, install or update the packaged CLI first:

```bash
npm install -g https://github.com/kio-vibe/re-prompt/releases/download/v0.4.2/re-prompt-0.4.2.tgz
re-prompt --version
```

Expected version:

```txt
0.4.2
```

Then install the Codex plugin:

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

The plugin uses the `re-prompt` CLI under the hood. If the CLI is missing, `/re-prompt` will tell you the install command and ask before running anything.

Plugin install, personal skill install, and global CLI install are separate steps. `scripts/install-personal-skill.sh` only makes `/re-prompt` easier to find in the Codex app; it does not install or update the global `re-prompt` CLI.

## Quick Start

In Codex, start with one command:

```text
/re-prompt
```

It will show a few recent Codex session candidates in plain language:

- what that chat was about
- why it might be worth reviewing
- the likely prompt problem in one short line

Reply with a number, such as:

```text
1번
```

Then `re-prompt` coaches that session: what you actually wrote, where it became ambiguous, and how to say it better in your own voice.

## CLI Fallback

The same candidate picker is available from a terminal:

```bash
re-prompt
re-prompt candidates --top 3
```

Advanced users can still run the underlying commands:

```bash
re-prompt coach <session-id-or-path>
re-prompt coach <session-id-or-path> --engine claude
re-prompt scan --since 30d
re-prompt retro <session-id-or-path>
re-prompt rules --since 30d
```

`coach` uses Codex by default. Codex and Claude receive only a redacted prompt-coach bundle, not raw transcripts.

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

`v0.4.2` is ready for Codex plugin dogfood, but it is not published to npm yet.

The fastest path is in the [Codex plugin install guide](docs/install-codex-plugin.md).

Start with the [dogfood guide](docs/dogfood.md), read the [privacy guidance](docs/privacy-for-dogfood.md), and check the [known limitations](docs/known-limitations.md) before opening feedback.

Use the GitHub issue templates for:

- [retro report quality feedback](.github/ISSUE_TEMPLATE/retro-quality-feedback.yml)
- [install or parser bugs](.github/ISSUE_TEMPLATE/install-or-parser-bug.yml)
- [false positives or misleading findings](.github/ISSUE_TEMPLATE/false-positive-or-misleading.yml)

Please do not paste raw Codex transcripts, private code, secrets, or unredacted command output into public issues.

## If `/re-prompt` Does Not Show Up

First confirm the plugin is installed:

```bash
codex plugin list
```

Look for `re-prompt@re-prompt-local`, then open a new Codex thread or restart the Codex app. If `/re-prompt` still does not show up, install the personal skill picker shim from this repository:

```bash
bash scripts/install-personal-skill.sh
```

This copies `plugins/re-prompt/skills/re-prompt/SKILL.md` to `$CODEX_HOME/skills/re-prompt/SKILL.md`. It also removes old re-prompt-owned command-specific shims such as `re-prompt-go` when they are detected. It does not upload transcripts, change Codex sessions, install global packages, or update the global CLI.

## Commands

Codex plugin command:

```text
/re-prompt
```

Underlying CLI commands:

```bash
re-prompt
re-prompt candidates --since 30d
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

`candidates`, `scan`, `go`, and `rules` stay local heuristic-only. `coach` can use Codex, Claude, or local fallback.

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
npm install /path/to/re-prompt-0.4.2.tgz
npx re-prompt --version
npx re-prompt doctor
```

See [distribution smoke](docs/distribution-smoke.md) for the full packaged CLI check.
