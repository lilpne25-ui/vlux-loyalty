# VLUX Loyalty 1.0.0-rc.1 · Funciones opcionales congeladas

Implementadas y probadas, pero **apagadas** hasta validarlas con un negocio real. Se controlan solo con variables de entorno del servidor (`server/features.ts`). No hay endpoint, parámetro, cookie ni pantalla que las active: una página pública no puede encenderlas.

| Función | Variable | En Vercel / producción | En local y pruebas | Además requiere |
|---|---|---|---|---|
| Avisos Web Push | `FEATURE_WEB_PUSH` | Apagada | Encendida | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET` |
| Campañas promocionales | `FEATURE_PROMOTIONS` | Apagada | Encendida | Web Push + aviso de privacidad aprobado (finalidad secundaria) |
| Recordatorios automáticos ("casi lo logras", "te extrañamos") | `FEATURE_AUTO_REMINDERS` | Apagada | Encendida | Web Push |
| Citas y recordatorios de cita | `FEATURE_APPOINTMENTS` | Apagada | Encendida | Web Push + revisión legal para giros de salud |
| Correo por SMTP propio (Stalwart) | `FEATURE_SMTP_EMAIL` | Apagada | Encendida | `EMAIL_PROVIDER=smtp` + `SMTP_*` + SPF/DKIM/DMARC |

Reglas: solo el valor exacto `1` enciende; `0` apaga en cualquier entorno; cualquier otro valor o ausencia = valor por omisión del entorno.

## Comportamiento con todo apagado (probado)
- Tarjeta, QR, alta del cliente, caja (compra, visita, servicio, puntos, canje), panel, empleados, invitaciones (se copian/comparten por enlace), Control Center: funcionan igual. E2E V0.2 29/29 y V0.4.5 26/26 con las cinco variables en `0` (`evidencia/e2e-funciones-congeladas.txt`).
- `/api/public/push-config` → `{"enabled":false}`: la tarjeta dice que los avisos aún no están disponibles.
- Crear promoción o cita → 409 `feature_disabled` ("Esta función todavía no está disponible en tu plan").
- Recordatorios y citas no se encolan aunque el negocio los haya marcado en su configuración.
- `EMAIL_PROVIDER=smtp` sin `FEATURE_SMTP_EMAIL=1` → correo "no configurado" (no sale nada).
- Resend y el modo `mock` no se tocaron (no son "SMTP propio"); en Vercel no hay `EMAIL_PROVIDER`, así que hoy no se envía ningún correo real.

## Para activar una función (cada una REQUIERE AUTORIZACIÓN de Vlux)
1. Cumplir los requisitos de la tabla (legal incluido).
2. Agregar la variable con valor `1` solo en el entorno que corresponda (primero Preview) y redesplegar.
3. Probar con un teléfono físico y un negocio sintético; registrar la evidencia.
4. Solo después, en producción y para el negocio piloto.
Pruebas: `tests/unit/features.test.ts`, `tests/integration/release-rc1.test.ts` (prueba 7).
