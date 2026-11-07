# Reporte de prueba de respaldo · 2026-11-07

**Estado: BACKUP SYNTHETIC VERIFIED = PASS.** · BACKUP PREVIEW VERIFIED = **NOT TESTED** (requiere autorización del propietario) · BACKUP PRODUCTION VERIFIED = **NOT TESTED** (no existe producción).
Ninguno sustituye a otro.

## Contexto
| Dato | Valor |
|---|---|
| Origen | PostgreSQL 17.11 en contenedor local, base `vlux_synth` generada desde cero (`SYNTHETIC_DATABASE_SETUP.md`). **No** se tocó Supabase Preview con ningún respaldo |
| Commit | `c15afbc` + cambios de esta auditoría (`ops/backup-verify.sh`, `scripts/synthetic/`) |
| Procedimiento | `ops/backup-verify.sh` (el mismo que usa el workflow de `vlux-ops`) + cifrado igual al del workflow |
| Evidencia | `evidencia/simulacro-sintetico-2026-11-07.txt` |
| Origen real usado | Ninguno. El workflow de `vlux-ops` **no se ejecutó** (`workflow_dispatch` prohibido mientras `SUPABASE_BACKUP_URL` pueda apuntar a Preview) |

## Resultados (corrida reproducible de referencia)
| Paso | Resultado |
|---|---|
| `pg_dump` formato custom, solo `public` | PASS · 5.16 MB · ≈ 0.7 s (medido aparte); `backup-verify` completo (dump + restauración + 11 verificaciones) 2.3 s |
| SHA-256 del `.dump` | `cfde22d6…8ed` (corrida de referencia; cambia en cada corrida porque el contenido lleva marcas de tiempo del dump) |
| Cifrado GPG AES-256 simétrico | PASS · `.gpg` 4.99 MB · descifrado de ida y vuelta == hash del original |
| SHA-256 del `.gpg` verificado antes de restaurar | PASS (`vlux-…dump.gpg: OK`) |
| Conteos origen-antes / restaurada / origen-después (15 contadores) | PASS: idénticos |
| Saldo vs libro mayor | 0 tarjetas con diferencia |
| Premios disponibles duplicados | 0 |
| RLS en la copia | 0 tablas sin RLS |
| Permisos de `vlux_app` idénticos al origen | sí |
| Funciones ejecutables por PUBLIC (copia) | 0 |

## Pruebas negativas (el sistema detecta fallos)
| Caso inducido | Resultado esperado | Resultado |
|---|---|---|
| Saldo de una tarjeta alterado (+1) en una copia del origen | falla | **FALLA: libro mayor** (exit 1) PASS |
| `ROW LEVEL SECURITY` desactivado en `cards` | falla | **FALLA: RLS** (exit 1) PASS |
| `vlux_app` con `DELETE` extra en `cards` (deriva de permisos) | falla | **FALLA: permisos distintos al origen** PASS |
| Función con `EXECUTE` a PUBLIC en el **origen** | falla | **Antes: NO detectado** (la restauración lo revoca antes de medir). **Corregido** en esta auditoría: ahora `FALLA: el origen tiene funciones con EXECUTE a PUBLIC` PASS |
| `RESTORE_ADMIN_URL` hacia Supabase | rechazar | **Antes: no había guarda en `backup-verify.sh`** (sí en `restore-drill.sh`). **Corregido**: rechaza `*supabase.co*`/`*pooler.supabase.com*` PASS |
| Origen y destino en el mismo servidor | rechazar | **Corregido**: rechaza PASS |

## Qué NO prueba este reporte
- Que el respaldo de **Supabase Preview** funcione: nunca se ejecutó contra ese origen (Session Pooler, rol `postgres.<ref>`, SSL, tamaño real).
- Que el workflow de GitHub Actions corra de punta a punta (secretos, artefacto, aviso de falla). La lógica del cifrado/verificación se probó con los mismos comandos, fuera de Actions.
- Volumen real: 5 MB. La prueba anterior de 300 negocios (`evidencia/backup-verify-local.txt`) cubre carga y escritura concurrente.
- Durabilidad en el tiempo (artefactos a 30 días, GitHub como único almacén).

## Pasos para que el propietario autorice el primer respaldo REAL de Preview
Hasta no cumplirlos **no se ejecuta** el workflow. Ver `DATA_PROTECTION_PLAN.md` §4 (incluye la decisión legal previa).
