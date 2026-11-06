# V0.4.5 · Pruebas de carga (entorno local controlado)

**Alcance:** las pruebas corrieron solo contra un servidor local y la BD local `vlux_load`, con datos sintéticos. Los scripts se niegan a apuntar a otro host o a otra base. No se tocó el Preview público ni ninguna base con datos reales.

## Cómo reproducir

```bash
# 1) BD local desechable
sed 's#/vlux_test#/vlux_load#' .env.test > .env.load      # o copia tu .env cambiando la base a vlux_load
node --env-file=.env.load --import tsx scripts/db-setup-local.ts
node --env-file=.env.load --import tsx scripts/migrate.ts up
# 2) 100 negocios × 300 clientes (≈25 s); un tercio sellos por compra, un tercio por visita, un tercio puntos
node --env-file=.env.load --import tsx scripts/load/seed.ts 100 300 fx-d.json
# 3) servidor (un proceso, pool de 10 conexiones)
node --env-file=.env.load --import tsx server/index.ts &
# 4) carga
set -a; . ./.env.load; set +a
node scripts/load/run.mjs --fixture fx-d.json --businesses 100 --seconds 60 --op-interval 4000 --server-pid <PID> --out nominal.json
```

**Qué simula:** cada negocio tiene tres actores trabajando en paralelo.

| Actor | Qué hace | Frecuencia |
|---|---|---|
| Caja | Abre una tarjeta al azar y registra una operación con su llave de idempotencia; en los programas de puntos manda un monto | Una vez cada `op-interval` ms (con variación aleatoria) |
| Panel del dueño | Consulta el tablero | Cada `dash-interval` ms |
| Clientes | Abren su tarjeta | Cada `customer-interval` ms |

**Qué mide:**
- Latencia p50, p95 y p99 por tipo de solicitud.
- Errores y RPS.
- CPU y memoria del proceso servidor (desde `/proc`; 100 % equivale a un núcleo).
- Conexiones activas a PostgreSQL.

## Resultados (2026-11-06, máquina de 4 núcleos y 16 GB, PostgreSQL 16 local)

| Corrida | Parámetros (ms) | RPS | p50 | p95 | p99 | Máx | Errores | CPU servidor | RSS | Conexiones PG |
|---|---|---|---|---|---|---|---|---|---|---|
| Nominal | op 4000 · panel 8000 · cliente 6000 | 69.7 | 5.1 | 7.9 | 11.9 | 47 | 0 | 9–11 % | 131 MB | 8 |
| Estrés | op 1200 · panel 2000 · cliente 1500 | 271.6 | 6.1 | 33.9 | 170.7 | 546 | 0 | 26–30 % | 139 MB | 11 |
| Saturación | op 1200 · panel 1000 · cliente 400 | 482.9 | 17.7 | 52.0 | 76.7 | 154 | 0 | 42–44 % | 140 MB | 12 |

Todas las latencias están en ms. Los resultados completos por tipo de solicitud están en `docs/evidencia/load-d-*.json`.

Por tipo de solicitud en la corrida de saturación:

| Tipo de solicitud | p95 (ms) |
|---|---|
| Registrar operación | 55 |
| Tablero del dueño | 53.5 |
| Tarjeta del cliente | 54 |
| Caja abre una tarjeta | 32 |

## Relación con los escenarios de costo

- **Pico estimado del escenario E (300 negocios, actividad alta):**
  - El modelo da ~21 M solicitudes/mes, o sea ~8 RPS de promedio.
  - Si la hora pico concentra 4× el promedio, son ~35 RPS.
  - La corrida nominal (70 RPS) ya equivale al doble de ese pico.
  - La de saturación, que siguió sin errores, equivale a ~14×.
- **Tope de 60 compras por minuto por sesión de caja:** está fijado en `server/app.ts`, así que la prueba no puede generar más que eso por negocio. Eso es intencional: es el mismo límite que protege al negocio en producción.

## Lo que esta prueba NO demuestra

- **No mide la latencia de red** entre la región de Vercel y la de Supabase (normalmente unos pocos ms por consulta en la misma región, y mucho más entre regiones).
- **No reproduce el arranque en frío** de las funciones ni la multiplicación de instancias. Cada instancia en Vercel abre un pool de 3 conexiones.
- **No mide un Supabase Micro** (1 GB de RAM, 200 conexiones al pooler).
- **No incluye un año de historial.** La base de carga tiene 12,781 compras, no los ~720,000 al mes del escenario E alta.

Por eso la conclusión es la de `V045_COSTOS_ESCALABILIDAD.md` §6: **la capacidad para 300 negocios queda sin comprobar** hasta repetir esta misma prueba contra un proyecto Supabase de pruebas con el cómputo que se vaya a contratar. Eso requiere autorización, porque es un servicio de pago.
