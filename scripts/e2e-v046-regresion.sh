#!/usr/bin/env bash
# Regresión E2E V0.2 → V0.4.5 contra el emulador local de Vercel Output (BD local desechable, correo SIMULADO).
# Las capturas de regresión van a $OUT (por omisión, fuera del repositorio) para no reemplazar la evidencia histórica.
set -uo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
export OUT="${OUT:-/tmp/vlux-regresion-v046}"; mkdir -p "$OUT"
export NODE_PATH=$(npm root -g)
for p in 8788 8789 8790; do pkill -f "PORT=$p" 2>/dev/null || true; done
B=http://localhost:8789
npm run -s db:seed:demo >/dev/null 2>&1 || echo 'aviso: no se pudo sembrar vlux-demo (V0.4.2 lo requiere)'
EMAIL_PROVIDER=mock PORT=8789 CONTROL_CENTER_ENABLED=1 PLATFORM_LEGACY_API=1 DEMO_ACCESS=1 PUBLIC_BASE_URL=$B node scripts/preview-vercel-output.mjs >/tmp/emu-v046.log 2>&1 &
P0=$!
PUB=http://localhost:8788; ADM=http://127.0.0.1:8790
PORT=8788 DEMO_ACCESS=1 CONTROL_CENTER_ENABLED=0 PUBLIC_APP_URL=$PUB ADMIN_APP_URL=$ADM node scripts/preview-vercel-output.mjs >/tmp/emu-public.log 2>&1 &
P1=$!
EMAIL_PROVIDER=mock PORT=8790 CONTROL_CENTER_ENABLED=1 PUBLIC_APP_URL=$PUB PUBLIC_BASE_URL=$ADM node scripts/preview-vercel-output.mjs >/tmp/emu-admin.log 2>&1 &
P2=$!
trap 'kill $P0 $P1 $P2 2>/dev/null || true' EXIT
sleep 3
declare -A R
run() { local name=$1; shift; echo "=== $name"; if "$@" >"$OUT/$name.log" 2>&1; then R[$name]=OK; else R[$name]=FALLA; fi; grep -E "^(Total|Resultado|FAIL)|FAIL " "$OUT/$name.log" | tail -8; }
run v02   env BASE=$B node tests/e2e/v02-tres-dispositivos.cjs
run v021  env BASE=$B node tests/e2e/v021-operacion.cjs
run v022  env BASE=$B node tests/e2e/v022-pwa.cjs
run v03   env E2E_RESET_ADMINS=1 BASE=$B node tests/e2e/v03-control-center.cjs
run v04   env E2E_RESET_ADMINS=1 BASE=$B node tests/e2e/v04-premium.cjs
run v042  env BASE=$PUB node tests/e2e/v042-comercial.cjs
run v043  env BASE=$B node tests/e2e/v043-metal.cjs
run v044  env E2E_RESET_ADMINS=1 PUBLIC=$PUB ADMIN=$ADM node tests/e2e/v044-activacion.cjs
run v045  env E2E_RESET_ADMINS=1 BASE=$B node tests/e2e/v045-operacion.cjs
echo; for k in v02 v021 v022 v03 v04 v042 v043 v044 v045; do echo "$k: ${R[$k]}"; done
