# Átomos V0.2.2 · registro (MSA)

Base: rama `v0.2.2` desde `v0.2.1` (9ba9af1). Commits: 0c7422a (PWA) y e7a88c2 (correcciones de la revisión msa-lud-dev), más el commit de documentación.

## Átomo 01 · Acceso sin cuenta de Vercel
- **Objetivo:** que un cliente abra su tarjeta sin cuenta de Vercel, sin desproteger el entorno interno.
- **Problema:** el proyecto interno tiene Vercel Authentication en todos los despliegues.
- **Archivos modificados:** `docs/ACCESO_VERCEL_V022.md`, `tests/e2e/v022-demo-publica.cjs`. Configuración en Vercel: proyecto nuevo `vlux-loyalty-demo`.
- **Solución implementada:** proyecto demo público aparte (decisión de Vlux), solo Preview, sin token de administración, con la base del Preview (solo datos sintéticos). Proyecto interno sin cambios.
- **Pruebas ejecutadas:** HTTPS desde Vercel Sandbox, H1 (demo 200 sin login) y H2 (interno 302 a login de Vercel).
- **Resultado:** PASS.
- **Riesgos:** la demo comparte base con el Preview; nunca cargar datos reales ahí.
- **Estado:** Completado.

## Átomo 02 · PWA real
- **Objetivo:** guardar la tarjeta en la pantalla de inicio de iPhone y Android.
- **Problema:** V0.2.1 no tenía manifiesto ni service worker; iOS no permite instalación automática.
- **Archivos modificados:** `server/pwa.ts`, `server/app.ts`, `src/lib/pwa.ts`, `src/components/SaveCard.tsx`, `src/views/Customer.tsx`, `src/main.tsx`, `src/sw/sw-template.js`, `vite.config.ts`, `scripts/build-vercel.mjs`, `server/index.ts`, `src/styles.css`.
- **Solución implementada:** manifiesto dinámico por negocio, service worker propio, diálogo nativo en Android (`beforeinstallprompt`), detección de instalación (`appinstalled` y `display-mode`), guía paso a paso en iPhone y para otros navegadores.
- **Pruebas ejecutadas:** E2E P01–P17 en Chromium, WebKit y Firefox; H9–H11 por HTTPS (Chromium sin errores de instalabilidad).
- **Resultado:** PASS en navegadores automatizados. iPhone y Android físicos: NOT TESTED.
- **Riesgos:** comportamiento real de iOS sin confirmar.
- **Estado:** Completado (pendiente prueba física).

## Átomo 03 · Personalización por negocio
- **Objetivo:** nombre, nombre corto, ícono, colores y splash por negocio.
- **Problema:** un manifiesto estático no distingue negocios.
- **Archivos modificados:** `server/pwa.ts` (manifiesto e íconos PNG generados sin dependencias), `src/lib/pwa.ts` (`applyBusinessAppHead`).
- **Solución implementada:** `id` y `scope` por negocio, `theme_color`/`background_color` = color del negocio, íconos 192, 512, maskable 512 y `apple-touch-icon` 180 con la inicial del negocio.
- **Pruebas ejecutadas:** integración (manifiesto e íconos), E2E P-series, H5–H6.
- **Resultado:** PASS.
- **Riesgos:** no se promete que todos los navegadores traten cada negocio como app independiente.
- **Estado:** Completado.

## Átomo 04 · Persistencia de la tarjeta tras instalar
- **Objetivo:** que la app instalada abra la tarjeta del cliente.
- **Problema:** no se puede asumir que la app de iOS comparta cookies con Safari.
- **Archivos modificados:** `db/migrations/0005_vinculacion_pwa.*`, `server/services/pairing.ts`, `server/app.ts`, `ops/grants.sql`, `src/components/SaveCard.tsx`.
- **Solución implementada:** código de 8 dígitos de un solo uso (15 min, solo hash, RLS por negocio) o enlace personal; recuperación con "Usar mi enlace personal". Cookie HttpOnly nueva para el dispositivo; no se revoca la de Safari.
- **Pruebas ejecutadas:** 9 pruebas de integración V0.2.2; E2E A1–A5, B1–B5; H13–H14 por HTTPS.
- **Resultado:** PASS.
- **Riesgos:** ver hallazgo 3 del informe de seguridad (cupo por negocio).
- **Estado:** Completado.

## Átomo 05 · Seguridad del service worker
- **Objetivo:** no cachear nada privado y no operar sin conexión.
- **Problema:** un SW mal configurado puede guardar respuestas privadas o mostrar datos viejos.
- **Archivos modificados:** `src/sw/sw-template.js`, `vite.config.ts`, `scripts/build-vercel.mjs`, `server/index.ts`, `src/components/SaveCard.tsx` (`OfflineNotice`).
- **Solución implementada:** solo `index.html` y `/assets`; exclusión de `/api`, `/t`, `/restablecer`, `/sw.js`; `/sw.js` sin caché; actualización por versión con limpieza de cachés viejas; pantalla sin conexión sin sellos inventados.
- **Pruebas ejecutadas:** E2E S1–S4, U1–U4; H7, H8, H15 por HTTPS.
- **Resultado:** PASS.
- **Riesgos:** si falla un archivo precargado, el SW no se instala (la app sigue funcionando).
- **Estado:** Completado.

## Átomo 06 · UX "Guarda tu tarjeta"
- **Objetivo:** sección clara, sin ventanas invasivas.
- **Problema:** —
- **Archivos modificados:** `src/components/SaveCard.tsx`, `src/views/Customer.tsx`.
- **Solución implementada:** título "Guarda tu tarjeta", texto "Ten tus recompensas siempre a la mano.", botón "Agregar a mi teléfono", subtexto "Sin descargar aplicaciones de la tienda."; se oculta al instalar; aclara que no es Apple Wallet ni Google Wallet.
- **Pruebas ejecutadas:** E2E con capturas en `docs/evidencia/capturas/v022-*`.
- **Resultado:** PASS.
- **Riesgos:** ninguno nuevo.
- **Estado:** Completado.

## Átomo 07 · Pruebas automáticas
- **Objetivo:** PWA 1–10 y producto 1–12 en tres motores.
- **Problema:** WebKit y Firefox no están instalados en el contenedor de desarrollo.
- **Archivos modificados:** `tests/integration/v022.test.ts`, `tests/e2e/v022-pwa.cjs`, `.github/workflows/pwa-navegadores.yml`.
- **Solución implementada:** E2E en GitHub Actions con matriz chromium/webkit/firefox.
- **Pruebas ejecutadas:** 20 unitarias + 58 de integración (local); E2E 40/40 por navegador (CI run 41239773278) y Chromium local tras las correcciones; regresión V0.2.1 29/29 y 14/14.
- **Resultado:** PASS. WebKit automatizado no equivale a un iPhone físico.
- **Riesgos:** —
- **Estado:** Completado.

## Átomo 08 · Pruebas HTTPS en Vercel
- **Objetivo:** escenario Cliente A / Empleado B / Dueño C por HTTPS.
- **Problema:** el contenedor no llega a *.vercel.app; la parte de personal requiere la contraseña demo dentro del entorno de prueba.
- **Archivos modificados:** `tests/e2e/v022-demo-publica.cjs`, `docs/evidencia/v022-https-demo-vercel.txt`.
- **Solución implementada:** Vercel Sandbox con Chromium contra la demo pública: parte del cliente completa.
- **Pruebas ejecutadas:** H1–H15.
- **Resultado:** 15/15 PASS (Cliente A). Empleado B y Dueño C por HTTPS: **BLOCKED** (credencial no materializable en esta sesión). El escenario completo sí pasó en el emulador local en 3 navegadores.
- **Riesgos:** la operación de caja y panel en Vercel solo está probada en V0.2.1 (Preview protegido) y localmente en V0.2.2.
- **Estado:** Parcial. Procedimiento reproducible en `docs/ACCESO_VERCEL_V022.md`.

## Átomo 09 · Respaldos Supabase
- **Objetivo:** conocer y probar el estado real.
- **Problema:** Supabase Free no tiene respaldos; el workflow propio no corre.
- **Archivos modificados:** `docs/RESPALDOS.md`, `docs/evidencia/v022-respaldo-restauracion-local.txt`.
- **Solución implementada:** verificación del estado real y restauración de prueba en una base aislada local.
- **Pruebas ejecutadas:** `ops/backup-verify.sh` local: VERIFICADO.
- **Resultado:** mecanismo verificado; respaldo del Preview **NO OPERATIVO**.
- **Riesgos:** pérdida de datos del Preview (sintéticos) si Supabase falla.
- **Estado:** Bloqueado en lo que requiere a Vlux: fusionar a `main` y crear los secretos.

## Átomo 10 · Guía de dispositivos físicos
- **Objetivo:** lista para iPhone y Android con estados PASS/FAIL/BLOCKED/NOT TESTED.
- **Archivos modificados:** `docs/CHECKLIST_DISPOSITIVOS_FISICOS.md`.
- **Solución implementada:** 12 pruebas de producto + 16 de PWA, todas NOT TESTED.
- **Resultado:** lista lista; ninguna prueba física ejecutada.
- **Estado:** Completado (documento).
