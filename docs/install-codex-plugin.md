# Install the Codex Plugin

`re-prompt` is dogfooding a Codex plugin before npm publish.

The plugin exposes one user-facing entry point:

```text
/re-prompt
```

It still uses the local `re-prompt` CLI under the hood.

## Install Or Update The CLI First

Plugin skill install and global CLI install are separate. The plugin calls the `re-prompt` executable on your machine; installing the plugin does not install or update that executable.

```bash
npm install -g https://github.com/kio-vibe/re-prompt/releases/download/v0.4.1/re-prompt-0.4.1.tgz
re-prompt --version
```

Expected version:

```txt
0.4.1
```

## Install The Plugin

Clone the repository and add its local plugin marketplace:

```bash
git clone https://github.com/kio-vibe/re-prompt.git
cd re-prompt
codex plugin marketplace add .
codex plugin add re-prompt@re-prompt-local
```

Pass the repository root to `codex plugin marketplace add`; Codex finds `.agents/plugins/marketplace.json` inside it.

Start a new Codex thread after installing the plugin so Codex can load the skill.

## If `/re-prompt` Does Not Show Up

First confirm the plugin is enabled:

```bash
codex plugin list
```

Look for `re-prompt@re-prompt-local`, then open a new Codex thread or restart the Codex app. If the plugin is enabled but `/re-prompt` still does not show up, install the personal skill picker shim:

```bash
bash scripts/install-personal-skill.sh
```

The shim installer copies `plugins/re-prompt/skills/re-prompt/SKILL.md` to `$CODEX_HOME/skills/re-prompt/SKILL.md`. It also removes old re-prompt-owned command-specific shims when detected. It does not upload transcripts, change Codex sessions, or install global packages.

It also does not install or update the global `re-prompt` CLI. If `/re-prompt` says the CLI is outdated, rerun the release tarball install command above.

To preview the install path without writing files:

```bash
bash scripts/install-personal-skill.sh --dry-run
```

## First Run

In Codex, run:

```text
/re-prompt
```

The skill checks whether the local CLI exists. If it is missing, it will show the install command and ask before running it.

If the CLI is older than `0.4.0`, the skill should stop and ask you to update instead of trying to inspect Codex transcript files directly.

When the CLI is available, `/re-prompt` shows a few recent Codex session candidates. Pick one by number, such as `1번` or `1`, and the plugin will run prompt coaching for that session.

## Advanced CLI Flows

The plugin hides these from the normal first-run path, but they remain available:

```bash
re-prompt candidates --since 30d
re-prompt coach <session-id-or-path> --engine codex
re-prompt coach <session-id-or-path> --engine claude
re-prompt retro <session-id-or-path>
re-prompt rules --since 30d
```

`candidates`, `scan`, `go`, and `rules` remain heuristic-only. Use `re-prompt retro <session-id-or-path>` only when you want the detailed forensic report.

## Privacy

Do not paste raw Codex rollout JSONL, private code, secrets, or unredacted command output into issues or chat.

The plugin runs local `re-prompt` commands and summarizes the generated coach output. `coach --engine codex` and `coach --engine claude` receive a redacted PromptCoachBundle, not raw transcripts.

The plugin should not read `~/.codex/sessions/**/*.jsonl` directly. If `re-prompt candidates` fails, treat it as a CLI setup/version problem and run `re-prompt --version` or `re-prompt doctor` instead of manually parsing transcripts.
