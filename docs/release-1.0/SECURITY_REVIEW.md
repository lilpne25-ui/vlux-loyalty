# VLUX Loyalty 1.0.0-rc.1 · Revisión de seguridad

Alcance: código del servidor (`server/`), migraciones 0001–0015, permisos reales de Supabase Preview (leídos por SQL), respaldos y CI. Método: lectura de código, consultas de catálogo, pruebas automatizadas positivas y **negativas**. Cada hallazgo indica su evidencia; nada se declara resuelto sin prueba.

## Resumen
| # | Hallazgo | Severidad | Estado | Evidencia |
|---|---|---|---|---|
| S1 | `search_path` mutable en `forbid_mutation` y `businesses_set_logo_hash` (asesor de Supabase) | Media | **Corregido y aplicado en Preview (0015, 2026-11-07 09:05 UTC)** | `release-rc1.test.ts` prueba 1 falla sin 0015 y pasa con 0015 |
| S2 | Tras restaurar un respaldo (`--no-privileges`), las funciones SECURITY DEFINER (`platform_purge_business`, `platform_business_export`…) quedaban ejecutables por **PUBLIC**; `ops/grants.sql` no las corregía | **Alta** (solo en una base restaurada) | **Corregido** | prueba 5 + `backup-verify.sh` "funciones ejecutables por PUBLIC: 0" |
| S3 | `ops/grants.sql` congelado en V0.3: tras restaurar, la app no tenía permisos sobre 8 tablas y 3 funciones (restauración "exitosa" pero app rota) | Alta (recuperación) | **Corregido** | prueba 5 (huella de permisos idéntica a una base migrada) |
| S4 | El workflow de respaldo subiría el respaldo cifrado como artefacto de un **repositorio público** (descargable por cualquiera; solo lo protegería la frase) | Alta | **Mitigado en la rama del RC; ABIERTO en `main`** (allí sigue el workflow anterior sin protección; hoy inofensivo porque no hay secretos). Cierre: desactivar el workflow en `main` y usar `vlux-ops` (`BACKUP_PRIVATE_SETUP.md`) | `.github/workflows/respaldo-diario.yml` paso "Verificar destino restringido" |
| S5 | EXECUTE a PUBLIC en funciones de disparador y en `current_business_id` | Baja | **Corregido (0015)** | prueba 2; disparadores siguen funcionando (prueba 3) |
| S6 | Privilegios por omisión de Supabase dan acceso a `anon`/`authenticated` sobre tablas **nuevas** de `public` (hoy se retiran tabla por tabla) | Media (futura) | **Corregido (0015)** | `ALTER DEFAULT PRIVILEGES … REVOKE` |
| S7 | API de datos de Supabase (PostgREST) expuesta para el esquema `public` aunque la app no la usa | Baja (anon sin permisos y RLS en todas las tablas) | **Recomendación**: desactivar Data API en el proyecto de producción | Catálogo: 0 permisos de `anon`/`authenticated` |
| S8 | CSP permite `style-src 'unsafe-inline'` | Baja | Aceptado para 1.0 (sin `script-src` inline) | `server/app.ts` |

No se encontraron vulnerabilidades altas o críticas **sin resolver** en el código de la aplicación. S2–S4 afectaban la recuperación, no la operación diaria.

## Causa raíz de S1
`0004_search_path` fijó `search_path` en `forbid_mutation`. `0011_business_lifecycle` la recreó con `CREATE OR REPLACE FUNCTION … LANGUAGE plpgsql AS $$…$$` **sin** `SET search_path`, y `CREATE OR REPLACE` reemplaza también la configuración: el arreglo de 0004 se perdió en silencio. `businesses_set_logo_hash` (0008) nunca lo tuvo.
Corrección (0015, aditiva): `ALTER FUNCTION … SET search_path = pg_catalog, public`. El **cuerpo no cambia**: la eliminación controlada (variable `vlux.purge_business`, `current_user <> 'vlux_app'`) y las bitácoras de solo inserción se comportan igual. Probado:
- Purga de un negocio sintético con un año de datos: OK (ver `PERFORMANCE.md`).
- `DELETE`/`UPDATE` sobre `audit_events` como dueño del esquema → rechazado; con la variable de purga de **otro** negocio → rechazado; `vlux_app` no tiene `DELETE` (prueba 4).
- Regla para el futuro (en `MIGRATIONS.md`): toda función que se recree debe repetir `SET search_path`.

## Inventario revisado
| Tema | Resultado | Dónde |
|---|---|---|
| Funciones SECURITY DEFINER | 5 (`platform_business_stats`, `platform_recent_activity`, `platform_purge_business`, `platform_business_export`, `notification_due_businesses`); todas con `search_path = public, pg_temp`, dueño `postgres`, EXECUTE solo `vlux_app` (+ `service_role` de Supabase). Ninguna a PUBLIC/anon | Catálogo Preview |
| Rol de la app | `vlux_app`: sin superusuario, `NOBYPASSRLS`, no es dueño de tablas, sin membresías | Catálogo Preview |
| RLS | Activa en **34/34** tablas de `public`; `anon`/`authenticated` sin permisos en ninguna | Catálogo Preview |
| Aislamiento multiempresa | `business_id` + llaves foráneas compuestas `(id, business_id)` + política `business_id = current_business_id()` fijada por transacción (`withTenant`) | `db/README.md`, pruebas `auth`, `schema` |
| Bitácoras | `audit_events`, `stamp_events`, `platform_audit_events`, `business_deletions`: `vlux_app` solo SELECT/INSERT + disparador | prueba 4 |
| Sesiones | Token opaco 256 bits en cookie `HttpOnly`, `SameSite=Lax`, `Secure` en producción (`NODE_ENV=production` está en ambos Preview); en BD solo SHA-256. Personal 12 h; administradores 8 h con 30 min de inactividad | `server/app.ts`, `auth.ts` |
| Contraseñas | scrypt N=16384, comparación en tiempo constante, hash ficticio si el correo no existe; bloqueo 15 min tras 5 fallos + límite por IP | `security.ts`, `auth.ts` |
| 2FA (Control Center) | TOTP con secretos cifrados (`ADMIN_SECRETS_KEY`), códigos de recuperación, re-autenticación (step-up) para exportar/eliminar | `admin-routes.ts` |
| CSRF | Mutaciones solo `application/json` y `Origin` propio | prueba `auth` "CSRF" |
| Rate limiting | Compartido en PostgreSQL (llave SHA-256, sin IP en claro); por IP, por cuenta, por sesión y global para códigos | `ratelimit.ts` (47 puntos de control) |
| IP del cliente | En Vercel `x-vercel-forwarded-for` (no falsificable); `x-forwarded-for` solo con `TRUST_PROXY=1` | `clientIp()` |
| Imágenes | Solo PNG/JPEG/WebP; bytes mágicos verificados en servidor; sin SVG; `Content-Type` fijo y `nosniff` | `image-check.ts` |
| Tokens y códigos | Tokens 256 bits; tarjeta `XXXX-XXXX` (~40 bits) solo identifica, no autoriza; premio `R-XXXXXX`; código presencial 10 caracteres (~49 bits), 30 min, un uso, límite por IP + global | `security.ts`, `invitations.ts` |
| Webhooks | Firma HMAC-SHA256 (esquema Svix), tolerancia 5 min, comparación en tiempo constante; sin secreto → 404 | `email/provider.ts` |
| Tarea programada | `CRON_SECRET` ≥ 32 caracteres, comparación en tiempo constante; sin secreto siempre 401 | `app.ts` |
| Endpoints administrativos | `/api/admin` solo con `CONTROL_CENTER_ENABLED=1` (no está en el proyecto público: 404 verificado en V0.4.6); API heredada apagada | `config.ts` |
| Funciones opcionales | Solo por variable de servidor; ninguna ruta pública puede activarlas | `server/features.ts`, `FEATURE_FLAGS.md` |
| Errores | Sin rutas completas, tokens ni `err.detail` en logs; mensaje genérico al cliente | `app.ts onError` |

## Pruebas de autorización negativa
La suite de integración contiene **101 aserciones negativas** (34 × 401, 16 × 403, 30 × 404, 15 × 409, 6 × 429) en 10 archivos: sin sesión, empleado contra panel del dueño, empleado de otro negocio contra tarjetas ajenas, sesión revocada, logout, cliente contra caja, CSRF, API heredada, cuerpos grandes, registro masivo, invitaciones vencidas/reusadas, Control Center sin 2FA, exportación sin step-up, purga de negocio con clientes reales. Más las nuevas de `release-rc1.test.ts`. Todas pasan (148/148).

## Asesores de Supabase
- **Antes** (2026-11-07 06:08 UTC): 2 WARN de seguridad (S1).
- **Después** (2026-11-07 ~09:12 UTC, tras pegar Vlux la 0015): **0 avisos** (`lints = []`). Comprobado también por lectura: ambas funciones con `search_path=pg_catalog, public`, 0 funciones ejecutables por PUBLIC, 12/12 índices, RLS en todas las tablas, 8 negocios intactos (`evidencia/supabase-preview-0015.txt`).

## Riesgos residuales
- Repositorio público: el código y la arquitectura son visibles. No hay secretos en el repo (revisado: `.env*` ignorados; `scripts/` y `docs/` sin cadenas de conexión). Riesgo aceptado por decisión de Vlux.
- Preview interno y público comparten la misma BD Preview (aceptable con datos sintéticos; **nunca** en producción).
- `PLATFORM_ADMIN_TOKEN` y `ADMIN_SECRETS_KEY` de Preview no deben reutilizarse en producción.
