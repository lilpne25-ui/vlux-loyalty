# Respaldos y recuperación · VLUX Loyalty

## Estado
| Entorno | Plan Supabase | Respaldo del proveedor | Respaldo propio |
| :- | :- | :- | :- |
| Preview (`vlux-loyalty-preview`) | Free | **No incluido** (Free no tiene respaldos automáticos y pausa el proyecto tras 1 semana sin actividad) | Flujo diario en GitHub Actions, **pendiente de secretos** |
| Piloto con datos reales | Pro (requerido) | Diario, 7 días de retención | Además, el flujo diario (copia externa, 30 días) |

## Estrategia
1. **Pro:** respaldo diario administrado por Supabase (7 días). PITR (100 USD/mes por 7 días) no se justifica todavía.
2. **Copia externa diaria** (`.github/workflows/respaldo-diario.yml`): `pg_dump` del esquema `public` → restauración en un PostgreSQL 17 **aislado** del runner → verificación → respaldo cifrado (AES-256, GPG simétrico) como artefacto con **retención de 30 días**.
3. **Verificación de integridad** (`ops/backup-verify.sh`): conteos origen = restaurada en 10 tablas, saldo de cada tarjeta = suma de su libro mayor, RLS activo en todas las tablas, máximo un premio disponible por tarjeta, permisos mínimos de `vlux_app`.
4. **Registro del último respaldo verificado:** `ULTIMO_RESPALDO_VERIFICADO.txt` (fecha UTC + SHA-256) dentro de cada artefacto.
5. **Separación de accesos:** la app (Vercel) nunca tiene credenciales de administración. El respaldo usa un secreto de GitHub Actions distinto. La frase de cifrado se guarda fuera de GitHub.

## Evidencia de restauración (2026-10-31)
Restauración de prueba ejecutada sobre la base local con datos sintéticos de las pruebas: ver `docs/evidencia/v021-respaldo-restauracion.txt` (resultado: **VERIFICADO**).
La ejecución contra Supabase **no se ha hecho**: requiere los secretos `SUPABASE_BACKUP_URL` y `BACKUP_PASSPHRASE` en GitHub (ver pasos). Hasta ver un artefacto verde de ese flujo, el respaldo del Preview no se considera operativo.

## Activar el respaldo diario (Vlux, 5 minutos)
1. Supabase → *Project Settings → Database* → restablecer la contraseña de `postgres` y copiar la cadena de **Session pooler** (puerto 5432, usuario `postgres.<ref>`); agregar `?sslmode=require`.
2. GitHub → repo → *Settings → Secrets and variables → Actions*: crear `SUPABASE_BACKUP_URL` y `BACKUP_PASSPHRASE` (frase larga; guárdala en tu gestor de contraseñas).
3. *Actions → Respaldo diario verificado → Run workflow*. Debe terminar en verde y dejar el artefacto.
4. **El repositorio debe ser privado** antes de guardar respaldos como artefactos.

## Restaurar (procedimiento)
1. Crear un proyecto/base nueva (nunca sobre la base en uso).
2. Descargar el artefacto y descifrar: `gpg --decrypt vlux-AAAA.dump.gpg > vlux.dump`.
3. `pg_restore --no-owner --no-privileges --dbname="$NUEVA" vlux.dump` y `psql "$NUEVA" -f ops/grants.sql`.
4. Crear `vlux_app` con contraseña nueva (sección 3 del manual técnico) y verificar con las consultas del manual.
5. Cambiar `DATABASE_URL` en Vercel a la base restaurada y redeploy.
