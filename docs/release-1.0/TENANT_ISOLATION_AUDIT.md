# Auditoría de aislamiento multiempresa · 2026-11-07

Alcance: que un negocio no pueda leer ni escribir datos de otro (en particular los del negocio real). **Sin credenciales reales, sin escrituras en Preview, sin identidades reales.** Cuatro tipos de evidencia, separados:

## 1. Pruebas automatizadas (PASS)
| Qué | Resultado |
|---|---|
| Integración del repo (`npm test`, base local PostgreSQL 17, rol `vlux_app` NOBYPASSRLS) | **148/148** (incluye RLS de `businesses`, tarjetas sin negocio fijado = 0 visibles, "un negocio no ve ni escribe datos de otro", FK compuesta tarjeta↔cliente, "el dueño del 2.º negocio no ve datos del 1.º", empleado no opera tarjetas de otro negocio, avisos push nunca cruzan negocios, todas las tablas con RLS y rol de la app sin BYPASSRLS) |
| Unitarias | 71/71 |
| Prueba funcional nueva sobre una **copia restaurada** con 10 negocios (`scripts/synthetic/restore-functional-check.ts`) | **13/13**: el dueño 2 recibe HTTP 404 al hacer lookup, ver, comprar y exportar sobre datos del negocio 1; 0 escrituras cruzadas; su lista de clientes tiene 0 ids del negocio 1 |
| SQL directo como `vlux_app` en 10 negocios sintéticos | con contexto A: 300 tarjetas de A, **0** de B (cards, customers, purchases, rewards, stamp_events, audit_events, reward_rules); `INSERT` en B → *violates row-level security*; `UPDATE stamp_events` y `DELETE cards` → *permission denied*; sin contexto: **0** tarjetas visibles |

## 2. Consultas de catálogo en Supabase Preview (solo lectura, PASS con matiz)
| Métrica | Valor |
|---|---|
| Tablas en `public` / con RLS | 34 / 34 (ninguna sin RLS) |
| Políticas RLS | 36 · **0** dirigidas a `anon`/`authenticated` |
| Permisos de tabla para `anon`/`authenticated` | 0 |
| Funciones con EXECUTE para PUBLIC / `anon` / `authenticated` | 0 / 0 / 0 |
| `vlux_app`: superusuario o BYPASSRLS | no |
| Asesor de seguridad de Supabase | 0 avisos |
| Migraciones aplicadas | 15 |
Consecuencia: la Data API (PostgREST) de Supabase no entrega nada con la llave pública. `FORCE ROW LEVEL SECURITY` está en 0 tablas: el dueño del esquema (rol de migraciones/respaldo) ve todo; es lo esperado y obliga a proteger esa credencial.

## 3. Hallazgo H-1 (MEDIO, de diseño): 9 tablas con `business_id` sin aislamiento a nivel de base de datos
Las tablas `business_deletions`, `business_subscriptions`, `card_access_tokens`, `email_events`, `email_outbox`, `platform_audit_events`, `staff_invitations`, `staff_memberships` y `staff_sessions` tienen una política `ALL … USING (true)`. Son "globales" porque se consultan **antes** de conocer el negocio (login, token de tarjeta, invitación). Ahí **el aislamiento depende del código, no de RLS**. Contienen, entre otras cosas, correos de invitación (`email_outbox.to_email`), membresías y hashes de sesión/token.
- Revisión de código (grep de todas las consultas a esas tablas en `server/`): las rutas de sesión de negocio filtran por `business_id` de la sesión (`operations.ts`, `owner.ts`, `invitations.ts`, `lifecycle.ts`) o por clave exacta (token/hash). `anonymizeCustomer` usa subconsultas sobre `cards`, que sí tiene RLS. **No encontré una ruta cruzada**, pero es una revisión manual, no una prueba formal.
- Recomendación (antes del piloto, no bloquea la demo): una prueba de integración que falle si aparece una tabla nueva con `business_id` y `USING (true)` que no esté en una lista permitida; y, para `business_subscriptions`/`email_outbox`/`staff_invitations`, política `business_id = current_business_id()` más una función `SECURITY DEFINER` para los pocos accesos globales.

## 4. Pendiente / no comprobado
| Comprobación | Estado |
|---|---|
| Pruebas negativas contra el **despliegue** de Preview con dos negocios sintéticos nuevos | **NOT TESTED** (crear negocios en Preview es una escritura; hacerlo requiere autorización) |
| Rutas públicas por token de tarjeta (256 bits) y QR de mostrador contra el despliegue | NOT TESTED en remoto; cubiertas por integración local |
| Panel de administración (Control Center): ve todos los negocios **por diseño** (2FA obligatorio) | no es una fuga; el acceso del propietario de plataforma debe quedar justificado en el aviso de privacidad |
| Ajuste "Exposed schemas" de la Data API de Supabase en Preview | NOT TESTED (se infiere seguro por 0 permisos, pero no se leyó el ajuste) |
| Exportaciones: la de cliente (`/api/owner/customers/:id/export`) devuelve 404 cruzado (PASS local); el respaldo JSON de negocio y la purga no se probaron cruzadas | parcial |
