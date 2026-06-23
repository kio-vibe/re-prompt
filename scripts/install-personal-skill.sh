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
SOURCE_ROOT="$ROOT/plugins/re-prompt/skills"

if [ ! -d "$SOURCE_ROOT" ]; then
  echo "Source skill directory not found: $SOURCE_ROOT" >&2
  exit 1
fi

SOURCES=()
while IFS= read -r source; do
  SOURCES+=("$source")
done < <(find "$SOURCE_ROOT" -mindepth 2 -maxdepth 2 -name SKILL.md | sort)

if [ "${#SOURCES[@]}" -eq 0 ]; then
  echo "No source skills found under: $SOURCE_ROOT" >&2
  exit 1
fi

validate_skill() {
  local source="$1"
  local skill_name="$2"

  if ! grep -q "^name: $skill_name$" "$source"; then
    echo "Source skill is missing expected frontmatter: name: $skill_name" >&2
    exit 1
  fi

  if ! grep -q '^description:' "$source"; then
    echo "Source skill is missing a description frontmatter field: $source" >&2
    exit 1
  fi
}

echo "re-prompt personal skill install"

for source in "${SOURCES[@]}"; do
  skill_name="$(basename "$(dirname "$source")")"
  target="$CODEX_HOME/skills/$skill_name/SKILL.md"
  validate_skill "$source" "$skill_name"
  echo "Source: $source"
  echo "Target: $target"
done

if [ "$DRY_RUN" = true ]; then
  echo "Dry run: no files written."
  echo "After install, open a new Codex thread or restart Codex, then type /re-prompt-go."
  exit 0
fi

for source in "${SOURCES[@]}"; do
  skill_name="$(basename "$(dirname "$source")")"
  target_dir="$CODEX_HOME/skills/$skill_name"
  target="$target_dir/SKILL.md"
  mkdir -p "$target_dir"
  cp "$source" "$target"
done

echo "Installed ${#SOURCES[@]} personal skill shims."
echo "Open a new Codex thread or restart Codex, then type /re-prompt-go."
