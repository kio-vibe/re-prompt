# Install the CLI from GitHub Release

`re-prompt` is not published to npm yet. This installs the CLI that powers the Codex plugin.

If you prefer the plugin-first flow, start with [install the Codex plugin](install-codex-plugin.md).

```bash
npm install -g https://github.com/kio-vibe/re-prompt/releases/download/v0.3.0/re-prompt-0.3.0.tgz
re-prompt --version
re-prompt go
```

Expected version:

```txt
0.3.0
```

## First run

Use the guided CLI command first:

```bash
re-prompt go
```

It checks local Codex session visibility, suggests a rough session candidate, and prints the exact coach command to run next.

For a quick latest-session coach:

```bash
re-prompt coach
```

For the best evaluation flow:

```bash
re-prompt doctor
re-prompt scan --since 30d
re-prompt coach <session-id-or-path>
```

`doctor`, `scan`, `go`, and `coach` need local Codex stored sessions. They are most useful on a machine where Codex CLI has already been used.

Optional Claude coach analysis is available for explicit session analysis:

```bash
re-prompt coach <session-id-or-path> --engine claude
```

The default coach engine is Codex. The Codex plugin exposes the same flows through `/re-prompt-go`, `/re-prompt-last`, and `/re-prompt-retro`.

## Uninstall

```bash
npm uninstall -g re-prompt
```
