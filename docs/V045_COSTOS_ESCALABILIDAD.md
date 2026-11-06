# V0.4.5 · Costos y escalabilidad

Fecha: 2026-11-06. Lo que sigue separa **hechos medidos**, **precios oficiales** e **hipótesis**. Los números de costo salen de un modelo reproducible: `python3 scripts/costos-v045.py` (y `--csv carpeta/` para la hoja de cálculo). Los CSV de esta versión están en `docs/evidencia/costos-v045/`.

## 1. Conclusión corta

- **El costo de infraestructura es casi fijo hasta ~100 negocios.** Por arriba de 300 negocios, los precios por uso todavía pesan poco. El piso es **Supabase Pro + Vercel Pro ≈ 45 USD/mes ≈ 830 MXN/mes** (con tipo de cambio de 18.5, que es una hipótesis).
- **Punto de equilibrio en infraestructura: 3 negocios a $299 o 2 negocios a $499.** En el escenario E (300 negocios con actividad alta) sube a 8 y 5 negocios.
- **Margen bruto de infraestructura** desde 10 negocios: 72 % con $299 y 83 % con $499. Desde 50 negocios ya supera el 94 % con $299.
  - **Ojo:** este margen no incluye soporte, ventas, impuestos, comisiones de cobro, el dominio, la cuenta de Apple Developer ni el tiempo del equipo. En un SaaS pequeño esos costos son los que dominan.
- **Planes gratuitos:** no sirven para un servicio comercial.
  - Vercel Hobby es solo para uso no comercial.
  - Supabase Free pausa el proyecto tras una semana sin actividad y no tiene respaldos diarios.
- **El sondeo automático genera ~70–78 % de las solicitudes** en todos los escenarios: el panel del dueño consulta cada 8 s y la caja también refresca de forma periódica. Es la primera palanca de optimización si algún día hace falta. Hoy no hace falta: la sensibilidad de abajo muestra que cuadruplicarlo sube el costo solo 19 % en el escenario más grande.
- **"Soporta 300 negocios" NO está demostrado.**
  - La prueba de carga local con 100 negocios × 300 clientes aguantó ~480 solicitudes/s sin errores. Eso es varias veces el pico estimado del escenario E.
  - Pero se corrió en una máquina local con PostgreSQL en el mismo equipo, sin la latencia de red Vercel ↔ Supabase y sin el límite de conexiones del plan Micro.
  - La validación pendiente está en §6.

## 2. Precios oficiales (leídos el 2026-11-06)

| Servicio | Plan | Precio | Incluye / unidades |
|---|---|---|---|
| Supabase | Free | 0 | 500 MB de BD, 5 GB de egress, se pausa tras 1 semana sin actividad, sin respaldos diarios |
| Supabase | Pro | 25 USD/mes | 10 USD de crédito de cómputo (cubre Micro), 8 GB de disco, 250 GB de egress, respaldos diarios (7 días) |
| Supabase | Cómputo | Micro 10 · Small 15 · Medium 60 · Large 110 USD/mes | 1/2/4/8 GB de RAM; conexiones directas/pooler: 60/200 · 90/400 · 120/600 · 160/800 |
| Supabase | Excedentes | disco 0.125 USD/GB · egress 0.09 USD/GB | |
| Vercel | Hobby | 0 | **Solo uso no comercial** |
| Vercel | Pro | 20 USD por asiento al mes | Incluye 20 USD de uso. CPU activa 0.128 USD/h, memoria 0.0106 USD/GB-h, invocaciones 0.60 USD/millón (región iad1) |
| Resend | Free | 0 | 3,000 correos al mes, 100 al día, 1 webhook |
| Resend | Pro | 20 USD/mes | 50,000 correos; 0.90 USD por cada 1,000 adicionales |

Fuentes: supabase.com/pricing y la documentación de cómputo y disco de Supabase; vercel.com/pricing y su FAQ de Hobby; resend.com/pricing y la documentación de la API (idempotencia y webhooks). **Los precios cambian: verifícalos el día que se decida el plan.**

## 3. Medición real de la BD (Supabase Preview, 2026-11-06)

- 13 MB en total. Los datos de la app son ~1.7 MB; el resto es sobrecarga del sistema.
- Contenido: 7 negocios, 9 clientes, 1 compra y 24 eventos de auditoría.
- PostgreSQL 17.11, `max_connections` = 60.
- Base local de carga (`vlux_load`): 100 negocios, 30,100 clientes y 12,781 compras, en **63 MB**. Con eso se calibró el supuesto de bytes por cliente y por operación.

## 4. Escenarios (salida del modelo)

En todos los escenarios cada negocio tiene 300 clientes. La actividad de cada cliente se supone así (hipótesis):

| Actividad | Operaciones por cliente al mes |
|---|---|
| Baja | 1 |
| Media | 3 |
| Alta | 8 |

| Escenario | Actividad | Negocios | Clientes | Solicitudes/mes | % sondeo | Cómputo BD | BD a 12 meses (MB) | Vercel USD | Supabase USD | Correo USD | Total MXN/mes | MXN por negocio | Margen $299 | Margen $499 | Equilibrio $299 | Equilibrio $499 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A | baja | 1 | 300 | 12,150 | 78 % | Micro | 23 | 20 | 25 | 0 | 832 | 832 | −178 % | −67 % | 3 | 2 |
| A | alta | 1 | 300 | 70,650 | 69 % | Micro | 88 | 20 | 25 | 0 | 832 | 832 | −178 % | −67 % | 3 | 2 |
| B | baja | 10 | 3,000 | 121,500 | 78 % | Micro | 120 | 20 | 25 | 0 | 832 | 83 | 72 % | 83 % | 3 | 2 |
| B | alta | 10 | 3,000 | 706,500 | 69 % | Micro | 775 | 20 | 25 | 0 | 832 | 83 | 72 % | 83 % | 3 | 2 |
| C | media | 50 | 15,000 | 1.64 M | 75 % | Micro | 1,489 | 20 | 25 | 0 | 832 | 17 | 94 % | 97 % | 3 | 2 |
| C | alta | 50 | 15,000 | 3.53 M | 69 % | Micro | 3,829 | 20 | 25 | 0 | 832 | 17 | 94 % | 97 % | 3 | 2 |
| D | media | 100 | 30,000 | 3.29 M | 75 % | Small | 2,965 | 20 | 30 | 0 | 925 | 9 | 97 % | 98 % | 4 | 2 |
| D | alta | 100 | 30,000 | 7.07 M | 69 % | Small | 7,645 | 20 | 30 | 0 | 925 | 9 | 97 % | 98 % | 4 | 2 |
| E | baja | 300 | 90,000 | 3.65 M | 78 % | Medium | 3,255 | 20 | 75 | 20 | 2,128 | 7 | 98 % | 99 % | 8 | 5 |
| E | alta | 300 | 90,000 | 21.2 M | 69 % | Medium | 22,911 | 27.4 | 76.9 | 20 | 2,298 | 8 | 97 % | 99 % | 8 | 5 |

La tabla completa, con las 15 combinaciones, está en `docs/evidencia/costos-v045/v045_costos_escenarios.csv`.

Cómo leerla:
- **El escalón de cómputo de la BD es una regla conservadora, no una medición:** Micro hasta 50 negocios, Small hasta 120 y Medium arriba de eso. La prueba de carga en Supabase de §6 es la que lo confirma o lo corrige.
- **El correo pasa a Resend Pro (20 USD) en el escenario E.** No es por volumen mensual: es porque el plan gratuito permite 100 correos al día y una mañana de altas masivas lo rebasa. Un negocio genera unos 4 correos al mes (invitaciones y reenvíos).
- **El escenario E alta rebasa el disco incluido en Supabase en el primer año** (~23 GB a 12 meses). El costo extra es de unos 2 USD/mes por disco. Antes de llegar ahí conviene una política de retención (§5).

### Sensibilidad (escenario E, actividad alta; base 2,298 MXN/mes)

| Supuesto | Total MXN/mes | Cambio |
|---|---|---|
| Tipo de cambio 21 MXN/USD | 2,609 | +13.5 % |
| CPU por solicitud ×3 (36 ms) | 2,633 | +14.6 % |
| Duración por solicitud ×3 (270 ms) | 2,506 | +9.1 % |
| Solicitudes por operación ×2 | 2,453 | +6.7 % |
| Sondeo del panel ×4 (cada 2 s) | 2,734 | +19.0 % |

Ningún supuesto razonable cambia la conclusión. El riesgo de costo real no está en la infraestructura: está en **cuántos negocios pagan** y en **cuánto soporte necesita cada uno**.

## 5. Ineficiencias revisadas (sin optimización a ciegas)

| Hallazgo | Impacto medido o estimado | Decisión |
|---|---|---|
| El panel del dueño sondea el tablero cada 8 s y la caja también refresca. Ya se pausa con la pestaña oculta (`usePolling`). | ~70 % de las solicitudes del modelo, pero solo +19 % de costo aun cuadruplicado. | **Sin cambio en V0.4.5.** Si el costo lo justifica, subir el tablero a 20–30 s; las E2E dependen de que se actualice pronto. |
| El límite de frecuencia (rate limit) hace un UPSERT en `rate_limits` en cada escritura y en varias lecturas. | Una escritura extra en la BD por solicitud protegida. En la prueba local no se notó (p95 < 60 ms a 480 RPS). | Sin cambio. Medirlo en Supabase (§6). Redis queda **descartado sin medición**, como pide la regla. |
| Limpieza de llaves de rate limit vencidas: probabilística (1 % de las solicitudes). | Despreciable. | Sin cambio. |
| Sesiones vencidas (`staff_sessions`) y borradores de activación vencidos se acumulan. | Pocos KB por negocio al mes. | Documentado. Una tarea de limpieza programada es un pendiente menor, para antes de los 100 negocios. |
| Historial (`purchases`, `stamp_events`, `audit_events`) crece sin retención. | ~2.6 KB por operación; ~23 GB a 12 meses en E alta. | No se borra nada: es auditoría. Para antes de E: particionar o archivar por año. Requiere decisión legal sobre retención. |
| `listCustomers` usa subconsultas por tarjeta y las estadísticas del Control Center llaman una función por negocio (N+1). | Con 100 negocios el directorio sigue respondiendo en local. | Revisar con `EXPLAIN ANALYZE` sobre la base de 300 negocios antes del escenario E. |
| Una BD por negocio. | | **Descartado.** Ya existe aislamiento por RLS y no hay necesidad medida. |
| Microservicios o Kafka. | | **Descartado.** No hay ninguna medición que lo justifique. |

## 6. Lo que falta para afirmar capacidad en producción

1. **Repetir `scripts/load/run.mjs` contra un proyecto Supabase de pruebas con datos sintéticos.**
   - No usar el Preview público ni bases con datos reales.
   - Usar el mismo cómputo que se piensa contratar (Micro o Small), con el servidor en la región de la BD.
   - Requiere autorización: un proyecto Pro adicional cuesta dinero.
2. **Medir conexiones del pooler** con `PG_POOL_MAX=3` (el valor que usa Vercel) y muchas instancias en paralelo.
3. **Cargar historial de 12 meses** en la base de carga y medir el tablero del dueño y el directorio del Control Center.

Mientras eso no exista, la afirmación correcta es esta:

> "El diseño y una prueba local soportan holgadamente el volumen estimado de 100 negocios; 300 negocios no se ha comprobado en la infraestructura real".
