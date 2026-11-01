# Átomos V0.3 · registro (MSA)

Base: rama `v0.3` desde `v0.2.2`. Commits: 9b5da67 (backend), 95d2423 (pantallas y E2E), 3db5a32 (revisión de seguridad, Wallet, respaldos, CI), más el commit de documentación.
Estados: **PASS** = probado y aprobado; **BLOCKED** = no se puede probar sin algo externo; **FAIL** = probado y falla (ninguno al cierre).

| # | Átomo | Archivos principales | Pruebas ejecutadas | Estado |
| -: | :- | :- | :- | :- |
| 01 | Auditoría | `docs/V03_AUDITORIA.md` | Línea base 20 + 58 PASS | PASS |
| 02 | Esquema V0.3 (migración no destructiva) | `db/migrations/0006_control_center.*`, `ops/grants.sql` | up/down/up local; aplicada en Supabase Preview; asesor de seguridad 0 avisos; `tablas sin RLS = 0` | PASS |
| 03 | Autenticación de administradores (contraseña + TOTP + recuperación + sesiones) | `server/totp.ts`, `server/services/platform-auth.ts` | Unitarias TOTP (RFC 6238, cifrado, manipulación); integración: alta, 2FA, anti-replay, bloqueo 2FA que no se reinicia, revocación | PASS |
| 04 | Control Center: rutas y aislamiento | `server/admin-routes.ts`, `server/app.ts` | Integración: dueño/empleado → 401; demo → 404 (HTTPS en Vercel); E2E J3/J4 | PASS |
| 05 | Resumen real vs demo | `server/services/platform.ts`, `src/admin/Dashboard.tsx` | E2E A3, I4; funciones SECURITY DEFINER solo conteos | PASS |
| 06 | Directorio y ficha con acciones | `src/admin/Businesses.tsx` | E2E I1–I3; suspender exige confirmación y motivo, corta sesiones y la página pública (integración); escribir el nombre se exige en la interfaz | PASS |
| 07 | Asistente de 4 pasos con creación atómica | `src/admin/Wizard.tsx`, `createBusinessFromWizard` | E2E A4–A9; integración: crea negocio + reglas + suscripción + invitación en una sola transacción; datos y logotipo inválidos se rechazan | PASS |
| 08 | Invitaciones seguras (dueño y empleado) | `server/services/invitations.ts`, `src/views/Invitation.tsx`, `src/views/Owner.tsx` | E2E B1–B3, D1–D2; integración: un solo uso, 72 h, 5 intentos, no sobrescribe contraseña, no degrada rol, dueño no reemplaza invitación de VLUX | PASS |
| 09 | Selector de negocio (multi-negocio) | `server/services/auth.ts`, `src/views/Login.tsx`, `src/App.tsx` | Integración: `choose` sin cookie, `switch` valida membresía | PASS |
| 10 | Workspaces y aislamiento entre negocios | RLS existente + `withTenant` | E2E J1–J2; integración cruzada | PASS |
| 11 | Suscripciones manuales (5 estados) | `plans`, `business_subscriptions`, `Settings.tsx` | Integración: cambio de estado registrado en bitácora; **no** suspende servicio | PASS |
| 12 | Flujo completo del criterio de éxito | `tests/e2e/v03-control-center.cjs` | E2E A–J local: 24 PASS / 0 FAIL | PASS |
| 13 | Google Wallet (preparación) | `server/wallet/*`, `docs/V03_GOOGLE_WALLET.md` | Unitarias: objetos, límites, JWT RS256 verificado con llave pública; E2E K | **BLOCKED** (sin cuenta de emisor) |
| 14 | Apple Wallet (evaluación) | `docs/V03_APPLE_WALLET.md`, `server/wallet/apple.ts` | Solo arquitectura; proveedor responde «no configurado» (unitaria) | PASS (evaluación) · emisión NOT TESTED |
| 15 | Respaldos | `.github/workflows/respaldo-diario.yml`, `ops/backup-verify.sh` | Restauración local aislada con esquema V0.3 verificada; **no** ejecutado contra Supabase | **BLOCKED** (merge a `main` + secretos) |
| 16 | Revisión de seguridad independiente | `docs/V03_SEGURIDAD.md` | `msa-lud-dev`: 0 altas, 3 medias y 8 bajas corregidas con pruebas; 1 de diseño aceptada | PASS |
| 17 | CI en 3 navegadores | `.github/workflows/pwa-navegadores.yml`, `pruebas.yml` | `Pruebas` en GitHub: success (run 41257322516). E2E V0.3 en Chromium/WebKit/Firefox: se dispara con el push de documentación | Ver estado en Actions |
| 18 | Despliegue Preview | Vercel interno y demo (target staging) | HTTPS: interno `/api/admin/bootstrap` → `{"needsBootstrap":true}`; demo → 404; demo `/api/public/businesses/cafe-demo-toluca` → 200 | PASS |

## Totales al cierre
- Unitarias: 27 PASS. Integración: 78 PASS.
- E2E local (Chromium): v021 14/14, v022 40/40, v02 29/29, v03 24 PASS + 1 BLOCKED (K).
- Teléfonos físicos y Safari real: NOT TESTED.
