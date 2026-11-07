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
# Salvaguarda (auditoría de datos 2026-11-07): el destino de la prueba jamás puede ser Supabase ni el mismo servidor del origen.
case "$RESTORE_ADMIN_URL" in *supabase.co*|*pooler.supabase.com*) echo "Rechazado: RESTORE_ADMIN_URL apunta a Supabase. Usa un servidor aislado."; exit 1;; esac
hostport() { printf '%s' "$1" | sed -E 's#^[a-z]+://[^@]*@##; s#[/?].*$##'; }
[ "$(hostport "$SOURCE_URL")" != "$(hostport "$RESTORE_ADMIN_URL")" ] || { echo "Rechazado: origen y destino son el mismo servidor."; exit 1; }
BACKUP_DIR="${BACKUP_DIR:-./backups}"; mkdir -p "$BACKUP_DIR"; chmod 700 "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$BACKUP_DIR/vlux-$STAMP.dump"
RESTORE_DB="vlux_restore_$(date -u +%Y%m%d%H%M%S)"

Q="SELECT string_agg(t || '=' || n, ' ' ORDER BY t) FROM (
  SELECT 'businesses' t, count(*) n FROM businesses UNION ALL SELECT 'staff_users', count(*) FROM staff_users
  UNION ALL SELECT 'customers', count(*) FROM customers UNION ALL SELECT 'cards', count(*) FROM cards
  UNION ALL SELECT 'purchases', count(*) FROM purchases UNION ALL SELECT 'visits', count(*) FROM visits
  UNION ALL SELECT 'rewards', count(*) FROM rewards UNION ALL SELECT 'stamp_events', count(*) FROM stamp_events
  UNION ALL SELECT 'audit_events', count(*) FROM audit_events UNION ALL SELECT 'migrations', count(*) FROM schema_migrations
  UNION ALL SELECT 'business_subscriptions', count(*) FROM business_subscriptions UNION ALL SELECT 'platform_audit_events', count(*) FROM platform_audit_events
  UNION ALL SELECT 'staff_memberships', count(*) FROM staff_memberships UNION ALL SELECT 'reward_rules', count(*) FROM reward_rules
  UNION ALL SELECT 'platform_admins', count(*) FROM platform_admins) x"
SRC_BEFORE="$(psql "$SOURCE_URL" -Atc "$Q")"

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
# pg_dump lee una sola instantánea al iniciar. El origen sigue recibiendo escrituras, así que se cuenta ANTES y DESPUÉS
# del respaldo: cada tabla restaurada debe quedar entre ambos conteos (las tablas solo crecen salvo una purga manual).
DST="$(psql "$RESTORE_URL" -Atc "$Q")"
SRC_AFTER="$(psql "$SOURCE_URL" -Atc "$Q")"
echo "   origen antes:   $SRC_BEFORE"; echo "   restaurada:     $DST"; echo "   origen después: $SRC_AFTER"
awk -v a="$SRC_BEFORE" -v d="$DST" -v b="$SRC_AFTER" 'BEGIN {
  n = split(a, A, " "); split(d, D, " "); split(b, B, " "); bad = 0
  for (i = 1; i <= n; i++) { split(A[i], x, "="); split(D[i], y, "="); split(B[i], z, "=");
    if (x[1] != y[1] || y[1] != z[1] || y[2] + 0 < x[2] + 0 || y[2] + 0 > z[2] + 0) { print "   FUERA DE RANGO: " A[i] " / " D[i] " / " B[i]; bad = 1 } }
  exit bad }' || { echo "FALLA: los conteos no coinciden (si hubo una purga durante el respaldo, repite)"; exit 1; }
BAD="$(psql "$RESTORE_URL" -Atc "SELECT count(*) FROM cards c LEFT JOIN (SELECT card_id, sum(delta) s FROM stamp_events GROUP BY 1) e ON e.card_id = c.id WHERE c.stamp_balance <> coalesce(e.s,0)")"
echo "   tarjetas con saldo distinto a su libro mayor: $BAD"; [ "$BAD" = "0" ] || { echo "FALLA: libro mayor"; exit 1; }
NORLS="$(psql "$RESTORE_URL" -Atc "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity")"
echo "   tablas sin RLS tras restaurar: $NORLS"; [ "$NORLS" = "0" ] || { echo "FALLA: RLS"; exit 1; }
DUP="$(psql "$RESTORE_URL" -Atc "SELECT count(*) FROM (SELECT card_id FROM rewards WHERE status='available' GROUP BY 1 HAVING count(*)>1) x")"
echo "   tarjetas con más de un premio disponible: $DUP"; [ "$DUP" = "0" ] || { echo "FALLA: premios"; exit 1; }

APP="$(psql "$RESTORE_URL" -Atc "SELECT has_table_privilege('vlux_app','cards','SELECT,INSERT,UPDATE') AND has_table_privilege('vlux_app','stamp_events','INSERT') AND NOT has_table_privilege('vlux_app','stamp_events','UPDATE')")"
echo "   permisos mínimos de vlux_app tras restaurar: $APP"; [ "$APP" = "t" ] || { echo "FALLA: permisos"; exit 1; }

# Permisos del rol de la app: deben ser idénticos a los del origen (ops/grants.sql al día) y nada ejecutable por PUBLIC.
PQ="SELECT string_agg(x, ' ' ORDER BY x) FROM (
  SELECT c.relname || ':' || (CASE WHEN has_table_privilege('vlux_app', c.oid, 'SELECT') THEN 'r' ELSE '' END)
    || (CASE WHEN has_table_privilege('vlux_app', c.oid, 'INSERT') THEN 'a' ELSE '' END)
    || (CASE WHEN has_table_privilege('vlux_app', c.oid, 'UPDATE') THEN 'w' ELSE '' END)
    || (CASE WHEN has_table_privilege('vlux_app', c.oid, 'DELETE') THEN 'd' ELSE '' END) AS x
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r'
  UNION ALL SELECT p.proname || '()' || (CASE WHEN has_function_privilege('vlux_app', p.oid, 'EXECUTE') THEN 'x' ELSE '' END)
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')) y"
if [ "$(psql "$SOURCE_URL" -Atc "$PQ")" = "$(psql "$RESTORE_URL" -Atc "$PQ")" ]; then echo "   permisos de vlux_app idénticos al origen: sí"; else echo "FALLA: permisos de vlux_app distintos al origen (actualiza ops/grants.sql)"; exit 1; fi
PUBQ="SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e') AND EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE a.grantee = 0)"
# La copia restaurada se endurece con grants.sql, así que la deriva real solo se ve en el ORIGEN.
SRCPUB="$(psql "$SOURCE_URL" -Atc "$PUBQ")"
echo "   funciones ejecutables por PUBLIC en el ORIGEN: $SRCPUB"; [ "$SRCPUB" = "0" ] || { echo "FALLA: el origen tiene funciones con EXECUTE a PUBLIC"; exit 1; }
PUB="$(psql "$RESTORE_URL" -Atc "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e') AND EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE a.grantee = 0)")"
echo "   funciones ejecutables por PUBLIC tras restaurar: $PUB"; [ "$PUB" = "0" ] || { echo "FALLA: EXECUTE a PUBLIC"; exit 1; }

# Prueba funcional en la copia: como vlux_app (RLS activa) se lee un negocio y se registra una visita; luego se deshace.
FUNC="$(psql "$RESTORE_URL" -v ON_ERROR_STOP=1 -Atq <<'SQL'
BEGIN;
SET LOCAL ROLE vlux_app;
SELECT set_config('app.business_id', (SELECT id::text FROM businesses ORDER BY created_at LIMIT 1), true) \g /dev/null
SELECT CASE WHEN (SELECT count(*) FROM cards) = (SELECT count(*) FROM cards WHERE business_id = current_business_id()) THEN 'rls-ok' ELSE 'rls-FALLA' END;
INSERT INTO visits (business_id, card_id, created_by)
  SELECT business_id, id, (SELECT user_id FROM staff_memberships WHERE business_id = current_business_id() LIMIT 1) FROM cards LIMIT 1;
SELECT 'escritura-ok';
ROLLBACK;
SQL
)" || { echo "FALLA: la app no puede operar sobre la copia restaurada"; exit 1; }
echo "   prueba funcional como vlux_app: $(echo $FUNC)"
case "$FUNC" in *rls-FALLA*) echo "FALLA: RLS"; exit 1;; esac

echo "4) Registro del último respaldo verificado"
echo "$STAMP $(cut -d' ' -f1 "$FILE.sha256") OK" >> "$BACKUP_DIR/ULTIMO_RESPALDO_VERIFICADO.txt"
if [ "${KEEP_RESTORE:-0}" != "1" ]; then psql "$RESTORE_ADMIN_URL" -qc "DROP DATABASE $RESTORE_DB"; fi
echo "RESPALDO Y RESTAURACIÓN VERIFICADOS: $FILE"
