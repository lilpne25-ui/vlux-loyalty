#!/usr/bin/env bash
# E2E 1.0.x · Pulido UX operativo contra el emulador local de Vercel Output (BD local desechable, sin envíos reales).
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
pkill -f "PORT=8792" 2>/dev/null || true
PLATFORM_LEGACY_API=1 PORT=8792 PUBLIC_BASE_URL=http://localhost:8792 node scripts/preview-vercel-output.mjs >/tmp/emu-v1ux.log 2>&1 &
P=$!
trap 'kill $P 2>/dev/null || true' EXIT
sleep 2
BASE=http://localhost:8792 node tests/e2e/v1-ux-operativo.cjs
