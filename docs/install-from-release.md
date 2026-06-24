# Install the CLI from GitHub Release

`re-prompt` is not published to npm yet. This installs the CLI that powers the Codex plugin.

If you prefer the plugin-first flow, start with [install the Codex plugin](install-codex-plugin.md).

```bash
npm install -g https://github.com/kio-vibe/re-prompt/releases/download/v0.5.0/re-prompt-0.5.0.tgz
re-prompt --version
re-prompt
```

Expected version:

```txt
0.5.0
```

## First run

Use the habit-first flow first:

```bash
re-prompt
```

It summarizes recent prompt habits, suggests a default sentence to use next time, and shows evidence sessions you can inspect by number in the plugin flow.

For direct prompt coaching:

```bash
re-prompt coach <session-id-or-path>
```

For advanced investigation:

```bash
re-prompt doctor
re-prompt habits --since 30d
re-prompt candidates --since 30d
re-prompt scan --since 30d
re-prompt retro <session-id-or-path>
```

`doctor`, `habits`, `candidates`, `scan`, `go`, and `coach` need local Codex stored sessions. They are most useful on a machine where Codex CLI has already been used.

Optional Claude coach analysis is available for explicit session analysis:

```bash
re-prompt coach <session-id-or-path> --engine claude
```

The default coach engine is Codex. The Codex plugin exposes the normal flow through one `/re-prompt` skill.

## Uninstall

```bash
npm uninstall -g re-prompt
```
