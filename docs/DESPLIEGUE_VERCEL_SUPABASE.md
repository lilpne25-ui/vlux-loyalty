# Manual técnico · VLUX Loyalty V0.2.1 en Vercel + Supabase

## 1. Arquitectura
```
Cliente / Caja / Dueño (navegador, HTTPS)
        │
   Vercel (CDN + 1 Function Node 22, región iad1)
        ├── static/            React + Vite (CDN, caché inmutable en /assets)
        └── functions/api.func Hono empaquetado (esbuild, un archivo)
                 │  /api/*  y  /t/*
                 ▼
   Supabase PostgreSQL 17 (us-east-1)
        └── Transaction Pooler (Supavisor :6543) · rol vlux_app · TLS verificado · RLS por negocio
```
- **No hay servidor persistente en Vercel.** `server/vercel.ts` exporta un manejador `(req, res)`; `server/index.ts` (con `serve()`) queda solo para desarrollo local.
- **Build Output API v3:** `npm run build:vercel` genera `.vercel/output` (estáticos, Function y `config.json` con rutas). Vercel lo usa tal cual; no depende de detección automática de framework.
- **Rutas:** `/api/*` y `/t/<token>` van a la Function antes que el sistema de archivos; luego estáticos; al final el fallback del SPA a `index.html`. El fallback no puede interceptar la API (está antes) ni enlaces personales.
- **Caché:** `/assets/*` inmutable 1 año; `index.html` `max-age=0, must-revalidate`; API `private, no-store`; `/t/*` `no-store`.
- **Encabezados:** CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy` (cámara solo propia) en estáticos (config.json) y API (Hono).

## 2. Variables de entorno
| Variable | Dónde | Preview | Production | Notas |
| :- | :- | :- | :- | :- |
| `DATABASE_URL` | Vercel (sensitive) | Pooler 6543, usuario `vlux_app.<ref>` | Igual, proyecto Supabase de producción | Nunca el usuario `postgres` |
| `DATABASE_SSL` | Vercel | `supabase` | `supabase` | TLS verificado con la CA pública de Supabase |
| `PG_POOL_MAX` | Vercel | `3` | `3` | Conexiones por instancia |
| `NODE_ENV` | Vercel | `production` | `production` | Cookies Secure; se niega a operar con rol inseguro |
| `PUBLIC_BASE_URL` | Vercel | **vacía** (usa el dominio del Preview) | **obligatoria** (dominio definitivo) | Evita QR/enlaces a dominios equivocados |
| `PLATFORM_ADMIN_TOKEN` | Vercel (sensitive) | token propio de Preview | otro token distinto | ≥32 caracteres |
| `PRIVACY_NOTICE_VERSION` | Vercel | `borrador-2026-10` | versión revisada por abogado | |
| `TRUST_PROXY` | — | no usar | no usar | En Vercel la IP sale de `x-vercel-forwarded-for` |
| `DATABASE_ADMIN_URL` | **solo máquina de administración / GitHub Actions** | — | — | **Nunca en Vercel** |

## 3. Supabase: alta segura (una vez por entorno)
1. Proyecto exclusivo por entorno (`vlux-loyalty-preview`, luego `vlux-loyalty-prod`). Nunca experimentar migraciones en producción.
2. Migraciones como dueño del esquema (SQL Editor, MCP o `npm run db:migrate` con `DATABASE_ADMIN_URL` de Session Pooler/conexión directa). **No usar `db:setup`** (es solo local y se niega a correr fuera de localhost).
3. Rol de la app (en el SQL Editor, con contraseña generada y guardada solo en el gestor de secretos):
   ```sql
   ALTER ROLE vlux_app WITH LOGIN CONNECTION LIMIT 40 PASSWORD '<generada>';
   GRANT USAGE ON SCHEMA public TO vlux_app;
   ```
   Luego `ops/grants.sql` (idempotente).
4. Verificación:
   ```sql
   SELECT rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname = 'vlux_app';            -- f, f, t
   SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tableowner='vlux_app';               -- 0
   SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND relkind='r' AND NOT relrowsecurity;                                -- (vacío)
   SELECT count(*) FROM information_schema.role_table_grants
    WHERE table_schema='public' AND grantee IN ('anon','authenticated');                            -- 0
   ```
5. Asesor de seguridad de Supabase: 0 advertencias (verificado 2026-10-31 en Preview).
6. **Data API:** la app no la usa. Las tablas están en `public`, pero `anon`/`authenticated` no tienen permisos y todas las tablas tienen RLS. Recomendado además: desactivar la Data API en *Project Settings → API* o quitar `public` de los esquemas expuestos.

## 4. Pooler y transacciones
- Transaction Pooler (Supavisor) recomendado por Supabase para funciones serverless. No admite sentencias preparadas: la app no usa sentencias con nombre.
- `withTenant()` usa `set_config('app.business_id', …, true)`: el valor vive **solo dentro de la transacción**, así que el pooler puede reasignar la conexión sin arrastrar el negocio. Prueba: 60 transacciones intercaladas en 2 negocios sin fuga y sin valor residual (`tests/integration/v021.test.ts`).
- Un pool por instancia (variable de módulo), `max=3`, cierre de inactivas a 10 s, timeout de conexión 5 s, manejador de errores de conexiones inactivas.
- Reintentos (3, con espera exponencial) **solo** al obtener conexión/abrir transacción; nunca a mitad de una transacción (evita sellos duplicados).
- Al primer uso verifica que el rol no sea superusuario, BYPASSRLS ni dueño de tablas; en `NODE_ENV=production` se niega a operar.

## 5. Despliegue
- Proyecto Vercel `vlux-loyalty` (equipo vlux-s-projects), Node 22, región `iad1` (misma región que Supabase us-east-1).
- Build: `npm ci` → `npm run build:vercel`.
- **Production deshabilitado:** el *Ignored Build Step* cancela cualquier build con `VERCEL_ENV=production`. Para habilitarlo hace falta decisión explícita de Vlux, plan Pro y dominio.
- **Protección:** Vercel Authentication en todos los despliegues (solo cuentas del equipo). Para pruebas automáticas se usa un enlace de omisión con caducidad.
- Cada push a una rama distinta de `main` genera un Preview con su propia URL.

## 6. Operación y recuperación
- Respaldos: ver `docs/RESPALDOS.md`.
- Rotar la contraseña de `vlux_app`: `ALTER ROLE vlux_app PASSWORD '<nueva>'` → actualizar `DATABASE_URL` en Vercel → redeploy.
- Rotar `PLATFORM_ADMIN_TOKEN`: cambiar en Vercel y redeploy.
- Dueño olvidó su contraseña: `POST /api/platform/password-reset` con el token de plataforma → enlace de un solo uso (60 min).
- Logs: la app registra método, ruta plantilla (`/t/:token`, nunca el token), código y mensaje de error. Los enlaces personales usan `#token`, que el navegador no envía al servidor.
