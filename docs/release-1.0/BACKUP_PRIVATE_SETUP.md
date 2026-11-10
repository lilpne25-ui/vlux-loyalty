# Respaldos privados: apagar el workflow público y activar `vlux-ops`

Fecha: 2026-11-07. Responde al riesgo detectado por Vlux: `main` todavía contiene el workflow **anterior** (sin la protección de repositorio privado), y la rama `release/1.0.0-rc1` contiene el protegido. Nada de esto toca `main`, Production ni datos: son instrucciones y un paquete probado en local.

## 0. El riesgo, medido
| Hecho | Estado |
|---|---|
| `main` tiene `respaldo-diario.yml` sin protección, programado a diario 09:17 UTC | Verificado (`git show origin/main:.github/workflows/respaldo-diario.yml`) |
| Las 7 ejecuciones fallaron en el paso "Verificar secretos", **antes** de leer la base ni subir nada | Por el diseño del workflow y el issue #2; no hay artefactos que borrar |
| Si alguien agrega `SUPABASE_BACKUP_URL` y `BACKUP_PASSPHRASE` a **este** repo (público), la siguiente ejecución subiría el respaldo cifrado como artefacto público (30 días) | Riesgo real, hoy latente |
| La rama del RC ya trae el candado, pero el candado solo protege cuando esa versión es la de `main` | Por eso hay que actuar sobre `main` o apagar el workflow |

## 1. Apagar el workflow público (sin tocar código, reversible, ≈ 1 min)
En GitHub, repo `lilpne25-ui/vlux-loyalty` → **Actions** → **Respaldo diario verificado** → menú **⋯** → **Disable workflow**.
- Detiene la ejecución programada y las manuales. No cambia `main`, no pide merge.
- Verifica: la página del workflow muestra "This workflow was disabled manually".
- Cierra el issue #2 con el comentario "Movido a repositorio privado vlux-ops" cuando la §3 esté verde.
- Revisa **Settings → Secrets and variables → Actions** de ESTE repo: debe estar **vacío** de `SUPABASE_BACKUP_URL` y `BACKUP_PASSPHRASE`. Si existen, bórralos y rota la contraseña de la base (asume que se pudieron usar).

### Cierre definitivo en código (requiere tu autorización; no lo hice)
Parche listo: [`parches/main-retirar-respaldo-publico.patch`](parches/main-retirar-respaldo-publico.patch) (elimina el workflow de `main`). Cuando decidas: aplicarlo en una rama desde `main` y fusionar con PR, o dejar que la fusión de `release/1.0.0-rc1` lo reemplace (esa versión se niega a correr en un repo público). Mientras tanto basta §1.

## 2. Crear `vlux-ops` (privado, independiente)
1. GitHub → New repository → nombre `vlux-ops` → **Private** → sin README. (Cuenta de Vlux; GitHub Free incluye repos privados y minutos de Actions.)
2. En una máquina tuya:
   ```bash
   git clone git@github.com:lilpne25-ui/vlux-ops.git ../vlux-ops
   git checkout release/1.0.0-rc1 && git pull
   ./ops/vlux-ops/export.sh ../vlux-ops
   cd ../vlux-ops && git status
   ```
   El script solo copia 6 archivos (workflow, `ops/*.sh`, `ops/grants.sql`, `README.md`, `.gitignore`). **Probado**: desde esa carpeta exportada corrí `backup-verify.sh` contra una base local y salió verificado (conteos antes/después, RLS, permisos, 0 funciones PUBLIC, prueba funcional).
3. `git add -A && git commit -m "Respaldos verificados" && git push -u origin main`.
4. Confirma en la web: el repo muestra el candado **Private**.

## 3. Primer respaldo, paso a paso
**Antes de ejecutar:** decide el origen del primer respaldo.
- Supabase Preview contiene datos de un negocio real y contactos de origen no confirmado: trátalos como datos personales (ver `DATA_PROTECTION_PLAN.md`). Si hay duda, no respaldes Preview todavía: haz el primer ensayo contra una base vacía o sintética.
- No se debe respaldar producción ni datos reales hasta cumplir 1–3 de abajo y la §4.

1. En `vlux-ops` → Settings → **Secrets and variables → Actions → New repository secret**:
   - `SUPABASE_BACKUP_URL`: Supabase → Connect → **Session pooler** (puerto 5432), usuario `postgres.kpcmxmmwcolcxhkiwmaq`, con tu contraseña de base de datos y `?sslmode=require`. Es la conexión del dueño del esquema (no la de `vlux_app`). Pégala solo en el campo del secreto.
   - `BACKUP_PASSPHRASE`: genera 40+ caracteres (`openssl rand -base64 48`), pégala y **guárdala en tu gestor de contraseñas ahora**.
2. Actions → **Respaldo diario verificado** → **Run workflow** (rama `main`).
3. Debe quedar **verde**. Pasos esperados: Verificar destino restringido ✅ → Verificar secretos ✅ → Respaldo, restauración aislada y verificación ✅ → Cifrar ✅ → Subir artefacto ✅.
4. Descarga el artefacto `respaldo-vlux-<id>` y haz el **simulacro** en tu máquina (README de `vlux-ops` §4: Docker local, nunca Supabase). Debe terminar con 0 diferencias.
5. Activa la programación: Settings → Variables → `BACKUP_SCHEDULE` = `on`. Hasta entonces el cron no corre.
6. Al día siguiente (03:17 hora de México) confirma una ejecución verde programada.
7. Pásame el resultado (verde/rojo y las líneas finales del paso de verificación, sin pegar contraseñas ni URLs) y actualizo `GO_NO_GO.md`: el #2 pasa a PASS solo cuando el simulacro (paso 4) salga bien.

## 4. Qué NO hacer
- No poner secretos, URLs de conexión ni respaldos en este repo público, en issues, ni en el chat.
- No hacer público `vlux-ops` (el workflow se detendría, pero un repo público expone el historial).
- No ejecutar el primer respaldo contra producción antes de tener producción separada (`PRODUCTION_ARCHITECTURE.md`) y de haber verificado el destino privado.
- No borrar `ops/grants.sql` de `vlux-ops`: si cambia en la app, vuelve a ejecutar `export.sh` y haz commit (si quedan desalineados, la verificación de permisos falla a propósito).

## 5. Bloqueos que siguen
| # | Bloqueo | Quién |
|---|---|---|
| 1 | Desactivar el workflow en `main` (§1) | Vlux, 1 min |
| 2 | Crear `vlux-ops` y secretos; primer respaldo y simulacro (§2–3) | Vlux, ≈ 30 min |
| 3 | Confirmar que los 8 clientes con contacto de Preview son de prueba | Vlux |
| 4 | Producción separada y planes de pago | Vlux (autorización) |
| 5 | Pruebas físicas y revisión legal | Vlux / abogado |
