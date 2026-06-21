#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(node -p "require('$ROOT/package.json').version")"
TARBALL="re-prompt-${VERSION}.tgz"

cd "$ROOT"

echo "==> Running release checks"
pnpm test
pnpm typecheck
pnpm build

echo "==> Packing release tarball"
pnpm pack --pack-destination "$ROOT" >/dev/null

if [ ! -f "$ROOT/$TARBALL" ]; then
  echo "Expected tarball was not created: $ROOT/$TARBALL" >&2
  exit 1
fi

echo "==> Created $TARBALL"
echo ""
echo "After creating the GitHub Release for v$VERSION, upload the tarball with:"
echo "  gh release upload v$VERSION $TARBALL --clobber"
