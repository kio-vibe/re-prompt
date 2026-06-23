---
description: Check and install the local re-prompt CLI used by this plugin. Requires explicit user confirmation before installing.
---

# re-prompt Install

Set up the `re-prompt` CLI that powers this plugin. Do not install anything automatically.

## Preflight

Run only these checks first:

```bash
node --version
command -v re-prompt
re-prompt --version
re-prompt doctor
```

Require Node.js 20 or newer. If Node is missing or too old, stop and ask the user to install Node.js 20+.

If `re-prompt --version` prints `0.2.4` and `re-prompt doctor` succeeds, report setup complete in a short summary. Only inspect repository docs or plugin files if one of these checks fails.

## Install Options

If `re-prompt` is missing, tell the user exactly what will be installed and ask for confirmation before running any install command.

Preferred after the `v0.2.4` GitHub Release exists:

```bash
npm install -g https://github.com/kio-vibe/re-prompt/releases/download/v0.2.4/re-prompt-0.2.4.tgz
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
Respond in the user's language.
