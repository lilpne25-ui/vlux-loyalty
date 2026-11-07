# Reporte de prueba de restauración · 2026-11-07

**Estado: restauración sintética = PASS** (BACKUP SYNTHETIC VERIFIED). Preview y producción: **NOT TESTED**.

## Tiempos (volumen sintético 5 MB; ver límites)
| Fase | Tiempo |
|---|---:|
| Descifrado + `pg_restore` (restore-drill) | 1 s |
| Verificaciones post-restauración | 1 s |
| **RTO del procedimiento, desde archivo cifrado** | **≈ 2–3 s** |
| Corrida completa de referencia (levantar 2 contenedores, migrar, sembrar, respaldar, cifrar, restaurar, probar la app) | 18 s |
El RTO real incluye además: localizar el artefacto, obtener la frase, crear un servidor destino y repuntar la app. Eso no se midió y domina el tiempo: **estimar en horas, no segundos**, hasta ensayarlo.
**RPO** con el diseño actual: hasta 24 h (respaldo diario) si `BACKUP_SCHEDULE=on`; hoy es **indefinido** (no hay respaldo).

## Integridad de lo restaurado
| Comprobación | Resultado |
|---|---|
| Hash por tabla (md5 de todas las filas ordenadas), 34 tablas, origen vs restaurada | **idéntico 34/34** |
| Conteos: 10 negocios · 3 000 clientes · 3 000 tarjetas · 32 945 compras · 34 838 eventos · 2 848 recompensas | idénticos |
| Catálogo: 112 índices · 9 funciones · 17 disparadores · 36 políticas RLS · 224 restricciones | idénticos |
| Saldo vs historial | 0 diferencias |
| FK sin validar | 0 |
| RLS 34/34, `vlux_app` NOBYPASSRLS, 0 funciones a PUBLIC | PASS |
| Última migración | `0015_release_hardening` (15) |

## Prueba funcional con la aplicación real (`restore-functional-check.ts`) · 13/13 PASS
Con `buildApp()` conectada a la **copia restaurada** como `vlux_app`:
1. Dueño sintético 1 inicia sesión y ve su panel; su lista tiene exactamente sus 300 clientes.
2. Identifica una tarjeta suya, registra una compra nueva: +1 en la base, saldo = libro mayor en las 3 000 tarjetas.
3. Dueño sintético 2 (otro negocio): no ve clientes del 1; `lookup`, `GET tarjeta`, `compra` y `export de cliente` sobre datos del 1 → **HTTP 404**; ninguna escritura cruzada; el selector solo muestra su negocio.

## Pruebas negativas de la restauración
| Caso | Resultado |
|---|---|
| Frase incorrecta | `gpg: decryption failed`, exit 2 |
| Archivo `.gpg` con 1 byte alterado | `FAILED` en SHA-256, exit 1 |
| Destino Supabase | `Rechazado`, exit 1 |

## Hallazgos
1. `restore-drill.sh` **omite** la verificación SHA-256 si falta el `.sha256` ("se omite"). Debería fallar cerrado cuando se usa en un simulacro real. Sin corregir (cambia el comportamiento documentado); recomendado.
2. Un `.gpg` manipulado sin su `.sha256` solo lo detiene el control de integridad interno de GPG; con el `.sha256` se detecta antes. Mantener siempre ambos archivos.
3. La restauración deja `vlux_app` como `NOLOGIN` y necesita `ALTER ROLE … LOGIN` para conectar la app: está documentado en `BACKUP_RECOVERY.md`; en una recuperación real hay que repuntar `DATABASE_URL`.

## Límites
5 MB; PostgreSQL estándar, no Supabase; sin pruebas de restauración en un proyecto Supabase nuevo (el camino real de recuperación). Tampoco se restauraron `auth`/`storage` (la app no los usa).
