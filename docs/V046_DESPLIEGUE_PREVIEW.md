# V0.4.6 · Despliegue en Preview y pruebas remotas

Fecha: 2026-11-07 · Rama `v0.4.6` · commit `338c9dc` · solo Preview (target staging). Sin merge a `main` ni Production. Migración 0014 aplicada por Vlux en Supabase Preview antes del despliegue.

## URLs
| Proyecto | Deployment | URL fija | Alias de rama |
|---|---|---|---|
| Interno (Control Center, tras Vercel SSO) | `dpl_9ru8sBzgzzuy7XVEt9tSYuPoAdzn` · READY | https://vlux-loyalty-btmnj7uw3-vlux-s-projects.vercel.app | https://vlux-loyalty-git-v046-vlux-s-projects.vercel.app |
| Público (demo) | `dpl_4V5HNUs8mxdNcAXCmNXXF9Vzr88X` · READY | https://vlux-loyalty-demo-ag01bdq6h-vlux-s-projects.vercel.app | https://vlux-loyalty-demo-git-v046-vlux-s-projects.vercel.app |

## Pruebas remotas (solo lectura; sin crear negocios, sin correos, sin avisos)
| # | Prueba | Resultado |
|---|---|---|
| R1 | `/api/health` en ambos | PASS 200 |
| R2 | `Permissions-Policy` con `geolocation=(self)` en API y HTML | PASS |
| R3 | `/api/public/push-config` sin llaves VAPID (ambos) | PASS `{"enabled":false,"publicKey":null}`: avisos apagados, la tarjeta lo explica |
| R4 | `/api/internal/notifications/run` sin `CRON_SECRET` | PASS 401 en ambos (no hay `CRON_SECRET` en Vercel: la ruta siempre rechaza) |
| R5 | Enlaces del dueño (`/public/businesses/:slug/access`) en el interno | PASS: base `https://vlux-loyalty-demo-vlux-s-projects.vercel.app` (PUBLIC_APP_URL), sin credenciales, nunca `localhost` |
| R6 | Mismo endpoint en el público | PASS: base = dominio del propio despliegue, sin `localhost` |
| R7 | Manifiesto del panel y de la caja de `cafe-demo-toluca` | PASS: `id`/`start_url` con `?negocio=`, íconos propios `/api/pwa/<slug>/icon/panel-*` y `caja-*`, rutas relativas (sin dominio fijo) |
| R8 | `/activar` (activación presencial) sirve la app | PASS 200 con CSP |
| R9 | Programa público con campo `location` nuevo | PASS (`location: null`, sin ubicación capturada) |
| R10 | El público no expone `/api/admin/*` | PASS 404 |
| R11 | `/api/public/demo` | PASS (habilitado, `vlux-demo`) |
| B1 | BD: 8 negocios intactos; 0 suscripciones, 0 avisos, 0 citas | PASS |
| B2 | BD: RLS activa en las 4 tablas nuevas; `vlux_app` solo SELECT/INSERT/UPDATE; 0 permisos a anon/authenticated/PUBLIC; `vlux_app` sin BYPASSRLS | PASS |
| B3 | Vercel: no existen `VAPID_*`, `CRON_SECRET`, `EMAIL_PROVIDER` ni `SMTP_*` | PASS: ningún envío real posible |
| B4 | `email_outbox`: 1 fila previa `pending` sin proveedor (no se envió) | Informativo |

## No ejecutado en remoto (requiere la cuenta de Vlux con 2FA o un teléfono)
Centro de accesos, código presencial de punta a punta, bienvenida e instalación, pestaña Comunicación. Están cubiertos localmente (E2E V0.4.6 27/27). Guía manual:
1. Control Center → negocio demo → **Centro de accesos**: copiar el enlace permanente del dueño; confirmar que no lleva token.
2. «Invitar dueño» → **Activación presencial**: anotar el código, abrir `/activar` en el teléfono, escribirlo y crear contraseña. El Control Center debe marcar «activado» solo.
3. En el teléfono: bienvenida → «Instalar mi panel». Android: instalar; iPhone: Compartir → Agregar a inicio. Revisar ícono y nombre.
4. Panel → pestaña **Comunicación**: debe decir que los avisos no están configurados y no dejar enviar promociones.
5. Abrir la tarjeta de un cliente demo → «Mis notificaciones»: debe decir «todavía no están disponibles».

## Historial de migraciones
`schema_migrations`: 0001–0008 y 0011–0014. **0009 y 0010 siguen sin registro** aunque sus estructuras existen. **No ejecutar `scripts/migrate.ts up` contra Preview** hasta pegar `vlux-loyalty-v045/0009-0010_registrar_historial.sql` (solo 2 filas de historial): de lo contrario intentaría re-aplicar 0009/0010.

## Regresiones sobre el commit desplegado (local, emulador de Vercel Output, 2026-11-07)
V0.2 29/29 · V0.2.1 14/14 · V0.2.2 40/40 · V0.3 24 PASS + 1 BLOCKED heredado (K) · V0.4 35/35 · V0.4.2 36/36 · V0.4.3 42/42 · V0.4.5 26/26 · V0.4.4 OK · **V0.4.6 27/27**. Unitarias 65/65, integración 141/141.
Las regresiones no se corren contra Preview: crean negocios y administradores, y la BD de Preview no debe recibir datos de prueba masivos.
