#!/usr/bin/env bash
# Respaldo + restauración de prueba + verificación de integridad (VLUX Loyalty).
# Uso:
#   SOURCE_URL=postgres://...   (dueño del esquema; Supabase: Session Pooler puerto 5432 o conexión directa)
#   RESTORE_ADMIN_URL=postgres://postgres:...@localhost:5432/postgres   (servidor AISLADO para la prueba)
#   BACKUP_DIR=./backups        (carpeta protegida; en CI se cifra antes de guardarse)
#   ./ops/backup-verify.sh
# Nunca restaura sobre la base de origen: crea una base temporal "vlux_restore_<fecha>" y la borra al final
# (KEEP_RESTORE=1 para conservarla).
set -euo pipefail
: "${SOURCE_URL:?Falta SOURCE_URL}"; : "${RESTORE_ADMIN_URL:?Falta RESTORE_ADMIN_URL}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"; mkdir -p "$BACKUP_DIR"; chmod 700 "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$BACKUP_DIR/vlux-$STAMP.dump"
RESTORE_DB="vlux_restore_$(date -u +%Y%m%d%H%M%S)"

echo "1) Respaldo lógico (pg_dump formato custom, solo esquema public)"
pg_dump --format=custom --no-owner --no-privileges --schema=public --file="$FILE" "$SOURCE_URL"
chmod 600 "$FILE"
sha256sum "$FILE" | tee "$FILE.sha256"

echo "2) Restauración en base AISLADA: $RESTORE_DB"
psql "$RESTORE_ADMIN_URL" -v ON_ERROR_STOP=1 -qc "CREATE DATABASE $RESTORE_DB"
RESTORE_URL="${RESTORE_ADMIN_URL%/*}/$RESTORE_DB"
psql "$RESTORE_URL" -v ON_ERROR_STOP=1 -qc "DO \$\$BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='vlux_app') THEN CREATE ROLE vlux_app NOLOGIN; END IF; END\$\$; DROP SCHEMA public CASCADE;"
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$RESTORE_URL" "$FILE"
psql "$RESTORE_URL" -v ON_ERROR_STOP=1 -q -f "$(dirname "$0")/grants.sql"

echo "3) Verificación de integridad (origen vs restaurada)"
Q="SELECT string_agg(t || '=' || n, ' ' ORDER BY t) FROM (
  SELECT 'businesses' t, count(*) n FROM businesses UNION ALL SELECT 'staff_users', count(*) FROM staff_users
  UNION ALL SELECT 'customers', count(*) FROM customers UNION ALL SELECT 'cards', count(*) FROM cards
  UNION ALL SELECT 'purchases', count(*) FROM purchases UNION ALL SELECT 'visits', count(*) FROM visits
  UNION ALL SELECT 'rewards', count(*) FROM rewards UNION ALL SELECT 'stamp_events', count(*) FROM stamp_events
  UNION ALL SELECT 'audit_events', count(*) FROM audit_events UNION ALL SELECT 'migrations', count(*) FROM schema_migrations
  UNION ALL SELECT 'business_subscriptions', count(*) FROM business_subscriptions UNION ALL SELECT 'platform_audit_events', count(*) FROM platform_audit_events) x"
SRC="$(psql "$SOURCE_URL" -Atc "$Q")"; DST="$(psql "$RESTORE_URL" -Atc "$Q")"
echo "   origen:      $SRC"; echo "   restaurada:  $DST"
[ "$SRC" = "$DST" ] || { echo "FALLA: los conteos no coinciden"; exit 1; }
BAD="$(psql "$RESTORE_URL" -Atc "SELECT count(*) FROM cards c LEFT JOIN (SELECT card_id, sum(delta) s FROM stamp_events GROUP BY 1) e ON e.card_id = c.id WHERE c.stamp_balance <> coalesce(e.s,0)")"
echo "   tarjetas con saldo distinto a su libro mayor: $BAD"; [ "$BAD" = "0" ] || { echo "FALLA: libro mayor"; exit 1; }
NORLS="$(psql "$RESTORE_URL" -Atc "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity")"
echo "   tablas sin RLS tras restaurar: $NORLS"; [ "$NORLS" = "0" ] || { echo "FALLA: RLS"; exit 1; }
DUP="$(psql "$RESTORE_URL" -Atc "SELECT count(*) FROM (SELECT card_id FROM rewards WHERE status='available' GROUP BY 1 HAVING count(*)>1) x")"
echo "   tarjetas con más de un premio disponible: $DUP"; [ "$DUP" = "0" ] || { echo "FALLA: premios"; exit 1; }

APP="$(psql "$RESTORE_URL" -Atc "SELECT has_table_privilege('vlux_app','cards','SELECT,INSERT,UPDATE') AND has_table_privilege('vlux_app','stamp_events','INSERT') AND NOT has_table_privilege('vlux_app','stamp_events','UPDATE')")"
echo "   permisos mínimos de vlux_app tras restaurar: $APP"; [ "$APP" = "t" ] || { echo "FALLA: permisos"; exit 1; }

echo "4) Registro del último respaldo verificado"
echo "$STAMP $(cut -d' ' -f1 "$FILE.sha256") OK" >> "$BACKUP_DIR/ULTIMO_RESPALDO_VERIFICADO.txt"
if [ "${KEEP_RESTORE:-0}" != "1" ]; then psql "$RESTORE_ADMIN_URL" -qc "DROP DATABASE $RESTORE_DB"; fi
echo "RESPALDO Y RESTAURACIÓN VERIFICADOS: $FILE"
