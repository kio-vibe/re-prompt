#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: bash scripts/install-personal-skill.sh [--dry-run]" >&2
}

DRY_RUN=false
case "${1:-}" in
  "")
    ;;
  "--dry-run")
    DRY_RUN=true
    ;;
  *)
    usage
    exit 2
    ;;
esac

if [ "$#" -gt 1 ]; then
  usage
  exit 2
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
SOURCE="$ROOT/plugins/re-prompt/skills/re-prompt/SKILL.md"
TARGET_DIR="$CODEX_HOME/skills/re-prompt"
TARGET="$TARGET_DIR/SKILL.md"

if [ ! -f "$SOURCE" ]; then
  echo "Source skill not found: $SOURCE" >&2
  exit 1
fi

if ! grep -q '^name: re-prompt$' "$SOURCE"; then
  echo "Source skill is missing expected frontmatter: name: re-prompt" >&2
  exit 1
fi

if ! grep -q '^description:' "$SOURCE"; then
  echo "Source skill is missing a description frontmatter field." >&2
  exit 1
fi

echo "re-prompt personal skill install"
echo "Source: $SOURCE"
echo "Target: $TARGET"

if [ "$DRY_RUN" = true ]; then
  echo "Dry run: no files written."
  echo "After install, open a new Codex thread or restart Codex, then type /re-p."
  exit 0
fi

mkdir -p "$TARGET_DIR"
cp "$SOURCE" "$TARGET"

echo "Installed personal skill shim."
echo "Open a new Codex thread or restart Codex, then type /re-p."
