#!/usr/bin/env bash
# Install Matt Pocock's promoted skills into ~/.cursor/skills for Cloud Agents.
# Source: https://github.com/mattpocock/skills (promoted set from .claude-plugin/plugin.json)
set -euo pipefail

if ! command -v python3 >/dev/null 2>&1; then
  echo "mattpocock-skills: python3 is required to read plugin.json" >&2
  exit 1
fi

SKILLS_HOME="${CURSOR_CLOUD_SKILLS_HOME:-${HOME}/.cursor/skills}"
MIRROR_URL="${MATTPOCOCK_SKILLS_URL:-https://github.com/mattpocock/skills.git}"
MIRROR_REF="${MATTPOCOCK_SKILLS_REF:-main}"

tmpdir="$(mktemp -d)"
cleanup() { rm -rf "$tmpdir"; }
trap cleanup EXIT

echo "mattpocock-skills: cloning ${MIRROR_URL}@${MIRROR_REF} (shallow)"
git clone --depth 1 --branch "$MIRROR_REF" "$MIRROR_URL" "$tmpdir/skills"

plugin="$tmpdir/skills/.claude-plugin/plugin.json"
if [[ ! -f "$plugin" ]]; then
  echo "mattpocock-skills: ERROR — missing .claude-plugin/plugin.json" >&2
  exit 1
fi

mapfile -t skill_paths < <(
  python3 - "$plugin" <<'PY'
import json, sys
from pathlib import Path

plugin = json.loads(Path(sys.argv[1]).read_text())
for rel in plugin.get("skills", []):
    print(rel)
PY
)

if [[ ${#skill_paths[@]} -eq 0 ]]; then
  echo "mattpocock-skills: ERROR — plugin.json lists no skills" >&2
  exit 1
fi

mkdir -p "$SKILLS_HOME"
installed=0
for rel in "${skill_paths[@]}"; do
  src="$tmpdir/skills/$rel"
  name="$(basename "$rel")"
  if [[ ! -f "$src/SKILL.md" ]]; then
    echo "mattpocock-skills: skip ${name} (no SKILL.md at ${rel})" >&2
    continue
  fi
  dest="$SKILLS_HOME/$name"
  rm -rf "$dest"
  cp -a "$src" "$dest"
  installed=$((installed + 1))
  echo "mattpocock-skills: installed ${name} → ${dest}"
done

if [[ "$installed" -eq 0 ]]; then
  echo "mattpocock-skills: ERROR — no skills installed" >&2
  exit 1
fi

echo "mattpocock-skills: ${installed} skills in ${SKILLS_HOME}"
