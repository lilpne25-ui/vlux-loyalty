# V0.4.2 · Respaldos

**Estado: BLOCKED** (sin cambios). La única corrida del workflow «Respaldo diario verificado» (manual, 2026-11-01 03:06 UTC) falló porque faltan los secretos `SUPABASE_BACKUP_URL` y `BACKUP_PASSPHRASE`. El YAML es válido y el workflow está activo en `main`.

No se solicitaron ni imprimieron valores. No hay cambios de facturación.

## Procedimiento exacto (lo hace Vlux en GitHub; nada por chat)
1. Supabase → proyecto `vlux-loyalty-preview` → Connect → **Session Pooler** (puerto 5432, usuario `postgres.<ref>`), agregar `?sslmode=require`. Se necesita la contraseña del usuario administrador de la base.
2. GitHub → repo `vlux-loyalty` → Settings → Secrets and variables → Actions → crear `SUPABASE_BACKUP_URL` con esa cadena y `BACKUP_PASSPHRASE` con una frase larga guardada en un gestor de contraseñas.
3. Actions → «Respaldo diario verificado» → Run workflow.
4. Verificar en el log: dump creado, restauración en la base PostgreSQL 17 aislada del runner, conteos por tabla, `.gpg` con hash comprobado tras descifrar, retención aplicada.
5. Anotar resultado y repetir tras la corrida programada (03:17 hora del centro).
Cuando esté verde: probar una restauración manual del `.gpg` descifrado en una base vacía aislada y registrar fecha y resultado.
