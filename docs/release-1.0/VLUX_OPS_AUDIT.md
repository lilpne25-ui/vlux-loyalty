# Auditoría de `vlux-ops` y del sistema de respaldos · 2026-11-07

Archivos revisados (clon de `lilpne25-ui/vlux-ops`, commit `74a9f45`): `.github/workflows/respaldo-diario.yml`, `ops/backup-verify.sh`, `ops/restore-drill.sh`, `ops/grants.sql`, `README.md`, `.gitignore`. Los cinco scripts/workflow son **idénticos** a `ops/` y `ops/vlux-ops/` del repositorio de la aplicación (diff sin diferencias). No se ejecutó el workflow, no se leyeron secretos, no se cambió nada en `vlux-ops`.

## Verificaciones solicitadas
| # | Punto | Estado | Evidencia |
|---|---|---|---|
| 1 | Repositorio privado | **PASS** | metadatos de GitHub: `visibility: private` |
| 2 | El workflow rechaza repos públicos | **PASS (revisión de código)** | primer paso `gh api repos/… --jq .private`; si falla la llamada, la variable queda vacía y también aborta (falla cerrada). No ejecutado en runtime |
| 3 | Ejecución programada desactivada | **NOT TESTED** | el job exige `vars.BACKUP_SCHEDULE == 'on'`; no puedo leer variables con las herramientas disponibles. 0 ejecuciones registradas, lo que **no es concluyente** (el workflow se creó el 2026-11-07 09:32 UTC, después del cron de ese día). **Vlux debe confirmar en Settings → Variables que `BACKUP_SCHEDULE` no existe** |
| 4 | Secretos no se imprimen | **PASS con observaciones** | ningún `echo` de secretos; GitHub los enmascara. Obs. B-1 y B-2 abajo |
| 5 | Credenciales fuera de artefactos | **PASS** | el artefacto solo lleva `*.gpg`, `*.sha256` y `ULTIMO_RESPALDO_VERIFICADO.txt` (sin URL); `.gitignore` bloquea `*.dump`, `*.gpg`, `.env*`, `backups/` |
| 6 | Cifrado correcto | **PASS (sintético)** | GPG AES-256; ida y vuelta == hash del original antes de borrar el `.dump` |
| 7 | SHA-256 verificado | **PASS** con hallazgo R-1 | `restore-drill` ejecuta `sha256sum -c`; un `.gpg` alterado → `FAILED` |
| 8 | Existe prueba de restauración | **PASS** | `ops/restore-drill.sh`; 2–3 s en sintético |
| 9 | Comprueba RLS | **PASS** | desactivar RLS en el origen → `FALLA: RLS` |
| 10 | Permisos restaurados | **PASS** | comparación con el origen + `grants.sql`; deriva de `DELETE` → falla |
| 11 | Rechaza restaurar sobre Supabase | **PASS tras corrección** | `restore-drill.sh` ya lo hacía; `backup-verify.sh` **no**; corregido (también rechaza origen = destino) |
| 12 | Detecta fallos | **PASS** | 4 fallos inducidos detectados; aviso por issue "Respaldo diario FALLÓ" (no ejecutado) |

## Hallazgos y correcciones
| ID | Severidad | Hallazgo | Estado |
|---|---|---|---|
| B-0 | Media | `backup-verify.sh` no impedía `RESTORE_ADMIN_URL` hacia Supabase ni origen = destino | **Corregido** en `ops/backup-verify.sh` (probado con 3 URLs). Hay que volver a ejecutar `ops/vlux-ops/export.sh` y copiar a `vlux-ops` |
| B-0b | Media | Una función con `EXECUTE` a PUBLIC en el **origen** no se detectaba (la restauración se endurece antes de medir) | **Corregido** (nuevo chequeo sobre el origen; probado) |
| B-1 | Baja | `SOURCE_URL` y `BACKUP_PASSPHRASE` están en `env:` a nivel de job: los ven todos los pasos y acciones de terceros (`checkout`, `upload-artifact`, `github-script`) | Recomendado: moverlos al paso que los usa |
| B-2 | Baja | `gpg --passphrase "$BACKUP_PASSPHRASE"` en la línea de comandos (visible en `ps` del runner efímero). `restore-drill.sh` ya usa `--passphrase-fd` | Recomendado: usar `--passphrase-fd` también en el workflow |
| R-1 | Media | `restore-drill.sh` omite la verificación SHA-256 si falta el `.sha256` | Recomendado: fallar cerrado |
| B-3 | Media | Acciones por etiqueta móvil (`actions/checkout@v4`, `upload-artifact@v4`, `github-script@v7`) | Recomendado: fijar por SHA en `vlux-ops` |
| B-4 | Info | `pg_dump` solo del esquema `public`: no respalda `auth`, `storage`, extensiones ni configuración de la plataforma (la app no los usa) | Documentado |

## Evaluación adicional
- **Retención:** 30 días de artefacto. Cualquier persona con permiso de lectura al repositorio privado puede descargarlo: hoy solo el propietario (verificar colaboradores).
- **Protección de la clave:** si se pierde `BACKUP_PASSPHRASE`, todo respaldo es inservible; si se filtra junto con un artefacto, el dump queda en claro. Guardarla en un gestor de contraseñas con copia independiente de GitHub.
- **Separación origen/destino:** el destino de la prueba es un servicio PostgreSQL efímero del runner; con las guardas nuevas no puede ser Supabase.
- **GitHub como único almacén y única dependencia:** si la cuenta se bloquea o el repo se borra, se pierden los respaldos y el workflow. Se necesita una segunda copia cifrada fuera de GitHub (no se contrató nada).
- **Un repositorio privado reduce el riesgo, no sustituye** contrato de encargo, base legal, retención, control de acceso y plan de borrado (ver `ODALEX_DATA_PROTECTION_PLAN.md`).
- **Secretos:** no verifiqué su existencia (el conector de GitHub no lista secretos). Estado: **NOT TESTED**; la confirmación del propietario es la única fuente.
- **Riesgo residual en `main`:** el workflow del repositorio público está `disabled_manually` (PASS) pero el archivo sigue en `main` sin candado de repo privado. Hubo 7 ejecuciones programadas, todas fallidas (la última el 2026-11-06; sin secretos). Aplicar el parche de `parches/` para quitarlo.
