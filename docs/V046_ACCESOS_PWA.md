# V0.4.6 · Centro de accesos y PWA del dueño (P0 y P1)

## Qué problema resuelve
Antes, recuperar o compartir el acceso de un dueño dependía de copiar enlaces sueltos, y si la invitación ya se había usado no había forma clara de entregarle su panel. Instalar el panel en el teléfono tampoco era evidente.

## Centro de accesos (Control Center → Negocios → negocio → «Centro de accesos»)
| Sección | Qué muestra | Acciones |
|---|---|---|
| Acceso del propietario | Nombre, correo, estado de la cuenta (activa, debe cambiar contraseña, bloqueada temporalmente, acceso desactivado, deshabilitada), último acceso, estado de invitación | Copiar, compartir, QR y descarga del enlace permanente; restablecer contraseña con enlace seguro; invitar dueño (enlace o presencial); renovar o revocar invitación; enviar por correo si hay proveedor |
| Acceso de caja | Personal, estado, invitaciones pendientes, enlace permanente de caja | Invitar empleado (enlace o presencial), compartir/QR del enlace de caja, renovar o revocar |
| Acceso de clientes | Enlace público, QR (con descarga PNG), vista previa de la tarjeta | Copiar, compartir, descargar QR |

## Reglas de seguridad (implementadas y probadas)
| Regla | Cómo se cumple | Prueba |
|---|---|---|
| Enlace permanente sin credenciales | `/panel?negocio=<slug>`, `/caja?negocio=<slug>`, `/acceso?negocio=<slug>`: solo abren el inicio de sesión de ese negocio | T01 |
| No recuperar contraseñas | Solo enlace de restablecimiento de un solo uso (60 min) | T05 |
| No volver a mostrar tokens consumidos | Los tokens viven como hash; una invitación aceptada no se renueva (409) | T03 |
| Invitación pendiente o vencida → token nuevo | «Generar enlace nuevo» revoca la anterior | T02 |
| Dueño activado → enlace de acceso existente | El centro muestra «Compartir su enlace» (permanente) | T03, E2E A1 |
| Olvidó contraseña → recuperación segura | «Restablecer contraseña» (dueño o empleado) | T05 |
| Sin cuentas duplicadas | Invitar un correo que ya tiene acceso → 409 | T06 |
| Empleados nunca dueños | Las rutas de dueño responden 403 a empleados | T07 |
| Sin enlaces privados en bitácora ni analítica | La bitácora de «compartido» guarda solo el método; el respaldo excluye hashes | T06, E2E A5, regresión V0.4.5 |

## Entrega sin correo (F3)
- **A. Enlace temporal seguro**: copiar, compartir (hoja nativa del sistema si existe), revocar, renovar.
- **B. QR de invitación**: en pantalla y descargable.
- **C. WhatsApp**: abre `wa.me` con el mensaje preparado. La interfaz dice explícitamente que VLUX no puede confirmar que se envió; el administrador puede marcar «Ya lo envié» (queda en bitácora como `confirmed_sent`).
- **D. Activación presencial**: código de 10 caracteres sin letras ambiguas (≈49 bits), válido 30 minutos, de un solo uso, guardado como hash, con límite de 10 intentos por IP cada 15 minutos y un límite global. El Control Center detecta cuando el dueño activó su cuenta. No hay contraseñas por defecto compartidas: la persona crea la suya en su teléfono (`/activar`).

## PWA del dueño (P1)
- No se creó una segunda PWA: es la misma app con un manifiesto por negocio para el panel y otro para la caja (`id` y `start_url` con `?negocio=<slug>`), íconos propios (colores invertidos; la caja con doble anillo) y color del negocio.
- Al activar la cuenta el dueño ve la **bienvenida con 3 acciones**: Abrir mi panel · Instalar mi panel en este teléfono · Descargar el QR de mi negocio. Instalar es opcional.
- **Pantalla de instalación**: logo, nombre, ícono de la app, beneficios, instrucciones por dispositivo y confirmación cuando el navegador la reporta (`appinstalled` o modo standalone).
  - Android/Chrome: botón «Instalar ahora» si el navegador entrega `beforeinstallprompt`; si no, instrucciones del menú.
  - iPhone: siempre manual (Compartir → Agregar a pantalla de inicio). Nunca se promete instalación automática.
- **Sesión**: cookie HttpOnly de 12 horas; la app instalada no guarda contraseñas. En iPhone la app instalada tiene su propio almacenamiento de cookies: pide iniciar sesión una vez (se avisa en la pantalla).
- **Negocio correcto**: con `?negocio=` el inicio de sesión entra solo a ese negocio; si la sesión abierta es de otro negocio y la cuenta es miembro, se cambia; si no lo es, se muestra «Este acceso es de X» sin datos (BusinessGate). Probado en T08–T11 y E2E F1.
- Se quitó el botón «instalar caja» desde el panel del dueño: instalaba el manifiesto del panel (error real detectado). La caja se instala desde `/caja?negocio=`.

## Pendiente de validación en dispositivos físicos
Instalación real en iPhone y Android, ícono final en la pantalla de inicio y persistencia de sesión en la app instalada. Ver `V046_PRUEBAS.md`.
