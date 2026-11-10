# V0.4.6 · Costos de avisos y correo propio

Fecha: 2026-11-07. Se separa **medido**, **precio oficial** e **hipótesis**. Base de costos fijos: `docs/V045_COSTOS_ESCALABILIDAD.md` (Supabase Pro + Vercel Pro ≈ 45 USD/mes, sin cambios).

## 1. Conclusión corta
- **V0.4.6 casi no agrega costo de infraestructura**: los servicios push de los navegadores no cobran por mensaje, el cifrado cuesta ~0.2 ms de CPU por aviso y el almacenamiento de 300 negocios cabe de sobra en los 8 GB de Supabase Pro.
- Lo que sí cambia: **los recordatorios programados (regreso, citas) necesitan una tarea que corra al menos cada hora.** Vercel Hobby solo permite una vez al día (y no es para uso comercial). Con Vercel Pro (ya supuesto en V0.4.5) o con un cron externo gratuito que llame la ruta protegida, se resuelve.
- **Pendiente técnico real**: la cola de avisos crece ~86 MB/mes con 300 negocios si no se purga. Falta una purga por antigüedad (propuesta para V0.4.7: conservar 90 días, y 400 días los de «te extrañamos» para no repetirlos).
- Correo propio (Stalwart): costo de software 0; el costo real es el servidor, la IP con buena reputación y el tiempo de operación. No se puede cuantificar sin la auditoría (BLOQUEADA).

## 2. Medición local (PostgreSQL 16 en el contenedor, servicio push simulado con 40 ms de latencia)
`node --env-file=.env.test --import tsx scripts/bench-notificaciones-v046.ts N 300 40` — cada tarjeta con 1 dispositivo suscrito y 1 aviso en cola. Salida completa en `docs/evidencia/costos-v046/bench-50-100-300.txt`.

| Negocios × clientes | Avisos | Enviados | Tiempo total | Avisos/s | Ejecuciones (presupuesto 50 s) |
|---|---|---|---|---|---|
| 10 × 300 | 3,000 | 3,000 | 24.5 s | 122 | 3 |
| 50 × 300 | 15,000 | 15,000 | 120 s | 125 | 3 |
| 100 × 300 | 30,000 | 30,000 | 236 s | 127 | 6 |
| 300 × 300 | 89,990 | 89,990 | 709 s | 127 | 15 |

- 0 pendientes y 0 duplicados en todos los casos. El ritmo es estable (~125 avisos/s por ejecución, 6 negocios × 8 dispositivos en paralelo); escala lineal con el número de avisos.
- CPU de cifrado + firma VAPID: **0.22 ms por aviso** (medido, 2,000 repeticiones).
- Almacenamiento con índices: **~0.7–0.8 KB por suscripción y ~0.7–0.8 KB por aviso** (10×300 limpio: 2.1 MB / 3,000 y 2.5 MB / 3,000; 300×300: 71 MB y 62 MB para ~90,000 cada uno).
- **Límite de la función**: Vercel corta la API a los 15 s (`maxDuration`). Por eso la tarea usa 11 s por omisión (`NOTIFICATION_JOB_BUDGET_MS`, máx. 14 s): ≈ **1,300 avisos por ejecución**. Lo que no alcanza queda en cola para la siguiente.
- No medido: latencia real de FCM/Apple desde Vercel, ni Supabase real (60 conexiones en Micro). El envío usa una conexión por negocio a la vez, así que no compite por conexiones con la caja.

## 3. Proyección mensual (hipótesis: 40 % de clientes activa avisos, 3 avisos por suscriptor al mes)
| Negocios | Suscripciones | Avisos/mes | CPU/mes (≈1 ms/aviso con red y BD, hipótesis) | Crecimiento BD/mes (avisos) | Suscripciones en BD | Costo push |
|---|---|---|---|---|---|---|
| 10 | 1,200 | 3,600 | ~4 s | ~3 MB | ~1 MB | 0 |
| 50 | 6,000 | 18,000 | ~18 s | ~14 MB | ~5 MB | 0 |
| 100 | 12,000 | 36,000 | ~36 s | ~29 MB | ~10 MB | 0 |
| 300 | 36,000 | 108,000 | ~2 min | ~86 MB | ~29 MB | 0 |

Con Vercel Pro (CPU activa 0.128 USD/h, precio leído el 2026-11-06), 2 min de CPU al mes son < 0.01 USD. Ejecuciones de la tarea cada hora: 720/mes (0.60 USD por millón de invocaciones → despreciable). Capacidad con tarea horaria: ~31,000 avisos/día, muy por arriba de los ~3,600/día del escenario de 300 negocios. **Con tarea diaria (Hobby) solo ~1,300 avisos programados por día**: insuficiente desde ~100 negocios; los avisos de recompensa y progreso no dependen de la tarea (salen al registrar la compra).

## 4. Precios y hechos oficiales usados
- Servicios push: Firebase Cloud Messaging aparece como producto **sin costo** en firebase.google.com/pricing; Apple y Mozilla no publican cobro por Web Push. No hay contrato ni límite publicado por volumen para estos niveles.
- Vercel Cron: Hobby una vez al día (±59 min), Pro hasta cada minuto (vercel.com/docs/cron-jobs/usage-and-pricing, leído el 2026-11-07).
- Supabase Pro: 8 GB de disco incluidos; excedente 0.125 USD/GB (leído el 2026-11-06, V0.4.5).
**Verificar precios el día que se decida el plan.**

## 5. Correo: Stalwart vs proveedor transaccional
| Opción | Costo directo | Costo oculto | Riesgo |
|---|---|---|---|
| Stalwart propio | Software libre; servidor existente (si ya existe) | IP con PTR, reputación, monitoreo de listas negras, parches, rebotes | Spam / rechazo en Gmail y Outlook si la IP o el DNS no están bien |
| Resend (adaptador ya existe) | Free 3,000/mes (100/día); Pro 20 USD/mes | Dominio verificado (SPF/DKIM) | Bajo |
| Sin correo (link, QR, WhatsApp, código presencial) | 0 | Tiempo del equipo al entregar accesos | Ninguno técnico: ya cubre el 100 % del flujo |

Recomendación: con menos de 50 negocios, la entrega sin correo + Resend Free basta. Stalwart solo si la auditoría sale limpia.
