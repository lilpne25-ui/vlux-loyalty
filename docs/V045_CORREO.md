# V0.4.5 · Invitaciones por correo

**Estado: implementado con proveedor simulado. El envío real está BLOCKED.** No hay API key, dominio verificado ni registros DNS. **Nunca se envió un correo real a terceros.**

## Elección del proveedor

| Opción | A favor | En contra | Decisión |
|---|---|---|---|
| **Resend** | API simple, `Idempotency-Key` (24 h), webhooks firmados (Svix), plan gratuito de 3,000/mes y 100/día | Exige verificar un dominio | **Elegido**; adaptador listo |
| SMTP propio (Google Workspace, etc.) | Sin proveedor nuevo | Sin estados de entrega ni webhooks, límites de envío, peor entregabilidad | No |
| Amazon SES | Muy barato a volumen | Salir del modo sandbox requiere trámite; más configuración | Alternativa futura |

El código está aislado detrás de `EmailProvider` (`server/email/provider.ts`), así que cambiar de proveedor es escribir un adaptador nuevo.

## Flujo

1. **Al crear la invitación** (alta del negocio o equipo), en la misma transacción se crea su fila en `email_outbox` con el **token cifrado** (AES-256-GCM, llave del servidor). Ese token se borra al aceptar, revocar o reemplazar la invitación.
2. **"Enviar invitación"** reserva el envío en una transacción **confirmada antes** de hablar con el proveedor (envío después del commit) y luego llama a la API.
   - Usa una llave de idempotencia por intento: `vlux-inv-<outbox>-<intento>`.
   - Los límites son 3 envíos aceptados por invitación, 60 s entre envíos, 30 por hora por administrador y 20 por día por negocio.
3. **Reenviar** usa **el mismo enlace**: no crea otra invitación.
4. **Webhook** `POST /api/webhooks/email`:
   - verifica la firma Svix (`svix-id`, `svix-timestamp`, `svix-signature`) con tolerancia de 5 min;
   - es idempotente por `svix-id`;
   - un aviso de "entregado" nunca pisa "rebotado" ni "spam".

## Estados que ve VLUX

| Estado interno | Etiqueta |
|---|---|
| `pending` | Pendiente de envío |
| `requested` | Envío solicitado |
| `accepted` | **Aceptado por el proveedor** (todavía no confirma que llegó) |
| `delivered` | Entregado (solo con webhook firmado) |
| `failed` | Fallido |
| `bounced` | Rebotado |
| `complained` | Marcado como spam |
| `not_configured` | Sin proveedor de correo (no se envió nada) |

Los estados **Invitación aceptada** e **Invitación vencida** salen de la invitación misma (`staff_invitations`).

## Plantilla

Está en `server/email/templates.ts` y lleva:
- el logotipo oficial de VLUX;
- el nombre del negocio y el de la persona invitada;
- el botón **Activar mi cuenta**;
- la fecha de vencimiento (hora del centro de México);
- los datos de soporte;
- el texto "nunca te enviaremos tu contraseña por correo".

Va en versión HTML con estilos en línea y en versión de texto plano. **Nunca lleva contraseñas.**

## Para activar el envío real (requiere autorización de Vlux)

1. **Dominio:** usa un subdominio dedicado, por ejemplo `notificaciones.<dominio>.mx`, para no afectar el correo del dominio principal.
2. **Resend:** crea la cuenta en el plan gratuito, agrega el dominio y copia los registros DNS.
3. **DNS:**
   - **SPF:** el `TXT` que indica Resend en el subdominio de envío (`include:` de su infraestructura). Solo puede existir **un** registro SPF por nombre.
   - **DKIM:** los registros `TXT` o `CNAME` de la llave pública que da Resend.
   - **DMARC:** `_dmarc.<dominio>` `TXT` `v=DMARC1; p=none; rua=mailto:dmarc@<dominio>`. Empezar en `p=none`, revisar reportes y subir a `quarantine` o `reject`.
   - **MX de rebote / Return-Path:** el que indique Resend.
4. **Webhook:** en Resend, apunta un endpoint a `https://<dominio-preview>/api/webhooks/email` con los eventos `email.sent`, `delivered`, `bounced`, `complained`, `failed` y `delivery_delayed`.
5. **Vercel**, primero solo en **Preview**:
   - `EMAIL_PROVIDER=resend`
   - `RESEND_API_KEY`
   - `EMAIL_FROM="VLUX Loyalty <invitaciones@notificaciones.<dominio>.mx>"`
   - `EMAIL_REPLY_TO`
   - `EMAIL_WEBHOOK_SECRET`
   - Los secretos se capturan en Vercel, nunca en el chat.
6. **Prueba controlada:** una invitación a un buzón propio de VLUX. Verificar el estado **Entregado** con el webhook y revisar los encabezados (SPF, DKIM y DMARC en `pass`).

## Pruebas

- Integración: T10–T17 en `tests/integration/v045-email.test.ts`; la firma válida, la inválida y la repetición se prueban en T12–T13.
- E2E: T33–T34, con proveedor simulado.
