# Informe técnico · VLUX Loyalty V0.2

Fecha: 2026-10-31

## 1. Resultado
El hito comercial se cumple en entorno local: un cliente obtiene una tarjeta web real, un empleado registra la compra desde otro dispositivo y el dueño ve la misma operación en su panel, todo sobre PostgreSQL. Evidencia: `docs/evidencia/atomo10-e2e-tres-dispositivos.txt` (28/28 PASS) y capturas en `docs/evidencia/capturas/`.

## 2. Arquitectura
```
 Teléfono cliente ──┐                      ┌──────────── PostgreSQL 16 ─────────────┐
 Teléfono caja ─────┼── HTTPS ── Node 22 ──┤ rol vlux_app (sin BYPASSRLS)           │
 PC del dueño ──────┘   (Hono: API + SPA)  │ RLS por business_id, FK compuestas     │
                                           │ libro mayor de sellos y auditoría      │
                                           └────────────────────────────────────────┘
```
- **Frontend:** React 18 + TypeScript + Tailwind 3 (mismos componentes de V0.1), empaquetado con Vite 8. Rutas: `/`, `/n/:negocio`, `/t/:token`, `/acceso`, `/caja`, `/panel`.
- **Backend:** Hono 4 sobre Node 22, un solo proceso que sirve API y frontend. Validación con zod. Sin ORM: SQL parametrizado.
- **BD:** PostgreSQL con migraciones SQL reversibles. Ver `db/README.md`.
- **Sincronización:** consulta periódica (4–8 s) + al volver a la pestaña. Sin WebSockets.
- Decisión completa y alternativas (Next.js, Supabase): `docs/decisiones/ADR-001-arquitectura-v02.md`.

## 3. Modelo de dominio
| Concepto | Dónde vive | Regla |
| :- | :- | :- |
| Compra | `purchases` | La registra el personal; trae `item_count` y llave de idempotencia. |
| Visita | `visits` | Se abre con la primera compra; compras dentro de `visit_window_minutes` (120 por omisión) se agrupan en la misma visita. |
| Sello | `stamp_events` (+ `cards.stamp_balance`) | `per_purchase`: 1 por compra. `per_item`: 1 por artículo con tope. |
| Recompensa | `rewards` | Se desbloquea al llegar a la meta; máximo 1 disponible por tarjeta (índice único). El canje descuenta la meta y conserva el excedente. |
| Recurrencia | consulta | Tarjeta con 2 o más visitas. |

Las reglas son funciones puras en `shared/rules.ts` usadas por el servidor y probadas por separado.

## 4. API
| Método y ruta | Quién | Para qué |
| :- | :- | :- |
| `GET /api/public/businesses/:slug` | público | Marca y regla del negocio |
| `POST /api/public/businesses/:slug/register` | público (limitado por IP) | Alta de cliente y tarjeta; fija cookie de la tarjeta |
| `GET /t/:token` | portador del enlace | Guarda el acceso en otro teléfono |
| `GET /api/me/:slug/card` · `POST /api/me/:slug/review-events` · `POST /api/me/:slug/forget-device` | cliente (cookie) | Su tarjeta; eventos de reseña; olvidar este teléfono |
| `POST /api/staff/login` · `POST /api/staff/logout` · `GET /api/staff/me` | personal | Sesión |
| `GET /api/staff/business` · `POST /api/staff/cards/lookup` · `GET /api/staff/cards` · `GET /api/staff/cards/:id` | dueño o empleado | Identificar y consultar tarjetas |
| `POST /api/staff/cards/:id/purchases` · `POST /api/staff/rewards/:id/redeem` | dueño o empleado | Registrar compra; canjear |
| `GET /api/owner/dashboard\|customers\|activity\|staff` · `PUT /api/owner/program` · `POST/PATCH /api/owner/staff` · `GET …/customers/:id/export` · `POST …/customers/:id/anonymize` | solo dueño | Panel, configuración, equipo, derechos ARCO |
| `POST /api/platform/businesses` | equipo VLUX (token) | Alta de negocio y su dueño |

Errores con forma `{ error: { code, message } }`; códigos estables (`possible_duplicate`, `already_redeemed`, `invalid_credentials`…).

## 5. Integridad ante concurrencia
- Cada compra o canje abre transacción, bloquea la tarjeta (`SELECT … FOR UPDATE`) y aplica las reglas; el orden de bloqueo es siempre tarjeta → recompensa.
- Llave de idempotencia única por negocio: reintentos de red no duplican compras.
- Doble toque con llaves distintas en < 20 s → `409 possible_duplicate` y la caja pide confirmación.
- Probado: 10 solicitudes idénticas simultáneas → 1 compra; 10 canjes simultáneos desde 2 sesiones → 1 éxito; saldo de la tarjeta = suma del libro mayor.

## 6. Pruebas
| Tipo | Cantidad | Resultado | Archivo |
| :- | :- | :- | :- |
| Unitarias (reglas, seguridad) | 16 | 16 PASS | `tests/unit/` |
| Integración (API + PostgreSQL) | 36 | 36 PASS | `tests/integration/` |
| E2E 3 navegadores + cámara | 28 verificaciones | 28 PASS | `tests/e2e/v02-tres-dispositivos.cjs` |
| Regresión V0.1 (original y con Vite) | 22 + 22 | PASS | `docs/evidencia/atomo01-*` |

Lo que **no** se probó: teléfonos físicos (iPhone/Android), redes móviles reales, despliegue en la nube, carga con muchos negocios.

## 7. Despliegue recomendado (no ejecutado)
- App: un servicio Node en Render, Railway o Fly.io (o contenedor). `npm ci && npm run build && npm run db:migrate && npm start`.
- BD: PostgreSQL administrado (Supabase, Neon o Render) con respaldos diarios. Crear el rol `vlux_app` con contraseña propia y usarlo en `DATABASE_URL`.
- Variables: ver `.env.example`. `NODE_ENV=production` activa cookies `Secure`.
- Costo: un solo despliegue para todos los negocios; los precios exactos de cada proveedor deben cotizarse al momento de contratar (no se verificaron en esta sesión).

## 8. Deuda técnica conocida
- Límite de intentos en memoria (válido con una sola instancia).
- Sin recuperación de contraseña ni de tarjeta por correo/WhatsApp.
- Sin anulación de compras registradas por error (hoy solo queda en auditoría; propuesta V0.3).
- Lista de clientes sin paginar (hasta 500).
- `index.html` se lee al arrancar: reiniciar el proceso tras cada build (normal en un despliegue).
