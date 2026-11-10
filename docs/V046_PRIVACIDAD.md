# V0.4.6 · Privacidad y seguridad

## Datos nuevos que se guardan
| Dato | Dónde | Para qué | Se puede borrar |
|---|---|---|---|
| Suscripción push (endpoint + llaves del navegador) | `push_subscriptions`, por tarjeta y negocio, con RLS | Enviar avisos que el cliente eligió | Sí: el cliente la desactiva; 404/410 la desactiva; anonimizar la desactiva. **No** va en respaldos |
| Categorías elegidas | misma tabla | Respetar la elección | Sí |
| Citas | `appointments`: tarjeta, fecha/hora, estado, origen | Recordatorio genérico | Sí (cancelar / anonimizar). Sin motivo, servicio ni notas |
| Cola de avisos | `notification_outbox`: tipo, título, texto, estado | Deduplicar, reintentar, contar | Caducan; textos sin datos personales |
| Ubicación pública del NEGOCIO | `businesses.latitude/longitude` | «¿Estoy cerca?» | Sí |
| Ubicación del cliente | **No se guarda ni se envía** | — | — |
| Hash del código presencial | `invitations.access_code_hash` | Activación en persona | Excluido de respaldos |

## Controles
- Consentimiento explícito por categoría; Promociones desactivada por omisión; nunca se pide permiso al cargar.
- Textos de aviso sin nombre del cliente, sin montos, sin datos de salud.
- Bitácora sin endpoints, llaves ni enlaces privados; el dueño solo ve cifras agregadas.
- `Permissions-Policy: geolocation=(self)`; lista de servicios push permitidos; límites de frecuencia.
- Contenido push cifrado de extremo a extremo (RFC 8291): el servicio push no lo puede leer.

## PENDIENTE DE VALIDACIÓN LEGAL (no lo decide el software)
1. Actualizar el aviso de privacidad (LFPDPPP) para mencionar: avisos push y su proveedor técnico (servicio push del navegador: Google, Apple, Mozilla, Microsoft), finalidad secundaria de **promociones** con mecanismo para negarse, y que la ubicación se procesa solo en el teléfono.
2. Citas: confirmar con un abogado que un consultorio (dentista, clínica) puede registrar solo fecha/hora sin que se considere dato sensible; la app no guarda nada clínico, pero el **giro** del negocio podría revelar información de salud en el título del aviso («Clínica X: tu cita es mañana»). Recomendación: permitir que el negocio use un nombre neutro en avisos antes de usarlo con consultorios.
3. Promociones por push: revisar si aplica algún registro o restricción de publicidad (PROFECO / REPEP) para mensajes publicitarios a consumidores.
4. Responsabilidad de encargado vs responsable entre VLUX y cada negocio en el contrato de servicio.

## REQUIERE AUTORIZACIÓN
Llaves VAPID y `CRON_SECRET` en Vercel; tarea programada; primer envío real; uso de Stalwart para correos reales.
