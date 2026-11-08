#!/usr/bin/env bash
# 1.0.x · Matriz de compatibilidad código ↔ esquema, SOLO en un PostgreSQL local aislado (se niega a otro host).
# Para cada combinación crea una base nueva, deja el esquema en ese estado por el MISMO camino que se usaría en
# Supabase (migrate.ts o los archivos «pegar/revertir») y corre TODA la suite de integración del código actual.
# Uso: ADMIN_URL=postgres://postgres:pw@localhost:5437 LABEL=pg17 ./scripts/verify-migration-matrix.sh [combos...]
# Combos: 0015 0015+0017 0016 0016+0017 0015+0017+0016
set -uo pipefail
: "${ADMIN_URL:?Falta ADMIN_URL (sin nombre de base)}"; LABEL="${LABEL:-pg}"
case "$ADMIN_URL" in postgres://*@localhost:*|postgres://*@127.0.0.1:*|postgres://localhost:*) ;; *) echo "Rechazado: solo localhost."; exit 1;; esac
APP_PW="${APP_DB_PASSWORD:-app_local_pw}"
COMBOS=("${@:-0015 0015+0017 0016 0016+0017 0015+0017+0016}"); [ $# -eq 0 ] && COMBOS=(0015 0015+0017 0016 0016+0017 0015+0017+0016)
OUT="${OUT_DIR:-/tmp/vlux-matrix}/$LABEL"; mkdir -p "$OUT"
HOSTPORT="${ADMIN_URL#*@}"
for combo in "${COMBOS[@]}"; do
  db="mtx_${LABEL}_$(echo "$combo" | tr '+' '_')"
  A="$ADMIN_URL/$db"; APPURL="postgres://vlux_app:$APP_PW@$HOSTPORT/$db"
  psql "$ADMIN_URL/postgres" -qc "DROP DATABASE IF EXISTS $db" >/dev/null
  envf="$OUT/$db.env"
  printf 'DATABASE_URL=%s\nDATABASE_ADMIN_URL=%s\nAPP_DB_PASSWORD=%s\nPLATFORM_ADMIN_TOKEN=token-de-prueba-local-de-32-caracteres-min\nCONTROL_CENTER_ENABLED=1\nADMIN_SECRETS_KEY=%s\nNODE_ENV=test\n' \
    "$APPURL" "$A" "$APP_PW" "$(grep '^ADMIN_SECRETS_KEY=' .env.test | cut -d= -f2-)" > "$envf"
  mig() { node --env-file="$envf" --import tsx scripts/migrate.ts "$1" >> "$OUT/$db.setup.log" 2>&1; }
  paste() { psql "$A" -v ON_ERROR_STOP=1 -q -f "docs/release-1.0/$1" >> "$OUT/$db.setup.log" 2>&1; }
  : > "$OUT/$db.setup.log"
  node --env-file="$envf" --import tsx scripts/db-setup-local.ts >> "$OUT/$db.setup.log" 2>&1
  mig up
  ok=1
  case "$combo" in
    0015) mig down; mig down ;;
    0016) mig down ;;
    0016+0017) # ciclo real de reversa y reaplicación con los archivos de Supabase
      paste 0017_revertir_en_supabase.sql || ok=0; paste 0017_pegar_en_supabase.sql || ok=0
      paste 0017_pegar_en_supabase.sql 2>/dev/null && { echo "la guarda de doble pegado NO funcionó"; ok=0; } ;;
    0015+0017) mig down; mig down; paste 0017_pegar_en_supabase.sql || ok=0
      paste 0017_revertir_en_supabase.sql || ok=0; paste 0017_pegar_en_supabase.sql || ok=0 ;;
    0015+0017+0016) mig down; mig down; paste 0017_pegar_en_supabase.sql || ok=0; paste 0016_pegar_en_supabase.sql || ok=0 ;;
  esac
  state="$(psql "$A" -Atc "SELECT string_agg(version, ',' ORDER BY version) FROM schema_migrations WHERE version > '0014'")"
  status="$(node --env-file="$envf" --import tsx scripts/migrate.ts status 2>&1 | tr '\n' ' ' | head -c 300)"
  node --env-file="$envf" --import tsx --test --test-concurrency=1 tests/integration/*.test.ts > "$OUT/$db.tests.log" 2>&1
  pass=$(grep -E '^# pass' "$OUT/$db.tests.log" | awk '{print $3}'); fail=$(grep -E '^# fail' "$OUT/$db.tests.log" | awk '{print $3}')
  echo "$LABEL | $combo | setup=$([ $ok = 1 ] && echo ok || echo FALLA) | esquema=[$state] | integración pass=$pass fail=$fail"
  grep -E '^not ok' "$OUT/$db.tests.log" | sed 's/^/    /'
  echo "    migrate status: $status" | head -c 400; echo
done
