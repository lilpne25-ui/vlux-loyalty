# Acceso sin cuenta de Vercel · V0.2.2 (Átomo 01)

## Problema
El Preview interno (`vlux-loyalty`) tiene **Vercel Authentication en todos los despliegues** (`ssoProtection: all`). Un cliente de una cafetería no tiene cuenta de Vercel, así que al abrir el enlace ve el inicio de sesión de Vercel y no su tarjeta. No es un error de VLUX: es la protección del proyecto.

Hay tres accesos distintos y no deben mezclarse:

| Quién | Autenticación que le corresponde | ¿Necesita Vercel? |
| :- | :- | :- |
| Cliente (tarjeta) | Ninguna. Cookie HttpOnly de su tarjeta, enlace personal o código de vinculación | No |
| Personal y dueño | Usuario y contraseña de VLUX (sesión HttpOnly, roles en servidor) | No |
| Administración de plataforma (VLUX) | `PLATFORM_ADMIN_TOKEN` | No, y no debe existir en entornos públicos |
| Equipo técnico (despliegues internos) | Vercel Authentication | Sí |

## Opciones evaluadas
| Opción | Qué hace | Costo | Por qué sí o no |
| :- | :- | :- | :- |
| Quitar Vercel Authentication del proyecto interno | Todo queda público | 0 | **Descartada.** Expone el entorno interno y su token de administración. Requiere autorización explícita y no se hizo. |
| Shareable Link | Enlace con token que salta la protección | 0 (Hobby: 1 enlace por cuenta) | Temporal, ligado a un despliegue y el token viaja en la URL. Útil para una revisión, **no** como acceso definitivo de clientes. |
| Protection Bypass for Automation | Encabezado secreto `x-vercel-protection-bypass` | 0 | Solo para pruebas automáticas. Nunca en el código ni en el navegador del cliente. |
| Password Protection | Contraseña común en Vercel | Solo en Pro (20 USD/mes) | Descartada: costo recurrente y otra contraseña para el cliente. |
| Excepciones de protección por ruta | Abrir solo `/n/*` | Ver documentación de Vercel | No se usó: el cliente también necesita `/api/*`, `/assets/*`, `/sw.js` y el manifiesto; la excepción terminaría abriendo casi todo el proyecto interno. |
| **Proyecto demo público aparte** | Proyecto Vercel distinto, sin protección, sin token de administración y con datos sintéticos | 0 en Hobby | **Elegida por Vlux (2026-10-31).** El proyecto interno sigue protegido sin cambios. |

## Lo que se aplicó (cambio exacto de exposición)
- Proyecto nuevo **`vlux-loyalty-demo`** (`prj_jGgwKOO4Dc1XReDAtoEVVwar0y0E`, equipo `vlux-s-projects`).
  - `ssoProtection: null`, `passwordProtection: null`, sin dominio propio.
  - Variables solo en *Preview*: `DATABASE_URL` (rol `vlux_app`, sin privilegios de dueño, marcada *sensitive*), `DATABASE_SSL`, `PG_POOL_MAX=3`, `NODE_ENV=production`, `PRIVACY_NOTICE_VERSION`. **Sin `PLATFORM_ADMIN_TOKEN`**: en la demo no se pueden crear negocios.
  - Production bloqueado con *Ignored Build Step* (`VERCEL_ENV=production` → cancela). Evidencia: el primer despliegue (`dpl_BcBNZ224TP2PN8rPwdz1UMiKpAbp`) Vercel lo marcó como production por ser el primero del proyecto y quedó **CANCELED** por esa regla.
- Proyecto interno **`vlux-loyalty`**: sin cambios de protección (`ssoProtection: all`). Verificado por HTTPS: responde 302 al inicio de sesión de Vercel (H2).
- Base de datos: la demo usa la base del Preview (`vlux-loyalty-preview`), que **solo tiene datos sintéticos**. Supabase Free permite 2 proyectos activos y ya están ocupados, así que no hay una tercera base sin pausar otra. **Regla: nunca cargar datos reales en esta base mientras la demo sea pública.**

## URLs (Preview, no Production)
| Proyecto | URL del despliegue | Commit | Acceso |
| :- | :- | :- | :- |
| Demo pública | https://vlux-loyalty-demo-kk0lzkh1v-vlux-s-projects.vercel.app | e7a88c2 | Sin login de Vercel |
| Demo (alias de rama) | https://vlux-loyalty-demo-git-v022-vlux-s-projects.vercel.app | rama v0.2.2 | Sin login de Vercel |
| Interno | https://vlux-loyalty-pd07bzoge-vlux-s-projects.vercel.app | e7a88c2 | Con login de Vercel |

Tarjeta del negocio demo: `/n/cafe-demo-toluca`. Caja: `/caja`. Panel: `/panel` (cuentas demo `dueno@cafe-demo.vlux.test` y `caja@cafe-demo.vlux.test`; la contraseña no se publica aquí).

## Riesgos de la demo pública y mitigación
- Cualquiera con la URL puede crear tarjetas sintéticas: hay límite por IP (20 registros por hora) y los datos son de prueba.
- Las cuentas demo de personal deben tener contraseña larga y cambiarse si se comparte la demo con terceros.
- Si en el futuro se cargan datos reales, la demo debe moverse a otra base o apagarse. Cambiar esto es una decisión de Vlux.

## Para revertir
Vercel → `vlux-loyalty-demo` → *Settings → Deployment Protection* → activar Vercel Authentication, o eliminar el proyecto. No afecta al proyecto interno ni a la base.

## Escenario A/B/C por HTTPS (procedimiento reproducible)
Lo que ya se verificó por HTTPS (sin credenciales): `docs/evidencia/v022-https-demo-vercel.txt`, 15/15 PASS.
Lo pendiente necesita la contraseña de las cuentas demo dentro del entorno de prueba. Dos formas:
0. **Antes:** GitHub solo permite lanzar a mano (o programar) un workflow que exista en la rama principal. Hoy `main` no tiene la carpeta `.github/workflows`, así que primero hay que fusionar `v0.2.2` en `main` (pull request).
1. **GitHub Actions (recomendado):** agregar en *Settings → Secrets and variables → Actions* los secretos `DEMO_OWNER_EMAIL`, `DEMO_EMP_EMAIL` y `DEMO_STAFF_PASSWORD` (no hace falta `VERCEL_AUTOMATION_BYPASS_SECRET` para la demo pública). Luego *Actions → PWA en navegadores → Run workflow* con `base_url` = URL de la demo y `slug` = `cafe-demo-toluca`.
2. **Desde una computadora:** `npm install --no-save playwright@1.63.0 && npx playwright install chromium`, luego
   `BASE=<url demo> SLUG=cafe-demo-toluca OWNER_EMAIL=dueno@cafe-demo.vlux.test EMP_EMAIL=caja@cafe-demo.vlux.test STAFF_PASSWORD=<contraseña> node tests/e2e/v022-pwa.cjs`
