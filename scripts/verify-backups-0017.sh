#!/usr/bin/env bash
# 1.0.x · Verifica que ops/backup-verify.sh, ops/restore-drill.sh y ops/grants.sql funcionan con 0017, con y sin 0016.
# SOLO servidores locales aislados: origen (p. ej. PostgreSQL 16 :5432) → destino distinto (p. ej. PostgreSQL 17 :5437).
# Usa las bases que deja scripts/verify-migration-matrix.sh (con datos de la suite de integración, incluidas solicitudes).
# Uso: SRC_ADMIN=postgres://postgres@localhost:5432 DST_ADMIN=postgres://postgres:pw@localhost:5437 ./scripts/verify-backups-0017.sh db1 db2 ...
set -uo pipefail
: "${SRC_ADMIN:?}"; : "${DST_ADMIN:?}"
for u in "$SRC_ADMIN" "$DST_ADMIN"; do case "$u" in *@localhost:*|*@127.0.0.1:*) ;; *) echo "Rechazado: solo localhost."; exit 1;; esac; done
WORK="$(mktemp -d)"; chmod 700 "$WORK"; trap 'rm -rf "$WORK"' EXIT
PASS="frase-de-prueba-local-$(date +%s)-no-es-secreto"
# Huella de permisos FINOS de 0017 (columna por columna + funciones), que backup-verify.sh no compara.
FQ="SELECT coalesce(string_agg(x, ' ' ORDER BY x), '(sin 0017)') FROM (
  SELECT 'col:' || a.attname || ':' || (CASE WHEN has_column_privilege('vlux_app', a.attrelid, a.attnum, 'UPDATE') THEN 'w' ELSE '-' END) AS x
    FROM pg_attribute a WHERE a.attrelid = to_regclass('public.recovery_requests') AND a.attnum > 0 AND NOT a.attisdropped
  UNION ALL SELECT 'fn:' || p.proname || ':' || (CASE WHEN has_function_privilege('vlux_app', p.oid, 'EXECUTE') THEN 'x' ELSE '-' END) || (CASE WHEN p.prosecdef THEN ':definer' ELSE '' END)
    FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'recovery_%'
  UNION ALL SELECT 'rls:' || relrowsecurity::text FROM pg_class WHERE oid = to_regclass('public.recovery_requests')
  UNION ALL SELECT 'chk:' || conname FROM pg_constraint WHERE conrelid = to_regclass('public.recovery_requests') AND contype = 'c' AND conname = 'recovery_requests_minimized') y"
rc=0
for db in "$@"; do
  SRC="$SRC_ADMIN/$db"
  echo "=================== $db ==================="
  echo "esquema: $(psql "$SRC" -Atc "SELECT string_agg(version, ',' ORDER BY version) FROM schema_migrations WHERE version > '0015'")  ·  solicitudes: $( [ "$(psql "$SRC" -Atc "SELECT to_regclass('public.recovery_requests') IS NOT NULL")" = t ] && psql "$SRC" -Atc 'SELECT count(*) FROM recovery_requests' || echo 'n/a (sin 0017)')"
  # 1) backup-verify.sh: respaldo + restauración en otro servidor + verificaciones (borra la copia al final).
  if SOURCE_URL="$SRC" RESTORE_ADMIN_URL="$DST_ADMIN/postgres" BACKUP_DIR="$WORK/b-$db" KEEP_RESTORE=1 bash ops/backup-verify.sh > "$WORK/bv.log" 2>&1; then
    echo "backup-verify.sh: OK"; else echo "backup-verify.sh: FALLA"; tail -15 "$WORK/bv.log"; rc=1; fi
  RDB="$(grep -o 'vlux_restore_[0-9]*' "$WORK/bv.log" | head -1)"
  # 2) restore-drill.sh desde un respaldo CIFRADO (igual que el del workflow privado).
  pg_dump --format=custom --no-owner --no-privileges --schema=public --file="$WORK/$db.dump" "$SRC"
  gpg --batch --quiet --pinentry-mode loopback --passphrase-fd 3 --symmetric --cipher-algo AES256 -o "$WORK/$db.dump.gpg" "$WORK/$db.dump" 3<<<"$PASS"
  (cd "$WORK" && sha256sum "$db.dump.gpg" > "$db.dump.gpg.sha256")
  if BACKUP_FILE="$WORK/$db.dump.gpg" BACKUP_PASSPHRASE="$PASS" RESTORE_ADMIN_URL="$DST_ADMIN/postgres" bash ops/restore-drill.sh > "$WORK/rd.log" 2>&1; then
    echo "restore-drill.sh: OK ($(grep -o 'última migración: .*' "$WORK/rd.log"))"; else echo "restore-drill.sh: FALLA"; tail -15 "$WORK/rd.log"; rc=1; fi
  DDB="$(grep -o 'vlux_drill_[0-9]*' "$WORK/rd.log" | head -1)"
  # 3) Permisos finos de 0017 idénticos en origen, copia de backup-verify y copia del simulacro.
  S="$(psql "$SRC" -Atc "$FQ")"
  for t in "$RDB" "$DDB"; do
    [ -n "$t" ] || continue
    D="$(psql "$DST_ADMIN/$t" -Atc "$FQ")"
    if [ "$S" = "$D" ]; then echo "permisos finos 0017 en $t = origen: sí"; else echo "permisos finos 0017 en $t: DISTINTOS"; echo "  origen:   $S"; echo "  copia:    $D"; rc=1; fi
  done
  # 4) La copia restaurada funciona como vlux_app con 0017: RLS por negocio y barrido de retención.
  if [ -n "$DDB" ] && [ "$S" != "(sin 0017)" ]; then
    R="$(psql "$DST_ADMIN/$DDB" -v ON_ERROR_STOP=1 -Atq <<'SQL'
BEGIN;
SET LOCAL ROLE vlux_app;
SELECT set_config('app.business_id', (SELECT business_id::text FROM recovery_requests ORDER BY created_at LIMIT 1), true) \g /dev/null
SELECT CASE WHEN (SELECT count(*) FROM recovery_requests) = (SELECT count(*) FROM recovery_requests WHERE business_id = current_business_id()) THEN 'rls-ok' ELSE 'rls-FALLA' END;
SELECT set_config('app.scope', 'worker', true) \g /dev/null
SELECT CASE WHEN (recovery_retention_sweep(10) ? 'expired') THEN 'barrido-ok' ELSE 'barrido-FALLA' END;
ROLLBACK;
SQL
)"
    echo "como vlux_app en la copia: $(echo $R)"; case "$R" in *FALLA*|"") rc=1;; esac
  fi
  for t in "$RDB" "$DDB"; do [ -n "$t" ] && psql "$DST_ADMIN/postgres" -qc "DROP DATABASE IF EXISTS $t" >/dev/null; done
done
[ $rc = 0 ] && echo "RESPALDOS CON 0017: TODO OK" || echo "RESPALDOS CON 0017: HAY FALLAS"
exit $rc
