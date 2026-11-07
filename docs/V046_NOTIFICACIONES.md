# V0.4.6 · VLUX NOTIFICATION ENGINE (Web Push con consentimiento)

## Qué es y qué NO es
- Notificaciones estándar del navegador: Push API + Notifications API + service worker + VAPID (RFC 8292), contenido cifrado de extremo a extremo (RFC 8291, `aes128gcm`). Implementación propia con `node:crypto`, sin Firebase SDK ni dependencias nuevas en producción.
- **No es «sin servicios externos»**: la entrega la hace el servicio push del navegador del cliente (Google FCM para Chrome/Android/Edge en Android, Mozilla para Firefox, Apple para Safari e iPhone, Microsoft WNS para Edge en Windows). Esos servicios no cobran por mensaje (FCM aparece como producto sin costo en firebase.google.com/pricing), pero son terceros: ven a qué dispositivo va un mensaje, no su contenido (cifrado).
- Multi-negocio: cada suscripción pertenece a una tarjeta de UN negocio (RLS). Un negocio no puede enviar a clientes de otro (T24).

## Compatibilidad real (verificada en documentación oficial el 2026-11-07)
| Plataforma | Estado | Fuente |
|---|---|---|
| Chrome / Edge / Firefox (Android y escritorio) | Soportado | MDN: Push API «Baseline: ampliamente disponible desde marzo de 2023» |
| Safari en macOS | Soportado | MDN (Baseline) |
| iPhone / iPad | **Solo desde la app agregada a la pantalla de inicio**, iOS/iPadOS 16.4 o posterior. El permiso debe pedirse tras un toque del usuario | webkit.org/blog/13878 |
| iPhone en una pestaña de Safari (sin instalar) | No documentado como soportado: la app lo trata como no disponible y explica agregar a inicio primero | webkit.org/blog/13878 |
| Declarative Web Push (iOS 18.4+) | No usado: el Push API clásico sigue funcionando y es compatible | webkit.org/blog/16535 |

**No se probó en dispositivos físicos.** Pendiente de validación: recibir un aviso real en Android (Chrome) y en iPhone (app instalada).

## Flujo del cliente («Mis notificaciones», en su tarjeta)
1. Sección cerrada por omisión debajo de «Guardar en mi teléfono». La tarjeta sigue siendo lo principal.
2. Al abrirla: explicación + categorías (Recompensas activada; Recordatorios y Promociones desactivadas por omisión).
3. Solo al tocar «Activar avisos» el teléfono pide permiso. Nunca al cargar (E2E E1).
4. Indicador del permiso del teléfono: permitidas / bloqueadas / sin decidir / no disponibles.
5. Si el permiso está bloqueado: no se vuelve a pedir; se explica cómo cambiarlo en ajustes.
6. iPhone sin instalar: se explica agregar a la pantalla de inicio primero (E2E E5).
7. Puede cambiar categorías o «Desactivar todas» en cualquier momento.

## Avisos (F6)
| Aviso | Categoría | Cuándo | Texto (sin datos personales) |
|---|---|---|---|
| A. Recompensa lista | Recompensas | Al desbloquear una recompensa | «{Negocio}: recompensa lista» / «Ya tienes tu recompensa: {recompensa}…» |
| B. Casi lo logras | Recordatorios | Cuando faltan N visitas (1–3, configurable) | «Te falta 1 visita para tu recompensa…» |
| C. Te extrañamos | Recordatorios | Tras 14–180 días sin visita (configurable), **una sola vez por ausencia** | «{Negocio} te extraña» |
| D. Cita | Recordatorios | Solo citas confirmadas registradas por el negocio; 20–28 h antes (tarea cada hora) o 12–36 h (tarea diaria) | «Te esperamos mañana a las 10:30» |
| Promoción | Promociones | Solo si el dueño la envía y solo a quien eligió Promociones; máximo 2 cada 30 días por negocio | Título y texto del dueño |

Citas: no es una agenda médica. La tabla `appointments` solo guarda tarjeta, fecha/hora, estado y origen (manual o integración futura con `external_ref`). No hay columnas de motivo, servicio, diagnóstico ni notas (T27). Nada se infiere.

## Límites y protección (F8)
- Deduplicación por llave única por negocio (`reward:<id>`, `progress:<tarjeta>:<ciclo>:<faltan>`, `return:<tarjeta>:<última visita>`, `appt:<id>`).
- Horas de silencio por negocio (21:00–09:00 por omisión, hora del centro de México): el aviso se pospone, no se pierde.
- Máximo semanal de recordatorios por tarjeta (1–3, 2 por omisión); los de recompensa no cuentan.
- Caducidad por aviso (recompensa 72 h, progreso 48 h, regreso 72 h, cita 10 h, promoción 48 h) y TTL en el servicio push.
- Reintentos: 429/5xx → hasta 3 intentos con espera; 404/410 → la suscripción se desactiva sola; 10 fallas seguidas → se desactiva.
- Lista de servicios push permitidos (evita que el servidor haga solicitudes a direcciones arbitrarias).
- Límite de solicitudes: 30/h por tarjeta en rutas de suscripción, 5/h de promociones por negocio.
- Bitácora: suscripción, cambios y bajas con categorías y plataforma; nunca endpoint ni llaves.
- Anonimizar un cliente desactiva sus suscripciones, cancela citas y omite avisos en cola.
- El dueño solo ve números agregados; nunca endpoints ni quién vio qué. «Aceptado por el servicio push» no significa «visto».

## Envío
- Recompensa / progreso: se encolan en la misma transacción de la compra y se envían justo después del commit (máximo 2.5 s; si no alcanza, quedan en cola). Un fallo de push nunca afecta a la caja.
- Programados (regreso, citas, reintentos, pospuestos): `GET /api/internal/notifications/run` con `Authorization: Bearer $CRON_SECRET` (≥32 caracteres).
- **Vercel Cron**: en Hobby solo una vez al día (precisión ±59 min); en Pro hasta cada minuto (vercel.com/docs/cron-jobs/usage-and-pricing). Con Hobby: `NOTIFICATION_JOB_INTERVAL_HOURS=24`. Alternativa sin costo: un programador externo (por ejemplo un cron en el servidor de VLUX) que llame la ruta cada hora. Capacidad medida: ~125 avisos/s por ejecución (ver `V046_COSTOS.md`). Pendiente V0.4.7: purga de la cola por antigüedad. **No se configuró ningún cron**: requiere autorización y solo correría en Production.

## Configuración (variables de entorno)
| Variable | Uso |
|---|---|
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Generar con `node --import tsx -e "import('./server/push/webpush.ts').then(m=>console.log(m.generateVapidKeys()))"`. La privada solo en Vercel (Sensitive). Si faltan o no corresponden, el push queda apagado y la app lo dice |
| `VAPID_SUBJECT` | `mailto:accesos@vlux.com.mx` o una URL https |
| `CRON_SECRET` | Protege la tarea programada |
| `NOTIFICATION_JOB_INTERVAL_HOURS` | 1 (por omisión) o 24 con Vercel Hobby |
| `NOTIFICATION_JOB_BUDGET_MS` | 2000–14000, por omisión 11000 (la función corta a los 15 s). ≈1,300 avisos por ejecución |

## Pruebas
- Unitarias (U-PUSH-1…9): el cifrado se valida en ambos sentidos contra `http_ece` (implementación de referencia de M. Thomson, coautor de RFC 8188/8291); JWT VAPID verificado con la llave pública; lista de servicios; horas de silencio; ventana de citas.
- Integración T20–T27 con servicio push simulado y descifrado real de cada mensaje.
- Nota honesta: el vector de prueba del Apéndice A del RFC 8291 no pudo descargarse completo en este entorno; la validación cruzada con la implementación de referencia lo sustituye.
