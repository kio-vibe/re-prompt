# Distribution Smoke Test

This smoke test checks that the package a user would install from a tarball exposes the same CLI that the repo documents.

`re-prompt` is not published to npm yet. Use this page to validate the CLI tarball and the source-hosted Codex plugin before publishing.

## Codex Plugin Smoke

From a fresh clone:

```bash
codex plugin marketplace add .
codex plugin add re-prompt@re-prompt-local
```

Run this from the repository root. Codex expects the marketplace root and discovers `.agents/plugins/marketplace.json` inside it.

Then start a new Codex thread and run:

```text
/re-prompt-install
/re-prompt-go
```

The plugin source lives in `plugins/re-prompt`. It is distributed through the repository marketplace, not the npm tarball.

## Fresh Clone

```bash
git clone https://github.com/kio-vibe/re-prompt.git
cd re-prompt
pnpm install
pnpm build
node dist/cli.js --version
node dist/cli.js doctor
node dist/cli.js scan --since 30d
```

`doctor`, `scan`, and `last` need local Codex stored sessions under `~/.codex/sessions`. On a machine without Codex sessions, `doctor` should still explain what is missing.

## Tarball Install

```bash
pnpm pack
mkdir /tmp/re-prompt-install-test
cd /tmp/re-prompt-install-test
npm init -y
npm install /path/to/re-prompt-0.2.4.tgz
npx re-prompt --version
npx re-prompt --help
npx re-prompt go
npx re-prompt doctor
npx re-prompt scan --since 30d
npx re-prompt last
```

Optional analyzer smoke, only on machines with the relevant CLI configured:

```bash
npx re-prompt retro <session-id-or-path> --engine codex
npx re-prompt retro <session-id-or-path> --engine claude
```

You can run the same flow from the repo:

```bash
bash scripts/smoke-distribution.sh
```

## Expected Package Contents

`pnpm pack --dry-run` should include:

```txt
AGENTS.md
dist/cli.d.ts
dist/cli.js
dist/cli.js.map
docs/examples/retro-report.md
docs/examples/rules-preview.md
docs/examples/scan-output.txt
docs/dogfood.md
docs/distribution-smoke.md
docs/install-from-release.md
docs/install-codex-plugin.md
docs/known-limitations.md
docs/privacy-for-dogfood.md
package.json
README.md
```

It should not include local Codex transcripts, dogfood reports, temp tarballs, or duplicate build artifacts.

## Interpreting Failures

- `doctor` reports missing sessions: Codex CLI has not created stored sessions on this machine yet.
- `scan --since 30d` prints no useful rows: there may be no recent analyzable Codex sessions.
- `last` fails with no analyzable sessions: acceptable on a fresh machine, but not on a maintainer machine with real Codex history.
- package contents include unexpected files: fix the `files` allowlist in `package.json` before npm publish.
