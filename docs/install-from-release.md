# Install from GitHub Release

`re-prompt` is not published to npm yet. For dogfood, install the packaged npm tarball attached to the GitHub Release.

```bash
npm install -g https://github.com/kio-vibe/re-prompt/releases/download/v0.1.3/re-prompt-0.1.3.tgz
re-prompt --version
re-prompt go
```

Expected version:

```txt
0.1.3
```

## First run

Use the guided command first:

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

## Uninstall

```bash
npm uninstall -g re-prompt
```
