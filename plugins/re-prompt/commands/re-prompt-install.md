---
description: Check and install the local re-prompt CLI used by this plugin. Requires explicit user confirmation before installing.
---

# re-prompt Install

Set up the `re-prompt` CLI that powers this plugin. Do not install anything automatically.

## Preflight

1. Check Node.js:

```bash
node --version
```

Require Node.js 20 or newer. If Node is missing or too old, stop and ask the user to install Node.js 20+.

2. Check whether `re-prompt` is already available:

```bash
re-prompt --version
```

If it prints `0.2.0`, report that setup is complete.

## Install Options

If `re-prompt` is missing, tell the user exactly what will be installed and ask for confirmation before running any install command.

Preferred after the `v0.2.0` GitHub Release exists:

```bash
npm install -g https://github.com/kio-vibe/re-prompt/releases/download/v0.2.0/re-prompt-0.2.0.tgz
```

Contributor fallback when running from a local clone of this repository:

```bash
pnpm install
pnpm build
npm install -g .
```

## Verification

After installation, run:

```bash
re-prompt --version
re-prompt doctor
```

Report whether local Codex sessions are visible. Do not paste raw Codex transcripts.
