# Auditoría de políticas RLS · VLUX Loyalty 1.0 (rama de endurecimiento)

Fecha: 2026-11-07. Alcance: las nueve tablas con `business_id` y política `app_only USING (true)` (hallazgo H-1 de `TENANT_ISOLATION_AUDIT.md`), más las funciones `SECURITY DEFINER`. Datos: solo esquema y catálogo; pruebas con datos sintéticos en PostgreSQL 17 local. Preview: únicamente lectura de catálogo.

## 1. Clasificación (antes de 0016)
Criterio: una política `USING (true)` es **PERMISIVA con aislamiento en otra capa** si el código filtra bien y no se halló ruta cruzada; pasa a **VULNERABLE** cuando cualquier defecto de código o inyección SQL basta para leer/escribir otro negocio (la base no lo impide). No se halló ruta HTTP de explotación en el código existente; el riesgo era de **defensa en profundidad** y la corrección es de base de datos.

| Tabla | Clasificación | Qué quedaba expuesto ante un fallo del código | Corrección en 0016 |
|---|---|---|---|
| `staff_sessions` | VULNERABLE (a nivel BD) | hashes de sesión de todos los negocios; revocar/ver sesiones ajenas | lectura/revocación solo en alcance `auth`/`platform`; UPDATE solo `revoked_at` |
| `staff_memberships` | VULNERABLE | roles y activación de personal de otros negocios | `tenant_all` por negocio; lectura `auth`/`platform`; UPDATE solo `role, active` |
| `staff_invitations` | VULNERABLE | invitaciones y contadores de intentos ajenos | `tenant_all`; lectura `auth`/`platform`; UPDATE por columnas |
| `card_access_tokens` | VULNERABLE | hashes de tokens de tarjeta de todos los clientes | `tenant_all`; `auth_read`/`auth_touch` (solo `revoked_at`, `last_used_at`) |
| `email_outbox` | VULNERABLE | correos de destinatarios y enlaces cifrados ajenos | `tenant_all`; lectura `webhook` por id del proveedor; UPDATE por columnas |
| `email_events` | PERMISIVA con aislamiento en otra capa | eventos de entrega ajenos | `tenant_all` |
| `business_subscriptions` | PERMISIVA con aislamiento en otra capa | plan/precio/estado comercial de otros negocios | `tenant_all` + `platform_read`; UPDATE por columnas |
| `platform_audit_events` | PERMISIVA (solo plataforma) | bitácora transversal | `platform_read`; INSERT abierto a propósito (E-1) |
| `business_deletions` | PERMISIVA (solo plataforma) | historial de eliminaciones | `platform_read` + `platform_insert` |

Hallazgo adicional (**VULNERABLE, confirmado en local**): las funciones `SECURITY DEFINER` `platform_business_stats`, `platform_recent_activity`, `platform_business_export`, `platform_purge_business` y `notification_due_businesses` eran ejecutables por `vlux_app` **sin comprobar contexto** y devolvían (o purgaban) datos de cualquier negocio. Corrección: se renombran a `*_impl`, se retira su EXECUTE a `vlux_app` y se publican envolturas que exigen alcance `platform` o `worker` (`search_path` fijo, sin EXECUTE para PUBLIC/anon/authenticated).

## 2. Diseño de la corrección
- Contexto de negocio: `app.business_id` (ya existente). Nuevo **alcance** por transacción: `app.scope ∈ {auth, platform, webhook, worker}`, leído con `app_scope()`; solo `server/db.ts` lo fija (con `set_config(..., true)`, local a la transacción). `begin()` fija **siempre** ambos valores (vacíos si no aplican), de modo que un valor de sesión dejado en una conexión del Transaction Pooler no se hereda.
- Un alcance concede lectura/escritura mínima a lo que ese flujo necesita (login, resolución de token/invitación, webhooks, workers, Control Center). Una guardia estática en `tests/unit/scope-allowlist.test.ts` lista qué archivos pueden declarar cada alcance.
- Privilegios por columna: `vlux_app` ya no puede actualizar `business_id`, llaves ni hashes en las seis tablas con UPDATE; nunca puede borrar.

## 3. Riesgos que NO cierra 0016 (se declaran, no se ocultan)
- **R-1**: `vlux_app` puede ejecutar `set_config('app.scope', …)` por sí mismo. Una inyección SQL con ejecución arbitraria podría elegir su alcance. Mitigación real (propuesta, no implementada): credenciales de BD separadas para plataforma y para tenant.
- **R-2**: `staff_users` y `password_reset_tokens` son identidad global (un usuario puede pertenecer a varios negocios) y no se pueden aislar por RLS de negocio.
- **E-1**: INSERT abierto en `platform_audit_events` (bitácora de solo inserción; no permite leer ni modificar).
- Sin `FORCE ROW LEVEL SECURITY`: el dueño del esquema (`postgres`) sigue omitiendo RLS por diseño.

## 4. Revisión independiente
Un subagente de propósito general (no `msa-lud-dev`, ver informe privado) revisó el diff. Hallazgo alto A-1 (herencia de valores de sesión) **corregido y probado**; M-1 (restaurar respaldos pre-0016), M-3 (guardia estática débil), B-2, B-3 y B-6 **corregidos**; M-4 cubierto con pruebas adicionales; M-2 (optimizar una consulta) aplicado en `resolveCardToken`.
