# vlux-ops (PRIVADO)

Repositorio **privado** de operación de VLUX Loyalty. Aquí viven los respaldos cifrados y sus secretos.
**Nunca lo hagas público** y nunca pongas aquí una cadena de conexión, contraseña o frase en un archivo: solo en *Settings → Secrets*.

Contenido: `.github/workflows/respaldo-diario.yml`, `ops/backup-verify.sh`, `ops/restore-drill.sh`, `ops/grants.sql` (copias generadas por `ops/vlux-ops/export.sh` del repositorio de la aplicación; si cambia `ops/grants.sql` allá, vuelve a exportar).

## Secretos (Settings → Secrets and variables → Actions → Secrets)
| Nombre | Qué es |
|---|---|
| `SUPABASE_BACKUP_URL` | Conexión del **dueño del esquema** por Session Pooler (puerto 5432, usuario `postgres.<ref>`), terminada en `?sslmode=require`. Del proyecto que vas a respaldar |
| `BACKUP_PASSPHRASE` | Frase aleatoria de 40+ caracteres. Guárdala también en tu gestor de contraseñas: sin ella los respaldos no sirven |

## Primer respaldo (manual) y verificación
1. Actions → **Respaldo diario verificado** → Run workflow. No hay programación hasta el paso 5.
2. Debe terminar en verde. El paso "Verificar destino restringido" confirma que el repo es privado.
3. Descarga el artefacto `respaldo-vlux-<id>` (contiene `.dump.gpg`, `.sha256` y `ULTIMO_RESPALDO_VERIFICADO.txt`).
4. Simulacro de restauración en tu máquina, con un PostgreSQL local o Docker **que no sea Supabase** (el script se niega a restaurar sobre Supabase):
   ```bash
   docker run -d --name vlux-restore -e POSTGRES_PASSWORD=solo-local -p 5433:5432 postgres:17
   sha256sum -c vlux-*.dump.gpg.sha256
   BACKUP_FILE=$PWD/vlux-AAAAMMDDTHHMMSSZ.dump.gpg BACKUP_PASSPHRASE='<tu frase>' \
   RESTORE_ADMIN_URL=postgres://postgres:solo-local@localhost:5433/postgres ./ops/restore-drill.sh
   docker rm -f vlux-restore
   ```
   Debe terminar con todas las verificaciones en "sí"/0 diferencias.
5. Solo entonces activa la programación: Settings → Secrets and variables → Actions → **Variables** → `BACKUP_SCHEDULE` = `on`.
6. Alerta: si falla, el workflow abre/comenta el issue "Respaldo diario FALLÓ" (sin datos ni secretos). Activa notificaciones de GitHub para este repo.

## Si algo sale mal
- "Repositorio público": detente, vuelve el repo a privado y borra los artefactos de esa ejecución.
- "Faltan secretos": agrégalos en Settings → Secrets.
- Falla de verificación (conteos, permisos): no la ignores; revisa el registro y `docs/release-1.0/BACKUP_RECOVERY.md` del repositorio de la aplicación.
