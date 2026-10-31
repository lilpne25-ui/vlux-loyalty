# Informe de seguridad · VLUX Loyalty V0.2.1 (Vercel + Supabase)

Complementa `INFORME_SEGURIDAD.md` (V0.2). Fecha: 2026-10-31. Verificado con pruebas locales (PostgreSQL 16) y consultas al proyecto Supabase de Preview. **No se ha verificado todavía contra el Preview desplegado en Vercel** (ver estado al final).

## Controles nuevos o cambiados en V0.2.1
| Tema | Control | Evidencia |
| :- | :- | :- |
| Rol de base de datos | La app conecta como `vlux_app`: sin superusuario, sin BYPASSRLS, sin ser dueño de tablas. Al primer uso lo verifica y **en producción se niega a operar** si no se cumple | `ensureSafeRole()`; prueba `v021`; consulta en Supabase: `rolsuper=f, rolbypassrls=f`, 0 tablas propias |
| RLS | Todas las tablas de `public` con RLS. Tablas por negocio: política por `app.business_id`. Tablas globales: política `app_only TO vlux_app` | prueba "RLS en todas las tablas"; consulta en Supabase: 0 tablas sin RLS |
| Data API de Supabase | `anon` y `authenticated` sin permisos en `public` (incluye privilegios por omisión). La app no usa la Data API | 0 grants verificados; asesor de seguridad: 0 advertencias |
| Pooler | Contexto de negocio con `set_config(..., true)` (vive solo en la transacción) | 60 transacciones intercaladas sin fuga |
| TLS a la base | `DATABASE_SSL=supabase`: certificado verificado contra la CA pública de Supabase | pendiente de confirmar en el Preview |
| Credenciales | `DATABASE_ADMIN_URL` nunca en Vercel; la cadena se registra con contraseña oculta | `redactUrl()`; variables de Vercel revisadas |
| Rate limit | Compartido entre instancias en Postgres (`rate_limits`, llave SHA-256, `INSERT … ON CONFLICT` atómico) | prueba con proceso hijo (2 instancias) |
| IP del cliente | En Vercel se usa `x-vercel-forwarded-for` (Vercel lo fija y no se puede falsificar). `x-forwarded-for` solo con `TRUST_PROXY=1`, que **no** se usa en Vercel | revisión de código + emulador local |
| Tokens fuera de logs | Enlaces personales y de restablecimiento usan `#token`: el navegador no envía el fragmento, así que no llega a logs de Vercel ni del servidor. El SPA lo manda en el cuerpo de un POST y limpia la barra de direcciones | E2E `v021-operacion` |
| Enumeración / bloqueo | Cuenta bloqueada responde igual que credenciales inválidas (429 genérico) | prueba "lock genérico" |
| Caché | API `private, no-store`; `/t/*` `no-store`; solo `/assets/*` en caché pública | prueba de encabezados |
| Recuperación | Restablecimiento de contraseña: un solo uso, 60 min, revoca sesiones. Nuevo enlace de tarjeta: revoca los anteriores. Anulación de compra: auditada, idempotente, bloqueada si los sellos ya se usaron | 6 pruebas de integración + 14 E2E |
| Contraseña temporal | Empleados nuevos y restablecidos deben cambiarla al entrar | E2E 02b |
| Acceso al Preview | Vercel Authentication en todos los despliegues; Production bloqueado por *Ignored Build Step* | configuración del proyecto; un intento de deploy a Production se canceló solo (2026-10-31) |
| Repositorio | Privado (verificado 2026-10-31) | API de GitHub |

## Pendientes (prioridad)
| # | Riesgo | Sev. | Qué falta |
| :- | :- | :- | :- |
| 1 | Aviso de privacidad y contrato de encargado sin revisión legal (LFPDPPP) | Alta | Abogado antes de datos reales. **No se declara cumplimiento legal** |
| 2 | Supabase Free no tiene respaldos y pausa el proyecto | Alta para piloto | Supabase Pro + flujo de respaldo diario con secretos |
| 3 | Vercel Hobby es solo para uso no comercial | Alta para piloto | Vercel Pro antes de cobrar |
| 4 | El cambio obligatorio de contraseña temporal solo se impone en la interfaz | Media | Bloquear también en la API (V0.3) |
| 5 | `email_taken` al crear empleado revela si un correo ya existe (solo para dueños autenticados) | Baja | Mensaje genérico |
| 6 | Cookie sin prefijo `__Host-`; sesiones sin expiración por inactividad | Baja | V0.3 |
| 7 | `review_url` acepta cualquier `https://` | Baja | Restringir a dominios de Google |
| 8 | Google Fonts: petición externa con la IP del visitante | Baja | Autohospedar fuentes |
| 9 | Sin monitoreo activo ni alertas | Media | Revisar errores de Vercel a diario en el piloto; alertas en V0.3 |
| 10 | El reintento de conexión no reintenta a mitad de transacción (a propósito); un corte justo al confirmar puede dar error aunque el sello se guardó | Baja | La llave de idempotencia evita duplicar al reintentar desde la caja |
