# V0.4.5 · Despliegue en Preview y pruebas remotas

Fecha: 2026-11-07 · Rama `v0.4.5` · commit `22cc1c1` · solo Preview (target staging). Sin merge a `main` ni Production.

## URLs

| Proyecto | Deployment | URL fija | Alias de rama |
|---|---|---|---|
| Interno (Control Center, tras Vercel SSO) | `dpl_7Fn1PVUkMJN7jAYHHEoDNNbXfXc6` · READY | https://vlux-loyalty-aiv4ouyu4-vlux-s-projects.vercel.app | https://vlux-loyalty-git-v045-vlux-s-projects.vercel.app |
| Público (demo) | `dpl_2Gbi7Do1xMgxF3NogD4Mw9WiW2kW` · READY | https://vlux-loyalty-demo-mvjlgna1f-vlux-s-projects.vercel.app | https://vlux-loyalty-demo-git-v045-vlux-s-projects.vercel.app |

## Pruebas remotas (solo lectura; sin borrar negocios ni enviar correos)

| # | Prueba | Resultado |
|---|---|---|
| R1 | `/api/health` en ambos proyectos | PASS (200 `{"ok":true}`) |
| R2 | Programa público de `cafe-demo-toluca` y `barberia-demo-metepec` con los campos del motor nuevo (`programType`, `eligibleServices`, `amountPerPointCents`, `maxAwardsPerDay`, `validUntil`, unidades) | PASS; ambos quedaron como `stamps_purchase` (comportamiento V0.4.4 intacto) |
| R3 | Mismo endpoint en el proyecto interno | PASS (respuesta idéntica) |
| R4 | El público no expone `/api/admin/*` | PASS (404) |
| R5 | `/api/admin/businesses`, `/email/status` y `deletion-preview` sin sesión en el interno | PASS (401) |
| R6 | `GET /api/webhooks/email` en el público | PASS (404; solo acepta POST firmado) |
| R7 | SPA del público sirve el bundle nuevo con CSP | PASS |
| R8 | `/api/public/demo` | PASS (habilitado, slug `vlux-demo`) |
| B1 | BD: 7 negocios intactos, 0 eliminaciones, 0 filas en `email_outbox` | PASS |
| B2 | BD: CHECK de 16 giros y de 5 tipos de programa; regla de puntos | PASS |
| B3 | BD: permisos de `vlux_app` en tablas nuevas (sin DELETE), `platform_purge_business` existe, `vlux_app` sin BYPASSRLS | PASS |
| B4 | Vercel: no existe `EMAIL_PROVIDER` en Preview → estado `not_configured`, envío real imposible | PASS |

## No ejecutado en remoto (requiere la cuenta de Vlux)

Alta de negocios con los 16 giros, editor de programa, invitaciones (envío simulado), archivar/restaurar y eliminación requieren login de administrador con 2FA de Vlux. Están cubiertos localmente (integración 120/120, E2E V0.4.5 26/26, T01–T40). Guía manual para Vlux: sección siguiente.

## Prueba manual sugerida para Vlux (15 min)

1. Control Center → Nuevo negocio: revisar que aparezcan los 16 giros; elegir Dentista (aviso de salud) y luego Barbería (programa por servicio). Crear como **demo**.
2. Enviar invitación: debe quedar "Sin proveedor de correo (no se envió nada)". Usar "Copiar enlace".
3. Panel del dueño → Primeros pasos y editor de programa.
4. Caja → registrar un servicio; tarjeta del cliente → "1 de N servicios".
5. Archivar ese negocio demo y, si quieres, eliminarlo (solo el que creaste).

## Historial de migraciones

`schema_migrations` tiene 0001–0008 y 0011–0013, pero no 0009/0010 aunque sus estructuras están completas. Script listo: `0009-0010_registrar_historial.sql` (solo inserta 2 filas con checksum; `ON CONFLICT DO NOTHING`; no toca esquema ni datos).
