# Install the CLI from GitHub Release

`re-prompt` is not published to npm yet. This installs the CLI that powers the Codex plugin.

If you prefer the plugin-first flow, start with [install the Codex plugin](install-codex-plugin.md).

```bash
npm install -g https://github.com/kio-vibe/re-prompt/releases/download/v0.2.1/re-prompt-0.2.1.tgz
re-prompt --version
re-prompt go
```

Expected version:

```txt
0.2.1
```

## First run

Use the guided CLI command first:

```bash
re-prompt go
```

It checks local Codex session visibility, ranks recent high-friction sessions, and prints the exact `retro` command to run next.

For a quick latest-session report:

```bash
re-prompt last
```

For the best evaluation flow:

```bash
re-prompt doctor
re-prompt scan --since 30d
re-prompt retro <session-id-or-path>
```

`doctor`, `scan`, `go`, and `last` need local Codex stored sessions. They are most useful on a machine where Codex CLI has already been used.

Optional CLI-enhanced reports are available for explicit session analysis:

```bash
re-prompt retro <session-id-or-path> --engine codex
re-prompt retro <session-id-or-path> --engine claude
```

The default report engine is still local heuristic mode. The Codex plugin exposes the same flows through `/re-prompt-go`, `/re-prompt-last`, and `/re-prompt-retro`.

## Uninstall

```bash
npm uninstall -g re-prompt
```
