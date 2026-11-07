# Plan de transición Preview → Producción independiente · 2026-11-07

**Solo procedimiento. No se contrató nada, no se creó Production, no hay merge a `main`, no se migró ningún dato, no se tocó DNS.** Objetivo: *VLUX Loyalty 1.0 — Controlled Commercial Pilot*.

## Arquitectura destino (ver `PRODUCTION_ARCHITECTURE.md`)
Proyectos **nuevos** y separados de Preview: Supabase Pro (proyecto `vlux-loyalty-prod`, región elegida con privacidad en mente) + Vercel Pro (proyecto `vlux-loyalty-prod`, rama `main`/tag `v1.0.0`). Variables y credenciales **nuevas** (no se reutiliza nada de Preview): `DATABASE_URL` (rol `vlux_app`), `DATABASE_ADMIN_URL` solo en la máquina del operador y en `vlux-ops`, `ADMIN_SECRETS_KEY`, VAPID/SMTP si se activan. Data API de Supabase desactivada. Dominio comercial con DNS propio (cambio de DNS: pendiente de autorización). Costo estimado ≈ USD 45/mes (`FINANCIAL_MODEL.md`).

## Secuencia
| # | Paso | Compuerta |
|---|---|---|
| 0 | Autorización del propietario: planes de pago, dominio, región | decisión de Vlux |
| 1 | Cerrar `ODALEX_DATA_PROTECTION_PLAN.md` §2 (base legal, encargado, copia) y aprobar aviso de privacidad | abogado |
| 2 | Crear proyecto Supabase Pro vacío; aplicar 0001→0015 con `scripts/migrate.ts`; `ops/grants.sql`; verificar 0 avisos del asesor y RLS 34/34 | `db:status` + asesor |
| 3 | Crear proyecto Vercel Pro; variables nuevas; desplegar `v1.0.0`; correr el E2E contra el despliegue | E2E verde |
| 4 | Apuntar `vlux-ops` a **producción** (secretos propios), un respaldo manual y simulacro → **BACKUP PRODUCTION VERIFIED** | restauración verificada |
| 5 | Monitor externo (gratuito) + alertas + runbook (`RUNBOOK.md`) | prueba de alerta |
| 6 | Pruebas físicas (`DEVICE_TESTS.md`, 27) | 27/27 |
| 7 | **Migración de datos del negocio real**, solo con autorización escrita: dump selectivo por `business_id` (no `pg_dump` completo de Preview), cifrado; carga en Producción; verificación de conteos y saldos; **no** cargar demos ni registros de origen desconocido | conteos == origen; autorización firmada |
| 8 | Congelar Preview (modo solo lectura o suspender el negocio **con permiso**); conservar la copia cifrada 30 días; borrar Preview solo después de confirmar | propietario |
| 9 | Cambio de DNS y apertura del piloto | autorización |

## Cómo migrar un solo negocio sin mezclar
Orden por dependencias de FK: `businesses` → `staff_users` (solo los de ese negocio) → `staff_memberships` → `reward_rules` → `customers` → `cards` → `card_access_tokens` → `visits` → `purchases` → `rewards` → `stamp_events` → `business_subscriptions` → `audit_events`. Reglas: filtrar siempre por `business_id`; regenerar sesiones (no migrarlas); tokens de tarjeta: migrarlos (ya son hashes) para que los QR/enlaces entregados sigan funcionando, o reemitirlos con aviso al cliente; comparar hash por tabla como en `RESTORE_TEST_REPORT.md`.

## Riesgos
Decidir cuál de los dos registros de negocio es el definitivo antes del paso 7; contactos de origen desconocido en el mismo proyecto; diferencias Supabase↔PostgreSQL estándar no cubiertas por la prueba sintética; RTO real desconocido hasta ensayar una restauración en un proyecto Supabase nuevo.
