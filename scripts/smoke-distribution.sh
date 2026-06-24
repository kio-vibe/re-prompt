#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/re-prompt-smoke.XXXXXX")"
EXPECTED_VERSION="$(node -p "require('$ROOT/package.json').version")"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

echo "==> Building package"
cd "$ROOT"
pnpm build

echo "==> Packing tarball"
pnpm pack --pack-destination "$TMP_DIR" >/dev/null
TARBALL="$(find "$TMP_DIR" -maxdepth 1 -type f -name '*.tgz' -print -quit)"
if [ -z "$TARBALL" ]; then
  echo "No tarball was created in $TMP_DIR" >&2
  exit 1
fi

echo "==> Creating temp install project"
INSTALL_DIR="$TMP_DIR/install"
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"
npm init -y >/dev/null
npm install "$TARBALL" >/dev/null

echo "==> Checking installed CLI"
VERSION_OUTPUT="$(npx re-prompt --version)"
if [ "$VERSION_OUTPUT" != "$EXPECTED_VERSION" ]; then
  echo "Expected re-prompt version $EXPECTED_VERSION, got: ${VERSION_OUTPUT:-<empty>}" >&2
  exit 1
fi
printf '%s\n' "$VERSION_OUTPUT"

HELP_OUTPUT="$(npx re-prompt --help)"
if ! printf '%s\n' "$HELP_OUTPUT" | grep -q 'Usage: re-prompt'; then
  echo "Installed CLI help output did not contain the expected usage line." >&2
  exit 1
fi

DOCTOR_OUTPUT="$(npx re-prompt doctor)"
printf '%s\n' "$DOCTOR_OUTPUT"
if ! printf '%s\n' "$DOCTOR_OUTPUT" | grep -q 're-prompt doctor'; then
  echo "Doctor output did not contain the expected header." >&2
  exit 1
fi

SCAN_OUTPUT="$(npx re-prompt scan --since 30d)"
printf '%s\n' "$SCAN_OUTPUT"
if ! printf '%s\n' "$SCAN_OUTPUT" | grep -q 'Friction'; then
  echo "Scan output did not contain the expected table header." >&2
  exit 1
fi

GO_OUTPUT="$(npx re-prompt go --top 3)"
printf '%s\n' "$GO_OUTPUT"
if ! printf '%s\n' "$GO_OUTPUT" | grep -q 're-prompt go'; then
  echo "Go output did not contain the expected header." >&2
  exit 1
fi

echo "==> Checking prompt habit fallback"
HABITS_OUTPUT="$(npx re-prompt habits --engine none --format md)"
printf '%s\n' "$HABITS_OUTPUT"
if ! printf '%s\n' "$HABITS_OUTPUT" | grep -Eq 'Prompt Habits From Recent Sessions|최근 세션에서 보이는 프롬프트 습관'; then
  echo "Habits output did not contain the expected heading." >&2
  exit 1
fi

echo "==> Checking latest coach fallback"
set +e
COACH_OUTPUT="$(npx re-prompt coach --engine none 2>&1)"
COACH_EXIT=$?
set -e

if [ "$COACH_EXIT" -eq 0 ]; then
  printf '%s\n' "$COACH_OUTPUT"
elif printf '%s\n' "$COACH_OUTPUT" | grep -Eiq 'No Codex sessions found|No analyzable Codex sessions found'; then
  printf 'warning: skipping coach smoke because no analyzable local Codex sessions were found.\n' >&2
else
  printf '%s\n' "$COACH_OUTPUT" >&2
  exit "$COACH_EXIT"
fi

echo "==> Distribution smoke passed"
