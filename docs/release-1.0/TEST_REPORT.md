# VLUX Loyalty 1.0.0-rc.1 · Informe de pruebas

Fecha: 2026-11-07. Entorno: contenedor Linux, Node 22.23.4, PostgreSQL 16 local, Playwright con Chromium/WebKit/Firefox. Datos 100 % sintéticos. Salidas completas en `evidencia/`.

## Resumen
| Suite | Línea base V0.4.6 | RC | Estado | Evidencia |
|---|---|---|---|---|
| Typecheck (`tsc -p .`) | OK | OK | PASS | re-ejecutado al cerrar |
| Unitarias | 65/65 | **71/71** (+6: banderas, versión) | PASS | `pruebas-unitarias.txt` |
| Integración (PostgreSQL real) | 141/141 | **148/148** (+7: `release-rc1.test.ts`) | PASS | `pruebas-integracion.txt` |
| Build `build:vercel` | OK | OK (JS 579 kB / 182 kB gzip) | PASS | |
| `npm audit` (todas las dependencias) | 0 | 0 | PASS | |
| Instalación desde cero 0001→0015 | — | OK | PASS | `MIGRATIONS.md` |
| 0015 aplicar → revertir → reaplicar | — | OK | PASS | |
| Prueba de que `release-rc1` detecta el defecto sin 0015 | — | falla como se espera | PASS | `release-rc1-sin-0015.txt` |
| Autorización negativa | 101 aserciones | 101 aserciones (34×401, 16×403, 30×404, 15×409, 6×429: sin sesión, otro negocio, rol equivocado, sesión revocada, CSRF, invitaciones vencidas, Control Center sin 2FA, exportación sin step-up) | PASS | `SECURITY_REVIEW.md` |
| E2E V0.4.6 | 27/27 | 27/27 | PASS | `e2e-v046.txt` |
| Regresión E2E V0.2 / V0.2.1 / V0.2.2 | 29 / 14 / 40 | 29 / 14 / 40 | PASS | `e2e-regresion-v02-v045.txt` |
| Regresión E2E V0.3 | 24 + 1 BLOCKED | 24 + 1 BLOCKED | PASS* | *BLOCKED = Google Wallet (requiere cuenta de emisor; fuera de alcance) |
| Regresión E2E V0.4 / V0.4.2 / V0.4.3 / V0.4.4 / V0.4.5 | 35 / 36 / OK / 42 / 26 | igual | PASS | |
| E2E con las 5 funciones congeladas en `0` | — | V0.2 29/29, V0.4.5 26/26 | PASS | `e2e-funciones-congeladas.txt` |
| Respaldo + restauración aislada + verificación bajo escritura concurrente | — | PASS (9.5 s) | PASS | `backup-verify-local.txt` |
| Simulacro de restauración desde archivo cifrado | — | PASS (3 s, 30,000 tarjetas) | PASS | `restore-drill-local.txt` |
| Carga 1 / 10 / 50 / 100 / 300 negocios | 300: p95 25.7 / p99 131 ms | 300: p95 18.4 / p99 40.7 ms, 0 errores | PASS | `carga-*.txt|json`, `PERFORMANCE.md` |
| Serie del tablero antes/después (7/14/30/90 días) | — | resultados idénticos, 803→22 ms | PASS | `dashboard-series-antes-despues.txt` |

## Pruebas nuevas del RC
`tests/integration/release-rc1.test.ts`
1. Todas las funciones de `public` (no de extensiones) tienen `search_path` fijo.
2. Ninguna función ejecutable por PUBLIC; `vlux_app` solo ejecuta su lista.
3. Disparadores (`set_updated_at`, `logo_hash`, `forbid_mutation`) siguen funcionando para `vlux_app` sin EXECUTE.
4. Bitácoras de solo inserción: UPDATE/DELETE rechazados, incluso con la variable de purga de **otro** negocio.
5. `ops/grants.sql` sobre una base restaurada con `--no-privileges` deja la misma huella de permisos que una base migrada.
6. Serie diaria del tablero agrupa por día local de México, excluye anuladas y fuera de rango.
7. Funciones congeladas devuelven 409 `feature_disabled` y la compra sigue funcionando.
`tests/unit/features.test.ts` (4) y `tests/unit/version.test.ts` (2).

## Flakes investigados
| Síntoma | Causa | Corrección |
|---|---|---|
| Prueba 6 fallaba solo tras la 5 | La 5 dejaba una transacción abierta en una conexión del pool | `ROLLBACK` en `finally` en todas las pruebas con transacción |
| `backup-verify` marcaba diferencia de permisos en local | Funciones de `pg_stat_statements` (extensión) en `public` | Se excluyen objetos de extensiones (`pg_depend deptype 'e'`) |
| Verificación de respaldo fallaría con tráfico real | Comparaba conteos exactos con el origen vivo | Rango antes/después del dump |
| E2E V0.4.5 congelada falló una vez | Faltaba `EMAIL_PROVIDER=mock` en mi preparación (no es defecto del producto) | Repetida: 26/26 |
Ninguna prueba se desactivó ni se marcó como omitida para conseguir verde.

## NO probado (y por qué)
| Prueba | Estado | Motivo |
|---|---|---|
| Teléfonos físicos (iPhone, Android, caja) | NOT TESTED | Requiere dispositivos y personas (`DEVICE_TESTS.md`) |
| Asesores de Supabase después de 0015 | BLOCKED | Falta pegar `0015_pegar_en_supabase.sql` (escritura bloqueada para el conector) |
| Respaldo y restauración reales de Supabase | BLOCKED | Faltan repo privado y secretos (`BACKUP_RECOVERY.md`) |
| Carga contra Supabase/Vercel reales | NOT TESTED | Prohibido contra Preview público; requiere proyecto de pago aislado con autorización |
| Google Wallet / Apple Wallet | NOT TESTED | Fuera del alcance 1.0 |
| Producción | NOT TESTED | No existe |
