#!/usr/bin/env bash
# E2E V0.4.6 contra el emulador local de Vercel Output (BD local desechable). Correo SIMULADO y llaves VAPID de
# prueba generadas al vuelo (solo para que la tarjeta ofrezca "Mis notificaciones"; no se envía ningún push real).
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
pkill -f "PORT=8791" 2>/dev/null || true
eval "$(node --import tsx -e "import('./server/push/webpush.ts').then(m=>{const k=m.generateVapidKeys();console.log('export VAPID_PUBLIC_KEY='+k.publicKey+' VAPID_PRIVATE_KEY='+k.privateKey)})")"
EMAIL_PROVIDER=mock VAPID_SUBJECT=mailto:pruebas@vlux.invalid PORT=8791 CONTROL_CENTER_ENABLED=1 PUBLIC_BASE_URL=http://localhost:8791 node scripts/preview-vercel-output.mjs >/tmp/emu-v046.log 2>&1 &
P=$!
trap 'kill $P 2>/dev/null || true' EXIT
sleep 2
E2E_RESET_ADMINS=${E2E_RESET_ADMINS:-1} BASE=http://localhost:8791 NODE_PATH=$(npm root -g) node tests/e2e/v046-accesos.cjs
