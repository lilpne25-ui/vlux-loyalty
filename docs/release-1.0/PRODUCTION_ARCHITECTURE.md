# VLUX Loyalty 1.0 · Arquitectura de producción

> Propuesta lista para ejecutar. **Nada de esto se creó**: requiere contratar planes (Vercel Pro, Supabase Pro), dominio y DNS, todo con autorización de Vlux. Preview se conserva tal cual.

## Diagrama
```
                         DESARROLLO Y DEMOSTRACIÓN (existe hoy, datos sintéticos)
  ┌──────────────────────────────┐   ┌──────────────────────────────┐
  │ Vercel Preview "vlux-loyalty" │   │ Vercel Preview "vlux-loyalty- │
  │ Control Center + Vercel SSO   │   │ demo" (público, DEMO_ACCESS)  │
  └──────────────┬───────────────┘   └──────────────┬───────────────┘
                 └───────────────┬──────────────────┘
                         Supabase "vlux-loyalty-preview" (Free, us-east-1)

                         PRODUCCIÓN (por crear, aislada; no comparte NADA con Preview)
  Clientes y negocios (teléfonos)                          Equipo VLUX
          │ HTTPS (TLS automático)                              │ HTTPS + Vercel SSO + 2FA
          ▼                                                     ▼
  ┌───────────────────────────────┐              ┌───────────────────────────────┐
  │ Vercel PRO · proyecto          │              │ Vercel PRO · proyecto          │
  │ "vlux-loyalty-app" Production  │              │ "vlux-loyalty-admin" Production│
  │ app.<dominio> (tarjeta, caja,  │              │ admin.<dominio> (Control       │
  │ panel, PWA). CONTROL_CENTER=0  │              │ Center). Protección: Vercel    │
  │ Funciones: iad1, Node 22       │              │ Authentication + TOTP           │
  └───────────────┬───────────────┘              └───────────────┬───────────────┘
                  │ Supavisor :6543, TLS verificado, rol vlux_app (NOBYPASSRLS)
                  ▼                                              ▼
           ┌──────────────────────────────────────────────────────────┐
           │ Supabase PRO "vlux-loyalty-prod" · us-east-1 · Micro      │
           │ PostgreSQL 17 · RLS 34/34 · Data API desactivada           │
           │ Respaldo diario Supabase (7 días)                          │
           └───────────────┬──────────────────────────────────────────┘
                           │ Session Pooler :5432 (dueño del esquema) SOLO para respaldos/migraciones
                           ▼
           GitHub Actions en repo PRIVADO "vlux-ops": respaldo diario verificado + cifrado
           → artefacto privado 30 días · falla ⇒ issue + correo
  Monitoreo: UptimeRobot/Better Stack (gratis) → /api/health?db=1 · Vercel Observability · asesores Supabase
```

## Inventario de recursos
| Recurso | Preview (existe) | Producción (propuesto) | Costo |
|---|---|---|---|
| Vercel equipo | `vlux-s-projects` (Hobby) | Mismo equipo en **Pro** (Hobby prohíbe uso comercial) | USD 20/mes por asiento, incluye USD 20 de uso |
| Proyecto app | `vlux-loyalty-demo` | `vlux-loyalty-app` (nuevo) | Incluido |
| Proyecto admin | `vlux-loyalty` | `vlux-loyalty-admin` (nuevo) | Incluido |
| Base de datos | Supabase Free `kpcmxmmwcolcxhkiwmaq` | Supabase **Pro** proyecto nuevo (Free no tiene respaldos y se pausa tras 1 semana) | USD 25/mes (incluye Micro) |
| Respaldos | — (fallando) | `vlux-ops` privado + Supabase diario | Gratis (minutos de Actions incluidos) |
| Dominio | `*.vercel.app` | p. ej. `vluxloyalty.mx` o subdominio de `vlux.com.mx` | ~MXN 300–600/año (verificar al comprar) |
| Monitoreo | — | UptimeRobot o Better Stack, plan gratuito | 0 |
| Correo | No configurado | Resend (dominio verificado) cuando se active | 0 hasta 3,000/mes |
Precios oficiales leídos el 2026-11-07 (supabase.com/pricing, vercel.com/pricing).

## Variables y secretos (plan)
Cada valor de producción es **nuevo**; nada se copia de Preview.
| Variable | app | admin | Tipo | Notas |
|---|---|---|---|---|
| `DATABASE_URL` | ✓ | ✓ | Sensitive | `vlux_app.<ref_prod>` por pooler 6543. Contraseña nueva |
| `DATABASE_SSL` | `supabase` | `supabase` | Plain | TLS verificado |
| `PG_POOL_MAX` | 3 | 3 | Plain | |
| `NODE_ENV` | `production` | `production` | Plain | Cookies Secure, rol seguro obligatorio |
| `PUBLIC_BASE_URL` | `https://app.<dominio>` | `https://admin.<dominio>` | Plain | **Obligatoria** en producción |
| `PUBLIC_APP_URL` | — | `https://app.<dominio>` | Plain | Enlaces que el Control Center entrega |
| `ADMIN_APP_URL` | `https://admin.<dominio>` | — | Plain | Activación desde el Estudio |
| `CONTROL_CENTER_ENABLED` | `0` (o ausente) | `1` | Plain | |
| `ADMIN_SECRETS_KEY` | — | ✓ | Sensitive | 48+ caracteres aleatorios; cambiarla obliga a reconfigurar 2FA |
| `PLATFORM_ADMIN_TOKEN` | — | ✓ | Sensitive | Solo instalación inicial del primer administrador; rotar después |
| `PRIVACY_NOTICE_VERSION` | ✓ | ✓ | Plain | Versión **aprobada** por el abogado (no `borrador-…`) |
| `DEMO_ACCESS` | ausente | ausente | — | **Nunca** en producción |
| `PLATFORM_LEGACY_API`, `ALLOW_UNSAFE_DB_ROLE`, `TRUST_PROXY` | ausentes | ausentes | — | |
| `FEATURE_*` | ausentes | ausentes | — | Ver `FEATURE_FLAGS.md` |
| `VAPID_*`, `CRON_SECRET`, `EMAIL_*`, `SMTP_*`, `RESEND_API_KEY` | ausentes | ausentes | Sensitive | Solo al activar funciones congeladas |
| `DATABASE_ADMIN_URL`, `SUPABASE_BACKUP_URL`, `BACKUP_PASSPHRASE` | **nunca en Vercel** | **nunca en Vercel** | — | Solo máquina controlada / secretos de `vlux-ops` |

## Política de secretos
1. Gestor de contraseñas como fuente única (1Password/Bitwarden). Vercel y GitHub guardan copias de uso.
2. En Vercel, todo secreto como **Sensitive** y solo en el entorno que lo usa (Production ≠ Preview).
3. Nunca en el repositorio, chats, issues, capturas ni registros. El código ya redacta URLs (`redactUrl`) y no registra tokens.
4. Rotación: al salir alguien con acceso, ante sospecha de fuga, y `PLATFORM_ADMIN_TOKEN` después del alta inicial. Contraseñas de BD cada 6 meses.
5. 2FA obligatorio en GitHub, Vercel, Supabase, registrador de dominio y correo de la cuenta.

## Aislamiento de datos
- Producción y Preview: proyectos de Supabase distintos, credenciales distintas, roles distintos. Ningún script copia datos entre ellos.
- Entre negocios: RLS + `business_id` + llaves compuestas (ver `SECURITY_REVIEW.md`).
- Datos de clientes reales nunca en Preview, pruebas, capturas ni respaldos fuera de `vlux-ops`.

## Dominio y TLS
1. Comprar el dominio (autorización). Registrar con 2FA.
2. Vercel → proyecto → Domains: `app.<dominio>` y `admin.<dominio>`; crear en el DNS los registros que Vercel indique (CNAME a `cname.vercel-dns.com` o A según Vercel). **Cambio de DNS: requiere autorización.**
3. TLS: certificados automáticos de Vercel (Let's Encrypt), renovación automática; HSTS lo envía Vercel en dominios propios.
4. `PUBLIC_BASE_URL`/`PUBLIC_APP_URL` deben coincidir con los dominios finales **antes** de imprimir QR: el QR de mostrador codifica esa dirección.

## Protección administrativa
- El Control Center vive en otro proyecto/dominio, detrás de Vercel Authentication (solo cuentas del equipo) **y** del login propio con TOTP y step-up para exportar/eliminar.
- El proyecto app tiene `CONTROL_CENTER_ENABLED` ausente: `/api/admin` responde 404.
- Firewall de Vercel: activar el modo de desafío solo ante ataque (no por omisión).

## Procedimiento de despliegue (producción)
1. Rama `release/x.y.z` con CI verde (typecheck, unit, integración, build) y regresiones E2E locales verdes.
2. Si hay migración nueva: respaldo verificado del día → aplicar en Preview → probar → aplicar en producción (`scripts/migrate.ts up` desde máquina controlada). **Nunca desplegar código antes de su migración.**
3. Desplegar Preview de los dos proyectos y pruebas remotas de solo lectura (`/api/health?db=1` devuelve la versión).
4. Merge a `main` (autorización de Vlux) → etiqueta `vX.Y.Z` → Production en Vercel.
5. Verificación posterior: health, abrir tarjeta demo del negocio VLUX, login de caja de prueba, revisar errores en Vercel 15 minutos.

## Procedimiento de reversión
- **Código:** Vercel → Deployments → despliegue anterior → *Instant Rollback* (segundos). Las migraciones son aditivas, así que el código anterior sigue funcionando con el esquema nuevo.
- **Migración:** no se revierte en producción con `down` (puede borrar datos). Se corrige con una migración nueva; si hay daño de datos, restauración (`BACKUP_RECOVERY.md`).
- **Configuración:** las variables de Vercel guardan historial; restaurar el valor anterior y redesplegar.
- **Funciones congeladas:** poner `FEATURE_X=0` y redesplegar.
