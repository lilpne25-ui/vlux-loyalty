# Informe de seguridad · VLUX Loyalty V0.2

Alcance: backend (`server/`, `shared/`), migración `0001_init`, frontend en lo que toca a tokens. Revisión propia + revisión de solo lectura de un subagente revisor; los hallazgos se verificaron contra el código antes de corregir. Entorno: local, sin despliegue.

## Corregido en V0.2
| Riesgo en V0.1 / hallazgo | Control en V0.2 | Prueba |
| :- | :- | :- |
| El estado vivía en `localStorage` (editable por el cliente) | Servidor + PostgreSQL como única fuente de verdad; `localStorage` solo para "ya vi esta animación" | E2E 3 dispositivos |
| Sin autenticación | Personal: scrypt, sesión opaca en cookie HttpOnly (solo se guarda el hash SHA-256), bloqueo tras 5 fallos. Cliente: token de 256 bits en cookie HttpOnly + enlace personal | `auth.test.ts`, E2E 14e |
| Mezcla entre negocios | RLS con `app.business_id` por transacción, rol `vlux_app` NOBYPASSRLS, FK compuestas `(id, business_id)` | `schema.test.ts`, aislamiento en `loyalty.test.ts` |
| Doble sello / doble canje | Llave de idempotencia única, `FOR UPDATE`, índice único parcial de 1 recompensa disponible, guarda de duplicado 20 s | concurrencia en `loyalty.test.ts` |
| CSRF | Mutaciones solo JSON + verificación de `Origin`; cookies SameSite=Lax, Secure en producción | `auth.test.ts` |
| Fuerza bruta / abuso | Límite por IP en login, registro y token; IP de `x-forwarded-for` solo con `TRUST_PROXY=1` | prueba 429 |
| Cuerpos enormes | `bodyLimit` 16 KB | prueba 400 `body_too_large` |
| Fuga de datos en logs | El log de errores registra la ruta plantilla y `code/message`, no `/t/<token>` ni `err.detail` | revisión de código |
| Saldo insuficiente al canjear daba 500 | 409 `insufficient_balance` | revisión de código |
| `limit` negativo daba 500 | Acotado a 1..100 | revisión de código |
| Hashes o tokens en respuestas | Selects explícitos; prueba que ninguna respuesta incluye `hash` | `auth.test.ts` |
| Derechos ARCO | Exportar y anonimizar cliente (panel del dueño), con auditoría | `loyalty.test.ts` |
| Encabezados | CSP, `Referrer-Policy: no-referrer`, `Permissions-Policy: camera=(self)` | E2E |
| Dependencias | `npm audit`: 0 vulnerabilidades (2026-10-31) | — |
| Secretos | `.env` fuera de Git; escaneo sin secretos rastreados | — |

## Pendiente (no resuelto; prioridad)
| # | Riesgo | Sev. | Propuesta |
| :- | :- | :- | :- |
| 1 | Aviso de privacidad y contrato de encargado sin revisión legal (LFPDPPP) | Alta | Abogado antes de datos reales |
| 2 | Confirmar que producción conecte con `vlux_app` y no con el dueño del esquema (RLS no aplica al dueño) | Alta | Verificación al arrancar + `FORCE ROW LEVEL SECURITY` |
| 3 | HTTPS obligatorio en producción (cookies Secure, cámara) | Alta | Desplegar detrás de TLS |
| 4 | Respaldos y retención sin automatizar | Media | Respaldo diario del proveedor + prueba de restauración |
| 5 | El enlace personal del cliente dura 400 días y no se puede revocar; queda en el historial del navegador | Media | Rotación/revocación del token (V0.3) |
| 6 | Limitador de tasa en memoria (se pierde al reiniciar, no sirve con varias instancias) | Media | Mover a Postgres o Redis al escalar |
| 7 | El bloqueo de cuenta permite que un tercero bloquee al dueño 15 min; los mensajes `email_taken`/`account_locked` permiten enumerar correos | Baja-media | Backoff por IP + cuenta, mensajes genéricos |
| 8 | Un empleado puede sumar sellos de más confirmando duplicados | Baja | Tope diario por tarjeta, alertas en panel, anular compra |
| 9 | Sesiones sin expiración por inactividad ni limpieza de expiradas; cookie sin prefijo `__Host-` | Baja | V0.3 |
| 10 | Tablas globales (`businesses`, `staff_*`, `card_access_tokens`) sin RLS; dependen del filtro en código | Baja | Revisar al agregar consultas |
| 11 | `review_url` acepta cualquier `https://` | Baja | Restringir a dominios de Google |
| 12 | Sin recuperación de contraseña ni de tarjeta | Operativo | V0.3 |
| 13 | Fuentes de Google Fonts: petición externa con IP del visitante | Baja | Autohospedar fuentes |

No se declara cumplimiento legal completo.
