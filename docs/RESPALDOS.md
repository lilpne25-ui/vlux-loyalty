# Respaldos y recuperación · VLUX Loyalty

## Estado
| Entorno | Plan Supabase | Respaldo del proveedor | Respaldo propio |
| :- | :- | :- | :- |
| Preview (`vlux-loyalty-preview`) | Free | **No incluido** (Free no tiene respaldos automáticos y pausa el proyecto tras 1 semana sin actividad) | Flujo diario en GitHub Actions, **NO OPERATIVO** (ver estado verificado V0.2.2) |
| Piloto con datos reales | Pro (requerido) | Diario, 7 días de retención | Además, el flujo diario (copia externa, 30 días) |

## Estado verificado (V0.3, 2026-11-01)
**Sigue NO OPERATIVO.** Nada cambió en lo que falta: el workflow no está en `main` y no hay constancia de los secretos en GitHub. No se fusionó nada en `main` (requiere autorización de Vlux).

Mejoras de V0.3 en la rama `v0.3`:
- Integridad del archivo cifrado: se descifra y se compara el SHA-256 con el del respaldo original antes de borrarlo; se publica el SHA-256 del `.gpg`.
- Aviso de falla: si el job falla, abre (o comenta) un issue `Respaldo diario FALLÓ` en el repositorio, sin datos ni secretos.
- La verificación ahora también cuenta `business_subscriptions` y `platform_audit_events` (tablas de V0.3).
- Retención: 30 días (artefactos de Actions).
- Prueba local repetida con el esquema V0.3: **VERIFICADO en local** (`docs/evidencia/v03-respaldo-restauracion-local.txt`). No es una prueba contra Supabase.

## Estado verificado (V0.2.2, 2026-10-31)
| Punto | Estado real | Cómo se comprobó |
| :- | :- | :- |
| Plan de Supabase | Free, sin respaldos del proveedor | Organización en Supabase (Free, 2 proyectos activos) |
| Workflow `respaldo-diario.yml` | Existe en las ramas `v0.2.1` y `v0.2.2`, **no en `main`** | `git ls-tree origin/main` no tiene `.github/workflows` |
| Programación diaria | **No corre**: GitHub solo programa workflows de la rama principal | La API de Actions responde 404 para ese workflow (nunca se ha ejecutado) |
| Secretos `SUPABASE_BACKUP_URL` y `BACKUP_PASSPHRASE` | **No verificable desde esta sesión** (el proxy bloquea la lectura de secretos); Vlux no ha confirmado haberlos creado | — |
| Almacenamiento y retención | Artefacto cifrado AES-256 en GitHub Actions, 30 días (al activarse) | Definido en el workflow |
| Prueba de restauración | **Hecha en entorno aislado local con datos sintéticos**: VERIFICADO | `docs/evidencia/v022-respaldo-restauracion-local.txt` |
| Restauración desde Supabase | **No hecha** | Requiere la conexión de administración, que no se usa desde esta sesión |

**Conclusión: el respaldo del Preview NO está operativo.** Se marcará operativo solo cuando exista una ejecución verde del workflow contra Supabase con su artefacto.

Lo que falta, en orden: (1) fusionar `v0.2.2` en `main`; (2) crear los dos secretos en GitHub; (3) *Run workflow* y revisar que termine en verde.

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
4. El repositorio es público por decisión de Vlux: los artefactos los puede descargar cualquier usuario de GitHub con sesión iniciada, pero van cifrados con `BACKUP_PASSPHRASE`. Usa una frase larga (20+ caracteres) que nunca esté en GitHub. Con datos reales, además de esto, usar los respaldos de Supabase Pro.

## Restaurar (procedimiento)
1. Crear un proyecto/base nueva (nunca sobre la base en uso).
2. Descargar el artefacto y descifrar: `gpg --decrypt vlux-AAAA.dump.gpg > vlux.dump`.
3. `pg_restore --no-owner --no-privileges --dbname="$NUEVA" vlux.dump` y `psql "$NUEVA" -f ops/grants.sql`.
4. Crear `vlux_app` con contraseña nueva (sección 3 del manual técnico) y verificar con las consultas del manual.
5. Cambiar `DATABASE_URL` en Vercel a la base restaurada y redeploy.
