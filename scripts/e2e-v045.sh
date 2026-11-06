#!/usr/bin/env bash
# E2E V0.4.5 contra el emulador local de Vercel Output con proveedor de correo SIMULADO (no sale ningún correo).
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
pkill -f "PORT=8789 " 2>/dev/null || true
EMAIL_PROVIDER=mock PORT=8789 CONTROL_CENTER_ENABLED=1 PUBLIC_BASE_URL=http://localhost:8789 node scripts/preview-vercel-output.mjs >/tmp/emu-v045.log 2>&1 &
P=$!
trap 'kill $P 2>/dev/null || true' EXIT
sleep 2
E2E_RESET_ADMINS=1 BASE=http://localhost:8789 NODE_PATH=$(npm root -g) node tests/e2e/v045-operacion.cjs
