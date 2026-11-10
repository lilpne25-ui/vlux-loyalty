# VLUX Loyalty 1.0.0-rc.1 · Rendimiento y escalabilidad

> Todo se midió **en local** (4 núcleos, PostgreSQL 16, un proceso Node con pool de 10) con datos sintéticos. **No** se hizo carga contra el Preview público ni contra Supabase. Supabase Preview pesa 13 MB y usa 18 de 60 conexiones.

## Método
1. BD local `vlux_load`: 300 negocios × 100 clientes (30,000 tarjetas), un tercio por programa (sellos por compra, por visita, puntos). `scripts/load/seed.ts`.
2. Carga realista por negocio (caja abre tarjeta y registra cada 4 s, panel del dueño sondea cada 8 s, un cliente abre su tarjeta cada 6 s). `scripts/load/run.mjs`.
3. `pg_stat_statements` para ver qué consultas consumen tiempo, y `EXPLAIN ANALYZE` de las sospechosas.
4. Para riesgos de crecimiento: **un negocio con un año de historial** (54,770 visitas y compras).

## Hallazgos y correcciones (medidos)
| # | Hallazgo | Antes | Después | Corrección |
|---|---|---|---|---|
| P1 | Serie diaria del tablero (sondeo cada 8 s): recorría todo el historial **una vez por cada día mostrado** (`(started_at AT TIME ZONE …)::date = d`, no usa índice) | 14 días: **803 ms**; 30 días: 1.8 s; 90 días: 5.1 s | 14 días: **22 ms**; 30: 25 ms; 90: 265 ms | Una pasada acotada por fecha (usa `(business_id, started_at)`). Resultado idéntico en 7/14/30/90 días (`evidencia/dashboard-series-antes-despues.txt`) + prueba de integración por zona horaria |
| P2 | Purga controlada de un negocio (Control Center): sin índice en llaves foráneas hijas, cada fila borrada revisa la tabla hija completa | **212 s** (supera el límite de 15 s de Vercel y mantiene bloqueos) | **1.5 s** | 12 índices de llaves foráneas en 0015 (solo los de la ruta de borrado) |

## Asesor de rendimiento de Supabase: decisión por hallazgo
- **31 llaves foráneas sin índice:** se indexan las 12 que la purga recorre (P2) — incluye `purchases(visit_id)`, `stamp_events(purchase_id/reward_id)`, `cards(customer_id)`, tokens, códigos y avisos. **No** se indexan las que apuntan a usuarios, administradores o planes (`created_by`, `voided_by`, `plan_code`, etc.): esas filas casi nunca se borran y el índice solo costaría escritura. Otras ya están cubiertas por índices con las mismas columnas en otro orden (p. ej. `notification_outbox (business_id, card_id, …)`), que el linter no reconoce.
- **9 índices "sin uso":** no se elimina ninguno. El contador de Preview casi no tiene tráfico; `purchases_card`, `stamp_events_card` y `purchases_card_awarded` sí se usan en las consultas por tarjeta con carga real, y los de correo/avisos/citas sirven funciones congeladas. Revisar después de 30 días de piloto con `pg_stat_user_indexes`.

## Escenarios (local, código del RC, 0 errores en todos)
| Negocios activos | Solicitudes | RPS | p50 ms | p95 ms | p99 ms | CPU servidor | Conexiones PG |
|---|---|---|---|---|---|---|---|
| 1 | 25 | 0.7 | 22.7 | 328* | 342* | 4 % | 3 |
| 10 | 244 | 6.6 | 11.4 | 21.0 | 286 | 6 % | 3 |
| 50 | 1,189 | 31.4 | 9.4 | 15.6 | 27.1 | 15 % | 6 |
| 100 | 2,389 | 62.2 | 8.3 | 15.2 | 33.1 | 21 % | 10 |
| 300 (línea base V0.4.6) | 21,291 | 215.5 | 7.6 | 25.7 | 131.2 | 35 % (máx 67 %) | 12 |
| **300 (RC)** | 21,381 | 216.7 | 7.6 | **18.4** | **40.7** | 34 % (máx 66 %) | 11 |
\* Con 1 negocio hay tan pocas solicitudes que el p95 lo marca el arranque en frío (primeras consultas). 1–100 corrieron 30 s; 300 corrió 90 s. Por tipo: registrar compra p95 22.5 ms, tablero 18.4 ms, tarjeta del cliente 17.9 ms (`evidencia/carga-*.txt|json`).

Lectura: 300 negocios en horario pico simultáneo son ~217 solicitudes/s; un piloto de 1–2 negocios genera < 1/s.

## Revisión del resto
| Tema | Estado |
|---|---|
| N+1 | No se encontraron en rutas calientes (`pg_stat_statements`: cada solicitud hace un número fijo de consultas) |
| Paginación | Actividad y clientes con `LIMIT`; exportación de un negocio es completa a propósito (respaldo previo a eliminar, con límite de frecuencia) |
| Connection pooling | Supavisor (puerto 6543, modo transacción) + `PG_POOL_MAX=3` por instancia de Vercel. Supabase Preview reporta `max_connections = 60` (18 en uso); el límite del pooler depende del tamaño de cómputo y se revisa al crear producción |
| Sesiones | Validación por hash con índice único; sesiones vencidas no se purgan automáticamente (crecimiento lento; tarea de limpieza en el backlog) |
| Rate limits | 1 `INSERT … ON CONFLICT` por solicitud protegida; limpieza aleatoria (1 %) de llaves vencidas |
| Almacenamiento | ~3.5 KB por cliente + ~2.6 KB por operación (modelo V0.4.5). 300 negocios × 300 clientes × 3 ops/mes ≈ 2.3 GB/año: cabe en los 8 GB de Supabase Pro |
| Cola de avisos | Congelada; presupuesto de 11 s por ejecución medido en V0.4.6 (~125 avisos/s). Falta purga de `notification_outbox` antes de activarla |
| Historial de operaciones | Crece sin límite (bitácoras de solo inserción, a propósito). Los KPIs del tablero cuentan todo el historial: **58 ms** con un año de un negocio muy activo. Aceptable para el piloto; antes de GA conviene contadores agregados |
| JIT de PostgreSQL | En consultas mal estimadas agrega ~250 ms de compilación; P1 lo evita. Si aparece en producción, `ALTER ROLE vlux_app SET jit = off` |

## Lo que NO se probó (requiere infraestructura o aprobación)
- Latencia real Vercel (iad1) ↔ Supabase (us-east-1) bajo carga y desde México: estimado +60–120 ms por solicitud, **no medido**.
- Carga sostenida en Supabase Micro/Small: requiere un proyecto de pago aislado (≈ USD 10–25 por unas horas). Experimento propuesto en `GO_NO_GO.md`; **no se ejecutó sin aprobación**.
