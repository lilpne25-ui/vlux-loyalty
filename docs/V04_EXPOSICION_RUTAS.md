# VLUX Loyalty V0.4 · Exposición de rutas: público vs interno

## Hallazgo (verificado)
El proyecto interno `vlux-loyalty` tiene la protección SSO de Vercel activa en todos sus despliegues. Todo lo que cuelga de él, incluidas las pantallas de cliente, caja y dueño, pide iniciar sesión en Vercel. Un cliente de un café no puede usar esos enlaces.

## Decisión
| Proyecto | Protección Vercel | Qué sirve | Quién entra |
|---|---|---|---|
| `vlux-loyalty-demo` (público) | Apagada | Cliente `/n/:slug`, tarjeta, caja `/caja`, dueño `/panel`, acceso `/acceso`, PWA, logo, manifiestos | Clientes, cajeros y dueños. Cada rol se autentica en la propia app (cookies HttpOnly, rol validado en el servidor) |
| `vlux-loyalty` (interno) | Encendida | Centro de control `/vlux-admin` (admin con contraseña + 2FA) | Solo el equipo VLUX, además del login de Vercel |

Los enlaces que generan el asistente de alta, el Centro de accesos y las invitaciones usan la variable `PUBLIC_APP_URL` (ya configurada en Preview del proyecto interno con el alias del proyecto público). Las invitaciones de administrador siguen apuntando al origen interno.

## Rutas públicas por diseño
`/n/:slug`, `/acceso`, `/caja`, `/panel` (pantalla; los datos exigen sesión), `/api/public/businesses/:slug` y `/logo`, `/api/pwa/*`. Solo devuelven información que el negocio ya muestra al cliente. El endpoint `/access` publica únicamente direcciones, nunca secretos.

## Rutas que NO deben ser públicas
`/vlux-admin/*`, `/api/admin/*` y `/api/platform/*`. El proyecto público arranca sin el Centro de control.

## Riesgos y condiciones
1. El proyecto público comparte la base de datos de Preview con el interno y con datos sintéticos. **Antes de cualquier dato real hay que separar base y proyecto de producción** (decisión de Vlux, fuera de V0.4).
2. Exponer el público no cambia la visibilidad del repositorio.
3. Limitación de tasa y cookies HttpOnly siguen activas. Pruebas: escenario Q de `tests/e2e/v04-premium.cjs`.
4. Producción no se tocó.
