# Install the Codex Plugin

`re-prompt` is dogfooding a Codex plugin before npm publish.

The plugin gives you Codex commands such as `/re-prompt-go`, `/re-prompt-last`, and `/re-prompt-retro`. It still uses the local `re-prompt` CLI under the hood.

## Install

Clone the repository and add its local plugin marketplace:

```bash
git clone https://github.com/kio-vibe/re-prompt.git
cd re-prompt
codex plugin marketplace add .
codex plugin add re-prompt@re-prompt-local
```

Pass the repository root to `codex plugin marketplace add`; Codex finds `.agents/plugins/marketplace.json` inside it.

Start a new Codex thread after installing the plugin so Codex can load the commands and skill.

## First Run

In Codex, run:

```text
/re-prompt-install
/re-prompt-go
```

`/re-prompt-install` checks Node.js 20+ and whether the `re-prompt` CLI is installed. It does not install automatically unless you explicitly approve the command.

`/re-prompt-go` checks local Codex session visibility, ranks recent high-friction sessions, and prints the exact session id to use next.

## Common Flows

Analyze the latest analyzable session:

```text
/re-prompt-last
```

Analyze a specific session:

```text
/re-prompt-retro <session-id-or-path>
```

Preview durable AGENTS.md suggestions:

```text
/re-prompt-rules
```

Optional CLI-enhanced analysis is still explicit:

```bash
re-prompt retro <session-id-or-path> --engine codex
re-prompt retro <session-id-or-path> --engine claude
```

`scan`, `go`, and `rules` remain heuristic-only.

## Privacy

Do not paste raw Codex rollout JSONL, private code, secrets, or unredacted command output into issues or chat.

The plugin runs local `re-prompt` commands and summarizes the generated report. Optional `--engine codex` and `--engine claude` analyzer modes receive a redacted EvidenceBundle, not raw transcripts.
