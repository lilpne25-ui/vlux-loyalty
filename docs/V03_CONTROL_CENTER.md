# VLUX Control Center (V0.3) · Instalación y uso

El Control Center (`/vlux-admin`) es la consola del equipo VLUX para dar de alta y administrar negocios sin tocar PostgreSQL ni ejecutar comandos.

## 1. Qué incluye
| Pantalla | Para qué |
| :- | :- |
| Resumen | Negocios (total, activos, piloto, suspendidos), clientes, tarjetas, compras, sellos y premios. Las cifras **reales** y las de **demostración** se ven por separado. También muestra la actividad reciente y el estado de la infraestructura. |
| Negocios | Directorio con nombre, giro, ciudad, dueño, plan, estado, alta, clientes y última actividad. Incluye búsqueda y filtros. |
| Ficha del negocio | Muestra el resumen y el QR de registro. Pestañas: **Acceso** (personal e invitaciones: crear, reenviar, revocar), **Suscripción** (manual), **Configuración** (programa y marca, solo lectura) y **Bitácora**. Permite editar el negocio y suspenderlo o reactivarlo. Suspender pide confirmación, motivo y escribir el nombre del negocio. |
| + Nuevo negocio | Asistente de 4 pasos: negocio → programa → plan → resumen. Una sola transacción crea el negocio, el programa, la suscripción y la invitación del dueño. |
| Planes | Precios de referencia (Piloto, Inicio, Crecimiento), editables. No hay cobros automáticos. |
| Equipo y sesiones | Administradores, invitación de nuevos administradores (enlace de 24 h), sesiones abiertas y cierre de sesiones. |
| Bitácora | Registro de todas las acciones del equipo VLUX. Solo agrega: no se edita ni se borra. |

Fuera del Control Center:
- `/invitacion#token`: el dueño o el empleado elige su contraseña. Si ya tiene cuenta, la vincula con su contraseña actual.
- Selector de negocio al iniciar sesión y en la barra superior.
- El dueño invita empleados por enlace, en la pestaña **Equipo** de su panel.

## 2. Variables de entorno
| Variable | Dónde | Valor |
| :- | :- | :- |
| `CONTROL_CENTER_ENABLED` | Solo el proyecto **interno** de Vercel | `1`. La demo pública no la lleva, así que ahí `/api/admin` responde 404. |
| `ADMIN_SECRETS_KEY` | Proyecto interno (sensible) | 32 o más caracteres aleatorios. Cifra los secretos TOTP y los códigos de recuperación. **Si cambia, todos los administradores deben volver a configurar su 2FA.** Es obligatoria en producción. |
| `PLATFORM_ADMIN_TOKEN` | Proyecto interno (sensible) | Código de instalación: sirve **una sola vez** para crear el primer administrador. |
| `PLATFORM_LEGACY_API` | Solo pruebas | `1` reactiva la API heredada `/api/platform/*` (token compartido). Está apagada por omisión. |

Estado del Preview interno al 2026-11-01:
- `CONTROL_CENTER_ENABLED=1` y `ADMIN_SECRETS_KEY` ya están configuradas.
- `PLATFORM_ADMIN_TOKEN` ya existía. Solo la conoce quien la creó; esta sesión no la lee.

## 3. Primer acceso (Vlux, una sola vez)
1. Vercel → proyecto `vlux-loyalty` → *Settings → Environment Variables* → `PLATFORM_ADMIN_TOKEN` (Preview). Si no tienes su valor, **rótalo**: pon una frase aleatoria de 40 o más caracteres y guárdala en tu gestor de contraseñas. Después vuelve a desplegar el Preview.
2. Abre `https://<preview interno>/vlux-admin`. La pantalla «Instalación del Control Center» aparece solo si todavía no hay administradores.
3. Escribe el código de instalación, tu nombre, tu correo y una contraseña de 12 o más caracteres.
4. Escanea el QR con tu app de autenticación (Google Authenticator, 1Password, Authy) y escribe el código de 6 dígitos.
5. Guarda los **8 códigos de recuperación**. Se muestran una sola vez.
6. Desde ese momento, la instalación queda cerrada. Los demás administradores entran por invitación: *Equipo y sesiones → Invitar administrador*.

## 4. Alta de un negocio (criterio de éxito de V0.3)
1. **+ Nuevo negocio** y completa los 4 pasos.
2. Copia el **enlace de invitación del dueño** o muestra su QR. **VLUX no envía correos**: entrégalo por WhatsApp directo o en persona. Sirve una sola vez y vence en 72 h.
3. El dueño abre el enlace, crea su contraseña y entra a su panel.
4. El dueño ajusta el programa en la pestaña **Programa**, imprime el QR en la pestaña **QR** e invita a su empleado en **Equipo**.
5. El cliente escanea el QR, crea su tarjeta y la caja registra la compra.
6. El dueño ve la operación en su Resumen y VLUX la ve en el directorio y en la ficha.

En ningún paso se toca PostgreSQL. El flujo completo se probó de punta a punta con navegador (`tests/e2e/v03-control-center.cjs`, escenarios A–J).

## 5. Reglas de operación
- **Suspender** corta el acceso del personal y apaga la página de registro. No borra datos y se puede revertir.
- **Estado comercial** (piloto, activo, vencido, suspendido o cancelado) es solo un registro. **Nunca apaga el servicio por sí solo**; para eso está «Suspender servicio».
- No existe borrado de negocios ni de datos desde el Control Center.
- Toda acción queda en la bitácora global y en la bitácora del negocio.

## 6. Correr en local
```bash
service postgresql start            # en el contenedor de desarrollo
npm run db:migrate                  # aplica 0006_control_center
npm run build:vercel
CONTROL_CENTER_ENABLED=1 PLATFORM_LEGACY_API=1 PORT=8788 PUBLIC_BASE_URL=http://localhost:8788 \
  node --env-file=.env scripts/preview-vercel-output.mjs
# Abre http://localhost:8788/vlux-admin
```
Pruebas:
```bash
npm test                                                        # unitarias + integración
E2E_RESET_ADMINS=1 BASE=http://localhost:8788 node --env-file=.env tests/e2e/v03-control-center.cjs
```
`E2E_RESET_ADMINS=1` vacía las tablas de administradores, y solo se permite contra una base en `127.0.0.1` o `localhost`.
