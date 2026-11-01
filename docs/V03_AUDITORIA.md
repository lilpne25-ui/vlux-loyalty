# Auditoría inicial · V0.3 (Fase 1)

Fecha: 2026-11-01. Base auditada: rama `v0.2.2` (último commit antes de `v0.3`). Pruebas de línea base: **20 unitarias + 58 de integración, todas PASS** antes de tocar código.

## 1. Lo que ya existía y se conservó
- React + TypeScript + Vite; API Hono; Vercel (Build Output API v3); Supabase PostgreSQL con `vlux_app` (NOBYPASSRLS) y RLS en todas las tablas.
- Sesiones por cookie HttpOnly, roles OWNER/EMPLOYEE revalidados en servidor, bitácora por negocio (`audit_events`).
- Motor de sellos (visita, compra, canje, anulación) con idempotencia y bloqueo transaccional.
- PWA por negocio (V0.2.2), paneles de dueño y caja.

## 2. Hallazgos que motivaron V0.3
| # | Hallazgo | Riesgo | Cómo se resolvió en V0.3 |
| -: | :- | :- | :- |
| 1 | El login del personal elegía **en silencio el primer negocio** si el correo tenía varias membresías | Operar el negocio equivocado | Login devuelve `choose` con la lista; selector al entrar y en la barra superior (`/api/staff/switch`) |
| 2 | `createBusiness` (API de plataforma) **reutilizaba o sobrescribía** la cuenta de un dueño existente con una contraseña temporal | Robo de cuenta / pérdida de acceso | Alta por invitación; si el correo ya existe se vincula **con su contraseña actual**; nunca se sobrescribe (prueba de integración comprueba que el hash no cambia) |
| 3 | La administración de la plataforma usaba **un token compartido** (`PLATFORM_ADMIN_TOKEN`) enviado como bearer | Sin identidad, sin 2FA, sin revocación | Cuentas `platform_admins` con contraseña + TOTP obligatorio, sesiones revocables, bitácora global. La API heredada queda apagada (`PLATFORM_LEGACY_API`) |
| 4 | Empleados dados de alta con **contraseña temporal** que el dueño veía y dictaba | Contraseñas compartidas por WhatsApp | Invitación por enlace de un solo uso (72 h). La contraseña temporal sigue como opción secundaria |
| 5 | Sin noción de **suscripción o plan** | No hay control comercial | `plans` + `business_subscriptions` con estados manuales; nunca suspenden solos |
| 6 | Sin vista global de negocios ni métricas de plataforma | Operación a ciegas | Control Center con resumen real/demo vía funciones SECURITY DEFINER que solo devuelven conteos |
| 7 | Respaldos **no operativos** (workflow fuera de `main`, secretos sin verificar) | Pérdida de datos | Workflow reforzado; sigue NO OPERATIVO hasta merge a `main` + secretos + ejecución verificada (ver `RESPALDOS.md`) |

## 3. Decisiones de alcance
- No se reconstruyó nada: V0.3 agrega la migración `0006_control_center` (no destructiva) y módulos nuevos.
- No hay borrado de negocios ni operaciones destructivas en el Control Center.
- Correo: no hay proveedor; los enlaces se entregan a mano y la interfaz lo dice.
- Wallet: solo preparación (Google) y evaluación (Apple), después del Control Center.
