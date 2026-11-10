# V0.4.2 · Acceso público, demostración y navegación

## Dos proyectos, dos políticas
| Proyecto | Para qué | Protección Vercel | Control Center |
|---|---|---|---|
| `vlux-loyalty-demo` (público) | Portada, estudio, cliente, caja y dueño de demostración | Sin login de Vercel | **Apagado** (`/api/admin/*` responde 404) |
| `vlux-loyalty` (interno) | Control Center del equipo | Vercel Authentication | Encendido |

Los dos comparten la base de **Preview** (Supabase) con datos sintéticos. `PUBLIC_APP_URL` del interno apunta al alias público, así los enlaces generados (cliente, caja, panel, invitaciones, instalación PWA) usan el origen público.

## Mapa de la experiencia pública
- `/` portada comercial: hero con tarjeta metálica, tres acabados vivos, cómo funciona, negocio, **demostración guiada** (5 pasos con estado local), accesos a experiencias, solicitud de demostración y preguntas frecuentes.
- `/personalizar` Estudio de marca público: logo → colores → acabado → tarjeta → teléfono → sellos y premio. **Datos temporales en el navegador**: no sube nada, no crea negocios (la prueba E2E verifica cero escrituras a la API).
- `/n/vlux-demo` experiencia del cliente (negocio sintético neutro «VLUX Demo»).
- Caja y dueño: botones «Entrar como caja/dueño» → `POST /api/public/demo/session`.
- `/acceso` acceso de negocios reales (login con contraseña propia). `/vlux-admin` solo en el proyecto interno.
- Rutas heredadas `/n/cafe-demo-toluca` y `/n/barberia-demo-metepec`: redirigen a `/` con un aviso. Sus filas siguen en la base (datos sintéticos, `is_demo = true`); **no se borró nada**.

## Mecanismo de sesión de demostración (sin contraseñas publicadas)
- Solo existe con `DEMO_ACCESS=1` (únicamente en el proyecto público). Sin la variable responde 404.
- Abre sesión solo para las cuentas reservadas `dueno@` y `caja@demo.vlux.invalid` del negocio `is_demo` `vlux-demo`. Esas cuentas tienen una contraseña aleatoria que nadie conoce; no sirven en `/acceso`.
- Sesión de **2 horas**, cookie HttpOnly, límite de 30 aperturas por IP cada 15 min, auditoría `demo.session`.
- La sesión de demostración no puede: cambiar contraseña, crear/activar empleados, invitar, emitir enlaces de reinicio, editar el programa, exportar/anonimizar clientes, ni cambiar a otro negocio. Sí puede registrar compras, canjear y anular compras (para la historia comercial).
- Los datos de demostración son compartidos entre visitantes: pueden verse compras de otras personas que prueben a la vez. Es un entorno ficticio; ver «Siguiente».

## Contacto comercial
La sección «Solicitar demostración» usa `VITE_CONTACT_URL` (mailto: o https:// de WhatsApp), definido en el proyecto al compilar. **No está configurado**: Vlux debe indicar el medio. Mientras tanto el botón lleva al Estudio y se muestra «Medio de contacto por confirmar».
