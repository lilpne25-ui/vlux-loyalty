# V0.4.6 · Correo propio con Stalwart (accesos@vlux.com.mx)

## Resultado de la auditoría: **BLOQUEADO** desde este entorno
No se pudo comprobar nada del servidor real. Hechos:
- Desde el contenedor de trabajo las consultas DNS públicas por HTTPS (dns.google) fueron rechazadas por el proxy de red (403). No hay acceso SSH, ni al panel de Stalwart, ni credenciales.
- El equipo de Vlux estaba enlazado al hilo pero sin carpetas conectadas; no se pidió acceso adicional solo para esto.
- Por lo tanto **no se asume** que `vlux.com.mx`, `accesos@vlux.com.mx` ni Stalwart existan o funcionen.

| Punto | Estado | Cómo comprobarlo |
|---|---|---|
| Instalación y estado de Stalwart | BLOQUEADO | En el servidor: `systemctl status stalwart-mail` o `docker ps` |
| Red, puertos 25/465/587/993 | BLOQUEADO | Script de auditoría (abajo) |
| TLS y certificado | BLOQUEADO | Script (valida cadena y nombre) |
| SPF, DKIM, DMARC, MTA-STS | BLOQUEADO | Script |
| rDNS (PTR) | BLOQUEADO | Script; el PTR lo configura el proveedor de la IP |
| Puerto 25 saliente / restricciones del ISP | BLOQUEADO | Script (prueba hacia gmail-smtp-in) |
| Reputación de la IP (listas negras) | BLOQUEADO | Script (Spamhaus, SpamCop, Barracuda) |
| Entrega en Gmail / Outlook | REQUIERE AUTORIZACIÓN | Enviar un correo de prueba real solo con autorización de Vlux |
| Rebotes | BLOQUEADO | Revisar buzón del remitente tras la prueba |
| Panel admin no expuesto | BLOQUEADO | Script (códigos HTTP de 443/8080) |

**Scripts de solo lectura** (no cambian configuración, no envían correos, no inician sesión):
- Linux/macOS: `bash scripts/stalwart-auditoria.sh vlux.com.mx mail.vlux.com.mx`
- Windows: `powershell -ExecutionPolicy Bypass -File scripts\stalwart-auditoria.ps1 -Domain vlux.com.mx -MailHost mail.vlux.com.mx`

Pega la salida en el hilo y se interpreta. Ejecútalo también desde **fuera** de la red del servidor: muchos ISP residenciales bloquean el puerto 25, y un servidor detrás de Tailscale no es alcanzable por Gmail.

## Riesgo principal (hipótesis, no comprobada)
Un servidor de correo propio en una IP residencial o sin rDNS correcto suele terminar en spam o rechazado por Gmail/Outlook, aunque SPF/DKIM/DMARC estén bien. Gmail exige SPF o DKIM, DMARC y PTR válido para remitentes de volumen. Para invitaciones de acceso (pocas, pero críticas) un correo en spam equivale a un acceso perdido.

## Adaptador implementado (IMPLEMENTADO y VERIFICADO localmente)
`EMAIL_PROVIDER=smtp` (alias `stalwart`) en `server/email/provider.ts`, con `nodemailer`:

| Variable | Ejemplo | Nota |
|---|---|---|
| `EMAIL_PROVIDER` | `stalwart` | |
| `SMTP_HOST` | `mail.vlux.com.mx` | |
| `SMTP_PORT` | `587` (STARTTLS) o `465` (TLS implícito) | En producción solo 465/587/2525 |
| `SMTP_USER` / `SMTP_PASSWORD` | cuenta de envío | Solo en variables de entorno de Vercel, nunca en el código |
| `EMAIL_FROM` | `VLUX Accesos <accesos@vlux.com.mx>` | |
| `SMTP_CA_PEM` | (opcional) CA propia en PEM | Para certificados propios; **nunca** se desactiva la verificación |
| `SMTP_TLS_SERVERNAME` | (opcional) | Si el certificado tiene otro nombre |

Garantías: TLS obligatorio (`requireTLS`, TLS ≥1.2, `rejectUnauthorized: true` fijo), sin acceso a archivos ni URLs desde el mensaje, Message-ID determinista por intento (`vlux-inv-<id>-<intento>@dominio`) porque SMTP no tiene llave de idempotencia, mismo outbox, estados, reintentos, auditoría y límites que Resend.

**Estados**: `pending` → `requested` → `accepted` (el servidor SMTP respondió 250) o `failed`. «Entregado» y «rebotado» **no se pueden saber por SMTP**: solo por los rebotes (DSN) que lleguen al buzón remitente; la interfaz nunca muestra «Entregado» con SMTP. Errores 4xx y caídas de red se marcan como reintentables; 5xx, fallas de TLS y de autenticación no.

Pruebas T14–T19 (`tests/integration/v046-email-smtp.test.ts`) con un servidor SMTP local, CA y certificados generados al vuelo: CA desconocida → rechazo; nombre distinto → rechazo; sin CA → rechazo; CA correcta + STARTTLS + AUTH → aceptado; 450 reintentable; 550 definitivo; servidor caído reintentable; flujo completo desde el Control Center con `provider = 'smtp'`, `status = 'accepted'`, `delivered_at = null`.

## Recomendación
1. Correr el script y decidir con datos. Si la IP tiene PTR correcto, el 25 saliente está abierto, no está en listas y SPF/DKIM/DMARC pasan, se puede usar Stalwart para `accesos@` con volumen bajo.
2. Si algo de lo anterior falla, **mantener la entrega manual** (enlace, QR, WhatsApp, código presencial: ya cubren el 100 % del flujo sin correo) y usar un proveedor transaccional barato con el dominio verificado. Ya existe el adaptador de Resend (plan gratuito: 3 000 correos/mes, 100/día; precio leído el 2026-11-06 en V0.4.5, verificar antes de contratar). **No se contrató nada.**
3. No crear buzones por negocio: un solo remitente `accesos@` con «Responder a» de soporte.
4. No exponer el panel de Stalwart a Internet: solo por Tailscale o VPN.
