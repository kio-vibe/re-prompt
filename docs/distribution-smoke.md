# Distribution Smoke Test

This smoke test checks that the package a user would install from a tarball exposes the same CLI that the repo documents.

`re-prompt` is not published to npm yet. Use this page to validate source install and tarball install before publishing.

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
npm install /path/to/re-prompt-0.1.1.tgz
npx re-prompt --version
npx re-prompt --help
npx re-prompt doctor
npx re-prompt scan --since 30d
npx re-prompt last --engine none
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
docs/distribution-smoke.md
package.json
README.md
```

It should not include local Codex transcripts, dogfood reports, temp tarballs, or duplicate build artifacts.

## Interpreting Failures

- `doctor` reports missing sessions: Codex CLI has not created stored sessions on this machine yet.
- `scan --since 30d` prints no useful rows: there may be no recent analyzable Codex sessions.
- `last --engine none` fails with no analyzable sessions: acceptable on a fresh machine, but not on a maintainer machine with real Codex history.
- package contents include unexpected files: fix the `files` allowlist in `package.json` before npm publish.
