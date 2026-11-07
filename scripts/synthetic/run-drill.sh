#!/usr/bin/env bash
# Simulacro completo de respaldo y restauración con datos SINTÉTICOS, en contenedores PostgreSQL 17 aislados.
# No usa Supabase, no usa secretos reales, no abre puertos fuera de 127.0.0.1. Requiere: docker, node 22, psql, npm ci.
# Uso: scripts/synthetic/run-drill.sh [carpeta_de_evidencia]
set -euo pipefail
cd "$(dirname "$0")/../.."
EV="${1:-$(mktemp -d)}"; mkdir -p "$EV"; chmod 700 "$EV"
SRC=vlux-drill-src-$$; DST=vlux-drill-dst-$$; PSRC=55${RANDOM:0:1}42; PDST=55${RANDOM:0:1}43
[ "$PSRC" != "$PDST" ] || PDST=$((PDST+1))
SP=$(head -c 18 /dev/urandom | base64 | tr -dc 'A-Za-z0-9'); DP=$(head -c 18 /dev/urandom | base64 | tr -dc 'A-Za-z0-9'); APPPW=$(head -c 18 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')
export BACKUP_PASSPHRASE="$(head -c 30 /dev/urandom | base64)"   # efímera; muere con el proceso
cleanup() { docker rm -f "$SRC" "$DST" >/dev/null 2>&1 || true; }; trap cleanup EXIT
docker run -d --name "$SRC" -e POSTGRES_PASSWORD="$SP" -p 127.0.0.1:$PSRC:5432 postgres:17 >/dev/null
docker run -d --name "$DST" -e POSTGRES_PASSWORD="$DP" -p 127.0.0.1:$PDST:5432 postgres:17 >/dev/null
for p in "$SRC" "$DST"; do until docker exec "$p" pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done; done; sleep 3
SRC_ADMIN="postgres://postgres:$SP@127.0.0.1:$PSRC/vlux_synth"; DST_ADMIN="postgres://postgres:$DP@127.0.0.1:$PDST/postgres"
now() { date +%s.%N; }; el() { awk -v a="$1" -v b="$2" 'BEGIN{printf "%.1f", b-a}'; }
{
echo "== Simulacro sintético $(date -u +%FT%TZ) · commit $(git rev-parse --short HEAD) · $(docker exec "$SRC" postgres --version)"
echo "== 1) Migraciones 0001–0016 (todas las del repositorio)"
DATABASE_ADMIN_URL="$SRC_ADMIN" APP_DB_PASSWORD="$APPPW" npx tsx scripts/db-setup-local.ts
DATABASE_ADMIN_URL="$SRC_ADMIN" npx tsx scripts/migrate.ts up | tail -2
echo "== 2) Datos sintéticos (10 negocios x 300 clientes)"
T=$(now); psql "$SRC_ADMIN" -v ON_ERROR_STOP=1 -q -f scripts/synthetic/seed-synthetic.sql 2>&1 | tail -1; echo "siembra_s=$(el $T $(now))"
echo "== 3) Respaldo + restauración aislada + verificación (ops/backup-verify.sh)"
T=$(now)
docker run --rm --network host -v "$PWD/ops:/ops:ro" -v "$EV:/backups" -e SOURCE_URL="$SRC_ADMIN" -e RESTORE_ADMIN_URL="$DST_ADMIN" -e BACKUP_DIR=/backups postgres:17 /ops/backup-verify.sh
echo "backup_verify_total_s=$(el $T $(now))"
echo "== 4) Cifrado AES-256 + verificación de integridad + simulacro desde el archivo cifrado (ops/restore-drill.sh)"
T=$(now)
docker run --rm --network host -v "$PWD/ops:/ops:ro" -v "$EV:/backups" -e BACKUP_PASSPHRASE -e RESTORE_ADMIN_URL="$DST_ADMIN" postgres:17 bash -c '
  set -e; cd /backups; f=$(ls vlux-*.dump | head -1)
  sha256sum "$f" > "$f.plain.sha256"
  gpg --batch --yes --pinentry-mode loopback --passphrase-fd 3 --symmetric --cipher-algo AES256 -o "$f.gpg" "$f" 3<<<"$BACKUP_PASSPHRASE"
  gpg --batch --quiet --pinentry-mode loopback --passphrase-fd 3 -d "$f.gpg" 3<<<"$BACKUP_PASSPHRASE" | sha256sum | cut -d" " -f1 | grep -qx "$(cut -d" " -f1 "$f.plain.sha256")" && echo "integridad del cifrado: ok"
  sha256sum "$f.gpg" | tee "$f.gpg.sha256"; rm -f "$f" "$f.plain.sha256"
  BACKUP_FILE=/backups/$f.gpg /ops/restore-drill.sh'
echo "cifrado_y_simulacro_s=$(el $T $(now))"
echo "== 5) Prueba funcional de la aplicación sobre la copia restaurada + aislamiento"
DRILL=$(psql "$DST_ADMIN" -Atc "select datname from pg_database where datname like 'vlux_drill_%' order by 1 desc limit 1")
psql "$DST_ADMIN" -qc "ALTER ROLE vlux_app LOGIN NOBYPASSRLS PASSWORD '$APPPW'"
DATABASE_ADMIN_URL="${DST_ADMIN%/*}/$DRILL" DATABASE_URL="postgres://vlux_app:$APPPW@127.0.0.1:$PDST/$DRILL" NODE_ENV=test \
 PLATFORM_ADMIN_TOKEN=token-de-prueba-sintetico-solo-local-0123456789 ADMIN_SECRETS_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef CONTROL_CENTER_ENABLED=1 \
 npx tsx scripts/synthetic/restore-functional-check.ts
} 2>&1 | tee "$EV/simulacro-sintetico.txt"
echo "Evidencia (sin datos personales ni secretos): $EV/simulacro-sintetico.txt"
