#!/usr/bin/env bash
# Idempotent Cloud Agent install: Bun, deps, local Worker secrets, Matt Pocock skills.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BUN_VERSION="${BUN_VERSION:-1.3.9}"

ensure_bun() {
  export PATH="${HOME}/.bun/bin:${PATH}"
  if command -v bun >/dev/null 2>&1; then
    return
  fi
  echo "cloud-install: installing bun@${BUN_VERSION}"
  curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}"
  export PATH="${HOME}/.bun/bin:${PATH}"
  if [[ -w /usr/local/bin ]]; then
    ln -sf "${HOME}/.bun/bin/bun" /usr/local/bin/bun
  fi
  if ! command -v bun >/dev/null 2>&1; then
    echo "cloud-install: bun is required (packageManager bun@${BUN_VERSION})" >&2
    exit 1
  fi
}

ensure_bun

echo "cloud-install: bun install"
bun install

if [[ ! -f .dev.vars ]]; then
  echo "cloud-install: seeding .dev.vars from .dev.vars.example"
  cp .dev.vars.example .dev.vars
  secret="$(openssl rand -base64 32)"
  ape_key="$(openssl rand -base64 32)"
  app_token="$(openssl rand -base64 32)"
  tmp="$(mktemp)"
  sed \
    -e "s|^BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=\"${secret}\"|" \
    -e "s|^BETTER_AUTH_URL=.*|BETTER_AUTH_URL=\"http://127.0.0.1:8787\"|" \
    -e "s|^MONKEYTYPE_SECRET_KEY=.*|MONKEYTYPE_SECRET_KEY=\"${ape_key}\"|" \
    -e "s|^GITHUB_APP_TOKEN_SECRET_KEY=.*|GITHUB_APP_TOKEN_SECRET_KEY=\"${app_token}\"|" \
    .dev.vars >"$tmp"
  mv "$tmp" .dev.vars
fi

bash "$ROOT/.cursor/install-matt-pocock-skills.sh"
