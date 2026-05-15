#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

log() {
	printf '[masterbot] %s\n' "$1"
}

if ! command -v node >/dev/null 2>&1; then
	log "node is not installed."
	exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
	log "npm is not installed."
	exit 1
fi

if ! command -v cargo >/dev/null 2>&1; then
	log "cargo is not installed."
	exit 1
fi

log "Installing or updating npm dependencies."
npm install --no-audit --no-fund

log "Building Rust watchdog."
cargo build --release --manifest-path rust/masterbot-watchdog/Cargo.toml

log "Regenerating PM2 ecosystem."
npm run build:ecosystem

log "Starting PM2 stack."
npm run pm2:start
