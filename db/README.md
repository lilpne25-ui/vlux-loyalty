# Base de datos · VLUX Loyalty V0.2

PostgreSQL 16 (compatible con cualquier Postgres administrado ≥ 13: Supabase, Neon, Render, RDS).

## Roles
- **Dueño del esquema** (`DATABASE_ADMIN_URL`): ejecuta migraciones. No lo usa la app.
- **`vlux_app`** (`DATABASE_URL`): rol de la API. No es dueño de las tablas y es `NOBYPASSRLS`, así que Row Level Security siempre le aplica. No puede borrar filas ni modificar `stamp_events`/`audit_events`.

## Aislamiento entre negocios
1. Cada tabla de negocio tiene `business_id` y llaves foráneas **compuestas** `(id, business_id)`: una compra no puede apuntar a una tarjeta de otro negocio aunque el código tenga un error.
2. RLS en `reward_rules, customers, cards, visits, purchases, rewards, stamp_events, review_events, audit_events` con la política `business_id = current_business_id()`. La API fija `app.business_id` por transacción (`server/db.ts → withTenant`).
3. Tablas globales sin RLS (`businesses, staff_users, staff_memberships, staff_sessions, card_access_tokens`): la API solo las consulta por clave exacta (slug, correo o hash de token).

## Entidades
| Tabla | Para qué |
| :- | :- |
| `businesses` | Negocio: slug público (QR de mostrador), marca, giro, enlace de reseñas. |
| `staff_users` / `staff_memberships` | Personas del personal y su rol por negocio (`OWNER`, `EMPLOYEE`). |
| `staff_sessions` | Sesiones de personal (solo hash SHA-256 del token). |
| `reward_rules` | Regla versionada: sellos meta, modo (por compra / por artículo), tope, ventana de visita, recompensa. Una activa por negocio. |
| `customers` | Cliente de un negocio (nombre visible, contacto opcional, consentimiento, versión del aviso de privacidad). |
| `cards` | Tarjeta: código público opaco `XXXX-XXXX`, saldo de sellos (resumen del libro mayor), ciclo. |
| `card_access_tokens` | Acceso sin contraseña del cliente (hash de token de 256 bits). |
| `visits` | Ocasión en el negocio; agrupa compras dentro de la ventana de visita. |
| `purchases` | Compra registrada por personal, con llave de idempotencia única por negocio. |
| `stamp_events` | Libro mayor de sellos (solo inserción): `+` por compra, `−` por canje. |
| `rewards` | Recompensa desbloqueada; índice único parcial: máximo 1 disponible por tarjeta. |
| `review_events` | Invitación a reseña mostrada / enlace abierto / descartada. |
| `audit_events` | Bitácora de solo inserción. |

Se pospusieron `branches` (una sucursal por negocio en V0.2), `loyalty_memberships` (el cliente ya es por negocio) y `redemptions` (el canje vive en `rewards` + `stamp_events`).

## Comandos
```
npm run db:setup      # solo local: crea la base y habilita vlux_app
npm run db:migrate    # aplica migraciones pendientes (verifica checksum)
npm run db:status
npm run db:rollback   # revierte la última (BORRA datos: solo desarrollo)
```
Las migraciones aplicadas no se editan: un cambio de checksum detiene el proceso.

## Respaldos
En el proveedor administrado: activar respaldos diarios con retención ≥ 7 días y PITR si está disponible. Manual: `pg_dump --format=custom "$DATABASE_ADMIN_URL" > vlux-$(date +%F).dump` y `pg_restore --clean --if-exists -d "$DATABASE_ADMIN_URL" archivo.dump`. Ver `docs/MANUAL_OPERACION.md`.
