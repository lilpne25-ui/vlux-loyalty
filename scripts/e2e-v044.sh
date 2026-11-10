#!/usr/bin/env bash
# Arranca dos emuladores de Vercel Output (público y Control Center, orígenes distintos) y ejecuta el E2E V0.4.4.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
for p in 8788 8790; do pkill -f "PORT=$p" 2>/dev/null || true; done
PUB=http://localhost:8788; ADM=http://127.0.0.1:8790
PORT=8788 DEMO_ACCESS=1 CONTROL_CENTER_ENABLED=0 PUBLIC_APP_URL=$PUB ADMIN_APP_URL=$ADM node scripts/preview-vercel-output.mjs >/tmp/emu-public.log 2>&1 &
P1=$!
PORT=8790 CONTROL_CENTER_ENABLED=1 PUBLIC_APP_URL=$PUB PUBLIC_BASE_URL=$ADM node scripts/preview-vercel-output.mjs >/tmp/emu-admin.log 2>&1 &
P2=$!
trap 'kill $P1 $P2 2>/dev/null || true' EXIT
sleep 2
E2E_RESET_ADMINS=1 PUBLIC=$PUB ADMIN=$ADM NODE_PATH=$(npm root -g) node tests/e2e/v044-activacion.cjs
