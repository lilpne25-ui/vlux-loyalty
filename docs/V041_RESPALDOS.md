# V0.4.1 · Respaldos de Supabase

**Estado: BLOCKED. No hay respaldo operativo.**
- Workflow `.github/workflows/respaldo-diario.yml` (existe en `main` y en esta rama): respaldo con `pg_dump`, restauración en una base PostgreSQL 17 aislada de CI, verificación de integridad, cifrado GPG AES-256 con verificación de descifrado, retención. Se ejecuta a diario o a mano (`workflow_dispatch`).
- Única ejecución registrada: manual, 2026-11-01 03:06 UTC, **falló** en 25 s porque faltan los secretos (el paso «Verificar secretos» lo avisa).
- No se puede leer la lista de secretos desde aquí (el acceso a esa ruta de GitHub está bloqueado), así que no se afirma si están creados.
- No se ejecutó respaldo ni restauración: no hay credenciales.

## Qué debe hacer Vlux (directo en GitHub, nada por chat)
1. GitHub → repo `vlux-loyalty` → Settings → Secrets and variables → Actions → New repository secret.
2. `SUPABASE_BACKUP_URL`: conexión del **Session Pooler** (puerto 5432, usuario `postgres.<ref>`) con `?sslmode=require`, tomada de Supabase → Connect. Requiere la contraseña del usuario administrador de la base (si no la tienes, resetearla en Supabase → Database → Settings).
3. `BACKUP_PASSPHRASE`: frase larga; guardarla en un gestor de contraseñas, no en GitHub ni en el chat.
4. Actions → «Respaldo diario verificado» → Run workflow, y avisarme el resultado.

## Criterio para declararlo operativo
Corrida verde con: dump creado, restauración en base aislada, verificación de tablas y conteos, archivo `.gpg` con hash comprobado, retención aplicada; y una corrida programada posterior. Hasta entonces: BLOCKED.
Los artefactos del respaldo cifrado se guardan como artefacto privado de Actions; **no** deben subirse al repositorio (que es público).

## Riesgo detectado (media-alta, antes de datos reales)
El repositorio es **público**. Los artefactos de GitHub Actions de un repositorio público pueden ser descargados por cualquier persona con cuenta de GitHub. El archivo va cifrado (GPG AES-256, frase larga), pero con **datos personales reales** no conviene dejarlo ahí aunque esté cifrado. Opciones antes del piloto real, en orden de preferencia:
1. Subir el `.gpg` a un almacenamiento privado (por ejemplo, un bucket privado) en vez de artefacto público, y dejar en Actions solo el estado.
2. Mantener el artefacto solo mientras la base tenga datos sintéticos (hoy).
3. Pasar el repositorio a privado: **decisión exclusiva de Vlux; no se sugiere ni se cambia aquí**.
