# Install the CLI from GitHub Release

`re-prompt` is not published to npm yet. This installs the CLI that powers the Codex plugin.

If you prefer the plugin-first flow, start with [install the Codex plugin](install-codex-plugin.md).

```bash
npm install -g https://github.com/kio-vibe/re-prompt/releases/download/v0.4.2/re-prompt-0.4.2.tgz
re-prompt --version
re-prompt
```

Expected version:

```txt
0.4.2
```

## First run

Use the candidate picker first:

```bash
re-prompt
```

It shows a few recent Codex sessions in plain language. Pick a session id or use the plugin flow to choose by number.

For direct prompt coaching:

```bash
re-prompt coach <session-id-or-path>
```

For advanced investigation:

```bash
re-prompt doctor
re-prompt candidates --since 30d
re-prompt scan --since 30d
re-prompt retro <session-id-or-path>
```

`doctor`, `candidates`, `scan`, `go`, and `coach` need local Codex stored sessions. They are most useful on a machine where Codex CLI has already been used.

Optional Claude coach analysis is available for explicit session analysis:

```bash
re-prompt coach <session-id-or-path> --engine claude
```

The default coach engine is Codex. The Codex plugin exposes the normal flow through one `/re-prompt` skill.

## Uninstall

```bash
npm uninstall -g re-prompt
```
