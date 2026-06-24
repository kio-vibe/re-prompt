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
CLI_INSTALL_COMMAND="npm install -g https://github.com/kio-vibe/re-prompt/releases/download/v0.5.0/re-prompt-0.5.0.tgz"
LEGACY_SKILLS=(
  "re-prompt-go"
  "re-prompt-install"
  "re-prompt-last"
  "re-prompt-retro"
  "re-prompt-rules"
)

if [ ! -f "$SOURCE" ]; then
  echo "Source skill not found: $SOURCE" >&2
  exit 1
fi

if ! grep -q '^name: re-prompt$' "$SOURCE"; then
  echo "Source skill is missing expected frontmatter: name: re-prompt" >&2
  exit 1
fi

if ! grep -q '^description:' "$SOURCE"; then
  echo "Source skill is missing a description frontmatter field: $SOURCE" >&2
  exit 1
fi

is_re_prompt_legacy_skill() {
  local skill_name="$1"
  local path="$CODEX_HOME/skills/$skill_name/SKILL.md"

  [ -f "$path" ] || return 1
  grep -q "^name: $skill_name$" "$path" || return 1
  grep -q 'Do not ask the user to paste raw rollout JSONL' "$path" || return 1
  grep -q 're-prompt' "$path" || return 1
}

echo "re-prompt personal skill install"
echo "Note: this installs the Codex personal skill only. It does not install or update the global re-prompt CLI."
echo "Install/update CLI with: $CLI_INSTALL_COMMAND"
echo "Source: $SOURCE"
echo "Target: $TARGET"

for skill_name in "${LEGACY_SKILLS[@]}"; do
  legacy_dir="$CODEX_HOME/skills/$skill_name"
  if is_re_prompt_legacy_skill "$skill_name"; then
    echo "Cleanup: remove legacy re-prompt-owned skill $legacy_dir"
  else
    echo "Cleanup: skip $legacy_dir (missing or not confirmed re-prompt-owned)"
  fi
done

if [ "$DRY_RUN" = true ]; then
  echo "Dry run: no files written."
  echo "After install, open a new Codex thread or restart Codex, then type /re-prompt."
  exit 0
fi

mkdir -p "$TARGET_DIR"
cp "$SOURCE" "$TARGET"

removed=0
for skill_name in "${LEGACY_SKILLS[@]}"; do
  legacy_dir="$CODEX_HOME/skills/$skill_name"
  if is_re_prompt_legacy_skill "$skill_name"; then
    rm -rf "$legacy_dir"
    removed=$((removed + 1))
  fi
done

echo "Installed re-prompt personal skill."
echo "Removed $removed legacy command-specific skill shim(s)."
echo "Open a new Codex thread or restart Codex, then type /re-prompt."
