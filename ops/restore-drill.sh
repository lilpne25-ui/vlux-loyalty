#!/usr/bin/env bash
# 1.0.0-rc.1 · Simulacro de restauración desde un respaldo CIFRADO (.dump.gpg) hacia una base AISLADA.
# Mide el tiempo (insumo del RTO) y deja evidencia sin datos personales.
# Uso:
#   BACKUP_FILE=vlux-AAAAMMDDTHHMMSSZ.dump.gpg      (descargado del repositorio privado de operación)
#   BACKUP_PASSPHRASE=...                            (desde el gestor de secretos; nunca en la línea de comandos)
#   RESTORE_ADMIN_URL=postgres://postgres:...@localhost:5432/postgres   (servidor AISLADO, nunca producción)
#   ./ops/restore-drill.sh
# Nunca restaura sobre una base existente: crea "vlux_drill_<fecha>" y la conserva para revisión (DROP manual).
set -euo pipefail
: "${BACKUP_FILE:?Falta BACKUP_FILE}"; : "${BACKUP_PASSPHRASE:?Falta BACKUP_PASSPHRASE}"; : "${RESTORE_ADMIN_URL:?Falta RESTORE_ADMIN_URL}"
case "$RESTORE_ADMIN_URL" in *supabase.co*|*pooler.supabase.com*) echo "Rechazado: el simulacro no se hace sobre Supabase. Usa un servidor aislado."; exit 1;; esac
T0=$(date +%s)
WORK="$(mktemp -d)"; chmod 700 "$WORK"; trap 'rm -rf "$WORK"' EXIT
DB="vlux_drill_$(date -u +%Y%m%d%H%M%S)"

echo "1) Integridad del archivo cifrado"
if [ -f "$BACKUP_FILE.sha256" ]; then (cd "$(dirname "$BACKUP_FILE")" && sha256sum -c "$(basename "$BACKUP_FILE").sha256"); else echo "   (sin .sha256 junto al archivo: se omite)"; fi

echo "2) Descifrado (AES-256, frase desde la variable de entorno)"
gpg --batch --quiet --pinentry-mode loopback --passphrase-fd 3 -d -o "$WORK/r.dump" "$BACKUP_FILE" 3<<<"$BACKUP_PASSPHRASE"
pg_restore --list "$WORK/r.dump" > /dev/null && echo "   archivo de pg_dump válido"

echo "3) Restauración en base AISLADA: $DB"
psql "$RESTORE_ADMIN_URL" -v ON_ERROR_STOP=1 -qc "CREATE DATABASE $DB"
URL="${RESTORE_ADMIN_URL%/*}/$DB"
psql "$URL" -v ON_ERROR_STOP=1 -qc "DO \$\$BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='vlux_app') THEN CREATE ROLE vlux_app NOLOGIN; END IF; END\$\$; DROP SCHEMA public CASCADE;"
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$URL" "$WORK/r.dump"
psql "$URL" -v ON_ERROR_STOP=1 -q -f "$(dirname "$0")/grants.sql"
T1=$(date +%s)

echo "4) Verificaciones"
q() { psql "$URL" -v ON_ERROR_STOP=1 -Atc "$1"; }
MIG="$(q "SELECT max(version) || ' (' || count(*) || ')' FROM schema_migrations")"; echo "   última migración: $MIG"
LEDGER="$(q "SELECT count(*) FROM cards c LEFT JOIN (SELECT card_id, sum(delta) s FROM stamp_events GROUP BY 1) e ON e.card_id = c.id WHERE c.stamp_balance <> coalesce(e.s,0)")"
NORLS="$(q "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity")"
PUB="$(q "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e') AND EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE a.grantee = 0)")"
FK="$(q "SELECT count(*) FROM pg_constraint WHERE contype = 'f' AND NOT convalidated")"
COUNTS="$(q "SELECT string_agg(t || '=' || n, ' ' ORDER BY t) FROM (SELECT 'businesses' t, count(*) n FROM businesses UNION ALL SELECT 'cards', count(*) FROM cards UNION ALL SELECT 'purchases', count(*) FROM purchases UNION ALL SELECT 'stamp_events', count(*) FROM stamp_events UNION ALL SELECT 'audit_events', count(*) FROM audit_events) x")"
echo "   tarjetas con saldo distinto al libro mayor: $LEDGER"; echo "   tablas sin RLS: $NORLS"; echo "   funciones ejecutables por PUBLIC: $PUB"; echo "   llaves foráneas sin validar: $FK"
echo "   conteos: $COUNTS"
FUNC="$(psql "$URL" -v ON_ERROR_STOP=1 -Atq <<'SQL'
BEGIN;
SET LOCAL ROLE vlux_app;
SELECT set_config('app.business_id', (SELECT id::text FROM businesses ORDER BY created_at LIMIT 1), true) \g /dev/null
SELECT CASE WHEN (SELECT count(*) FROM cards) = (SELECT count(*) FROM cards WHERE business_id = current_business_id()) THEN 'rls-ok' ELSE 'rls-FALLA' END;
ROLLBACK;
SQL
)"
echo "   prueba como vlux_app: $FUNC"
[ "$LEDGER" = 0 ] && [ "$NORLS" = 0 ] && [ "$PUB" = 0 ] && [ "$FK" = 0 ] && [ "$FUNC" = rls-ok ] || { echo "SIMULACRO FALLÓ"; exit 1; }
T2=$(date +%s)
echo "5) Resultado: descifrado+restauración $((T1-T0)) s · verificación $((T2-T1)) s · total $((T2-T0)) s · base: $DB (bórrala al terminar la revisión)"
echo "SIMULACRO DE RESTAURACIÓN OK"
