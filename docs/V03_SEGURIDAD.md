# Informe de seguridad · V0.3 (Control Center)

Fecha: 2026-11-01 · Rama `v0.3` · Revisión independiente: subagente `msa-lud-dev`, en modo de solo lectura, sobre el diff `v0.2.2..HEAD`.

## 1. Modelo de acceso
| Actor | Identidad | Sesión | Puede |
| :- | :- | :- | :- |
| Equipo VLUX | `platform_admins` (separada del personal) | Cookie `vlx_admin`: HttpOnly, SameSite=Strict, path `/api/admin`. Vence a las 8 h, o a los 30 min sin actividad. Revocable. | Usar el Control Center, siempre con 2FA |
| Dueño | `staff_users` + membresía OWNER | Cookie `vlx_staff`, con la membresía revalidada en cada solicitud | Solo su negocio (RLS + servidor) |
| Empleado | membresía EMPLOYEE | Igual | Solo la caja de su negocio |
| Cliente | Token de tarjeta (cookie por negocio) | — | Solo su tarjeta |

- El personal de un negocio no entra al Control Center (prueba E2E J3/J4 y prueba de integración).
- La demo pública no tiene `CONTROL_CENTER_ENABLED`: ahí `/api/admin` responde 404.

## 2. Controles del Control Center
- **Contraseña.** scrypt, con 12 caracteres como mínimo.
- **2FA obligatorio.** TOTP RFC 6238 con ventana de ±1 paso.
  - Anti-replay: `totp_last_step`.
  - Secreto cifrado con AES-256-GCM, usando una llave derivada (HKDF) de `ADMIN_SECRETS_KEY`.
  - Una sesión previa (10 min) solo permite completar el segundo factor. Al verificarlo se emite un token **nuevo** y se revoca el anterior.
- **Códigos de recuperación.** Son 8, de un solo uso, guardados como HMAC con llave del servidor.
- **Bloqueos.**
  - 5 contraseñas incorrectas o 5 códigos incorrectos bloquean la cuenta 15 min.
  - El contador del 2FA es propio: volver a iniciar sesión no lo reinicia.
  - Al bloquearse se revocan todas las sesiones previas.
  - Límites por IP y por administrador.
- **Sin enumeración de correos.** Una contraseña incorrecta siempre responde 401, esté la cuenta bloqueada o no.
- **Instalación.** El primer administrador requiere `PLATFORM_ADMIN_TOKEN`:
  - Se compara por hash en tiempo constante.
  - Funciona una sola vez, con candado de transacción.
  - El token no se guarda en el navegador.
- **Bitácora global** `platform_audit_events`: solo agrega (un trigger impide UPDATE y DELETE). Nunca guarda contraseñas, tokens ni códigos.
- **API heredada** `/api/platform/*` (token compartido): apagada por omisión (`PLATFORM_LEGACY_API`).

## 3. Invitaciones
- Token aleatorio de 256 bits.
  - Viaja en el fragmento `#`: no llega a los logs ni al servidor en la URL, y se borra de la barra con `replaceState`.
  - En la BD solo se guarda su SHA-256.
- Son de un solo uso: un `UPDATE … WHERE accepted_at IS NULL` atómico garantiza que solo gane una aceptación.
- Vencen en 72 h y se pueden revocar y reenviar (al reenviar, la anterior queda revocada).
- Si el correo ya tiene cuenta, se pide la **contraseña actual**. La contraseña nunca se sobrescribe y se probó que el hash no cambia.
- Máximo 5 intentos, reservados de forma atómica. Al llegar al límite, la invitación se cancela.
- Reglas para el dueño:
  - Solo invita a EMPLEADOS de su negocio.
  - No puede reemplazar una invitación emitida por VLUX ni una de otro rol.
- Aceptar una invitación no cambia el rol de quien ya es miembro activo.
- Sin proveedor de correo, la interfaz lo dice explícitamente («No se envió ningún correo»).

## 4. Aislamiento entre negocios
- RLS en todas las tablas (`tablas sin RLS = 0` en local y en Supabase).
- La app usa `vlux_app` (NOBYPASSRLS).
- Las métricas globales salen de 2 funciones SECURITY DEFINER:
  - Tienen `search_path` fijo.
  - Devuelven **solo conteos** y tipo de acción.
  - `EXECUTE` está revocado a PUBLIC, anon y authenticated; solo lo tiene `vlux_app`.
- Las lecturas de detalle de un negocio usan `withTenant` (RLS).
- No hay credenciales de administración de PostgreSQL en el frontend ni en Vercel.
- Asesor de seguridad de Supabase después de aplicar 0006: **0 avisos**.

## 5. Hallazgos de la revisión y estado
| # | Sev. | Hallazgo | Estado |
| -: | :- | :- | :- |
| 1 | MEDIA | El límite de intentos del 2FA se podía reiniciar volviendo a iniciar sesión; el bloqueo no se revisaba en el 2FA | **Corregido**: contador propio, revisión de bloqueo, revocación de las sesiones previas y límite por admin. Prueba de integración. |
| 2 | MEDIA | El dueño podía revocar una invitación de co-dueño emitida por VLUX | **Corregido**: responde 409. Prueba de integración. |
| 3 | MEDIA | La llave del TOTP se derivaba de `PLATFORM_ADMIN_TOKEN` (rotarlo rompía el 2FA) | **Corregido**: `ADMIN_SECRETS_KEY` es obligatoria en producción y está separada. |
| 4 | BAJA | Enumeración de correos de admin por el 429 de las cuentas bloqueadas | **Corregido**. |
| 5 | BAJA | Carrera en los intentos de invitación | **Corregido**: reserva atómica. |
| 6 | BAJA | Aceptar podía degradar a un miembro activo | **Corregido**: responde 409. Prueba de integración. |
| 7 | BAJA | Carrera al confirmar el alta del 2FA | **Corregido**. |
| 8 | BAJA | Un token multibyte en la instalación producía error 500 | **Corregido**: comparación por hash. |
| 9 | BAJA | Límite de 128 KB en todo `/api/admin` | **Corregido**: solo aplica al alta y la edición de negocios. |
| 10 | BAJA | Códigos de recuperación con SHA-256 sin sal | **Corregido**: HMAC con llave del servidor. |
| 11 | BAJA (hipótesis) | Control Center activo por omisión fuera de Vercel | **Corregido**: con `NODE_ENV=production` requiere `CONTROL_CENTER_ENABLED=1`. |
| 12 | Diseño | No hay jerarquía entre administradores | **Aceptado para V0.3**: equipo de 1–3 personas. Pendiente definir un rol «propietario» antes de crecer el equipo. |

## 6. Riesgos abiertos
- **Alta del 2FA.** Quien tenga la contraseña de un administrador que todavía no configuró su 2FA podría configurarlo antes que él. Mitigación: la invitación de administrador dura 24 h y el alta del 2FA se hace en el mismo momento.
- **`ADMIN_SECRETS_KEY` sin procedimiento de rotación.** Rotarla obliga a reconfigurar el 2FA, y hoy no hay pantalla para restablecer el 2FA de otro administrador.
- **Logotipos en la base de datos.** Se guardan como data URL de hasta ~64 KB. Es aceptable para decenas de negocios; con cientos conviene moverlos a almacenamiento de objetos.
- **Respaldos NO operativos** (ver `RESPALDOS.md`).
