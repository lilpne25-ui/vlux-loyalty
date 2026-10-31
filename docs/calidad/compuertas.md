# Compuertas de calidad por átomo · VLUX Loyalty V0.2

Cada átomo se cierra con la misma lista: compila, funciona lo intervenido, pruebas relevantes, sin regresiones evidentes, seguridad revisada, cambio reversible (commit propio) y documentación actualizada. Los resultados citados están en `docs/evidencia/`.

---
## Átomo 01 · Preparación del proyecto
- **Objetivo:** base reproducible antes de cambios funcionales.
- **Archivos modificados:** `package.json`, `package-lock.json`, `vite.config.ts`, `index.html`, `tsconfig.json`, `postcss.config.cjs`, `tailwind.config.cjs` (renombrado), `src/main.tsx` (importa CSS), `.gitignore`; V0.1 original copiado a `legacy/v01/`.
- **Implementación:** repositorio Git con commit y tag `v0.1-baseline` del código tal como se entregó; dependencias fijadas con versión exacta; Vite como empaquetador; TypeScript estricto.
- **Pruebas ejecutadas:** build original con esbuild + 22 escenarios Playwright de V0.1 (`atomo01-baseline-v01-e2e.txt`): 22 PASS, 0 FAIL. Mismos 22 escenarios contra el build de Vite (`atomo01-v01-con-vite-e2e.txt`): 22 PASS, 0 FAIL, sin errores de consola. `tsc` estricto sin errores.
- **Resultado:** la app original compila y corre igual con la nueva cadena.
- **Errores:** ninguno. Hallazgo: V0.1 no tenía `package.json` propio (se llamaba "scratchpad") ni lockfile; corregido.
- **Riesgos pendientes:** ninguno para este átomo.
- **Estado:** PASS

---
## Átomo 02 · Modelo de fidelización (compra, visita, sello, recompensa)
- **Objetivo:** dejar de contar cada sello como visita.
- **Archivos modificados:** `shared/rules.ts` (nuevo), `tests/unit/rules.test.ts` (nuevo).
- **Implementación:** reglas puras: `stampsForPurchase` (modo por compra o por artículo con tope), `isSameVisit` (ventana configurable, 120 min por omisión), `shouldUnlockReward`, `balanceAfterRedemption`, `validateRules` y `simulate`. El servidor usa estas mismas funciones (Átomo 05), así que no hay dos versiones de la regla.
- **Pruebas ejecutadas:** `npm run test:unit`: 13 PASS / 0 FAIL, incluye "2 cafés en una compra = 2 sellos y 1 visita" y "2 compras en la misma ventana = 1 visita".
- **Resultado:** las métricas pueden distinguir compras, visitas, sellos, recompensas y recurrencia. La verificación de métricas con datos persistidos queda en los Átomos 05 y 08.
- **Errores:** ninguno.
- **Riesgos pendientes:** la ventana de visita es una aproximación (no hay POS). Documentado para el negocio.
- **Estado:** PASS

---
## Átomo 03 · Base de datos real
- **Objetivo:** PostgreSQL como fuente de verdad en lugar de `localStorage`.
- **Archivos modificados:** `db/migrations/0001_init.up.sql` y `.down.sql`, `db/README.md`, `scripts/migrate.ts`, `scripts/db-setup-local.ts`, `server/config.ts`, `server/db.ts`, `.env.example`, `tests/integration/schema.test.ts`.
- **Implementación:** 14 tablas (ver `db/README.md`), UUID, llaves foráneas compuestas por negocio, `CHECK` de dominio, `created_at/updated_at` con trigger, RLS por negocio, rol de app con permisos mínimos, libro mayor y auditoría de solo inserción, índice único parcial de 1 recompensa disponible por tarjeta. Migrador con checksum y reversa.
- **Pruebas ejecutadas:** `db:migrate → db:rollback → db:migrate` en local (OK). `npm run test:integration`: 6 PASS / 0 FAIL (persistencia y lectura desde otra sesión de BD, RLS sin negocio, RLS cruzado lectura/escritura, FK compuesta, saldo negativo, doble premio disponible, auditoría inmutable). `tsc` sin errores.
- **Resultado:** un cliente y su tarjeta persisten en PostgreSQL y se recuperan desde una sesión independiente.
- **Errores:** ninguno.
- **Riesgos pendientes:** en Supabase el rol `vlux_app` debe crearse con su contraseña desde el panel (o con `db:setup` adaptado); RLS depende de que la API use siempre `withTenant`.
- **Estado:** PASS

---
## Átomo 04 · Autenticación y autorización
- **Objetivo:** proteger las operaciones del negocio; roles validados en el servidor.
- **Archivos modificados:** `server/app.ts`, `server/security.ts`, `server/errors.ts`, `server/ratelimit.ts`, `server/validation.ts`, `server/services/auth.ts`, `server/services/businesses.ts`, `server/services/customers.ts`, `tests/integration/helpers.ts`, `tests/integration/auth.test.ts`, `tests/unit/security.test.ts`.
- **Implementación:** login de personal con scrypt y mensaje genérico (no revela si el correo existe), bloqueo de 15 min tras 5 fallos, sesión opaca de 12 h en cookie `HttpOnly; SameSite=Lax` (+`Secure` en producción) con hash en BD; la membresía se revalida en cada solicitud (desactivar = acceso cortado al instante). Roles `OWNER`/`EMPLOYEE` por middleware. Cliente sin contraseña: token de 256 bits en cookie `HttpOnly` por negocio y enlace personal `/t/<token>` para otro teléfono. CSRF: solo JSON + verificación de `Origin`. Alta de negocios solo con token de plataforma (comparación en tiempo constante). Validación de entradas con zod.
- **Pruebas ejecutadas:** 11 pruebas de integración + 3 unitarias de seguridad, todas PASS (`docs/evidencia/atomos-04-05-pruebas.txt`). Incluye: empleado → 403 en todo `/api/owner/*`; empleado de B → 404 sobre tarjeta de A aun conociendo su UUID; sesión copiada tras logout → 401; cliente → 401 en caja.
- **Resultado:** un empleado no puede acceder al panel del dueño ni modificar información de otro negocio.
- **Errores:** ninguno.
- **Riesgos pendientes:** no hay recuperación de contraseña ni de tarjeta por correo/WhatsApp (requiere proveedor de envío); límite de solicitudes en memoria (1 instancia).
- **Estado:** PASS

---
## Átomo 05 · API de sellos y recompensas
- **Objetivo:** operaciones seguras e íntegras desde el servidor.
- **Archivos modificados:** `server/services/loyalty.ts`, `server/services/cards.ts`, `server/services/owner.ts`, `tests/integration/loyalty.test.ts`.
- **Implementación:** identificación por QR/código (solo identifica), registro de compra que crea o reutiliza la visita, sellos según regla, libro mayor `stamp_events`, desbloqueo automático, canje autorizado. Cada operación bloquea la tarjeta (`FOR UPDATE`) dentro de una transacción con RLS. Llave de idempotencia única por negocio. Protección de doble toque: 2a compra en < 20 s con otra llave pide confirmación explícita. Índice único "1 recompensa disponible por tarjeta" como red de seguridad en BD.
- **Pruebas ejecutadas:** 15 pruebas de integración PASS, entre ellas: 10 solicitudes simultáneas con la misma llave → 1 compra; 10 canjes simultáneos desde 2 dispositivos → 1 éxito y 9 `already_redeemed`; compras + canje concurrentes → saldo = libro mayor; 2 cafés = 2 sellos y 1 visita (con BD); misma visita no suma visitas; visita otro día = recurrente; el cliente no puede sellarse.
- **Resultado:** el sistema mantiene la integridad de los saldos ante operaciones duplicadas y concurrentes.
- **Errores:** ninguno.
- **Riesgos pendientes:** la ventana de visita (120 min) es configurable pero no hay validación con caja real; no hay anulación de compras erróneas (propuesta para V0.3).
- **Estado:** PASS

---
## Átomo 06 · Sincronización entre dispositivos
- **Objetivo:** cliente, empleado y dueño comparten datos consistentes desde el backend.
- **Archivos modificados:** `src/lib/api.ts`, `src/lib/usePolling.ts`, `src/lib/router.ts`, `src/App.tsx`, `src/views/Customer.tsx`, `src/views/Employee.tsx`, `src/views/Owner.tsx`, `tests/e2e/v02-tres-dispositivos.cjs`.
- **Implementación:** consulta periódica (cliente 4 s, caja 5 s, panel 8 s) y al volver a la pestaña. Se eliminó el estado compartido en `localStorage`; solo queda memoria de interfaz (qué sello ya se animó).
- **Pruebas ejecutadas:** E2E con 3 contextos de navegador independientes (cookies y almacenamiento separados) contra servidor y PostgreSQL reales: el sello registrado en el teléfono del empleado apareció en el teléfono del cliente en ~2.3 s sin recargar y en el panel del dueño. Un cuarto contexto abrió la misma tarjeta con el enlace personal.
- **Resultado:** PASS. Nota honesta: son contextos aislados de Chromium en una máquina, no tres teléfonos físicos; la prueba en dispositivos reales queda en el manual del piloto.
- **Riesgos pendientes:** el polling multiplica solicitudes por pestaña abierta; con ~100 clientes simultáneos por negocio sigue siendo bajo, revisar al escalar.
- **Estado:** PASS

---
## Átomo 07 · QR operativo
- **Objetivo:** registrar e identificar clientes por QR.
- **Archivos modificados:** `src/lib/qr.ts` (cámara en vivo), `src/lib/format.ts`, `server/security.ts` (`parseScannedCode`), `src/views/Employee.tsx`, `src/views/Owner.tsx` (QR imprimible).
- **Implementación:** QR del negocio → `/n/<slug>` (cartel imprimible en el panel). QR de tarjeta → `/caja?tarjeta=XXXX-XXXX` (identificador opaco, sin datos personales; abre la caja si se escanea con la cámara del teléfono). Cámara en vivo con `getUserMedia` + `BarcodeDetector` o jsQR; respaldo por foto; captura manual; códigos inválidos → 422, inexistentes → 404.
- **Pruebas ejecutadas:** E2E "07 empleado identifica la tarjeta con la cámara en vivo" con video de cámara simulado que contiene el QR real generado por la tarjeta: PASS. Unitarias de `parseScannedCode`: PASS.
- **Resultado:** PASS.
- **Riesgos pendientes:** probar en iPhone (Safari) y Android reales; la cámara exige HTTPS en producción.
- **Estado:** PASS

---
## Átomo 08 · Panel real del dueño
- **Objetivo:** dashboard sobre operaciones persistidas de su propio negocio.
- **Archivos modificados:** `src/views/Owner.tsx`, `server/services/owner.ts`, `src/views/ForBusiness.tsx`, `src/lib/vertical.ts`, `src/components/ui.tsx`, `src/components/LoyaltyCard.tsx`, `src/styles.css`.
- **Implementación:** 8 indicadores reales (clientes, visitas, compras, sellos, recurrentes, recompensas desbloqueadas, canjes, invitaciones a reseña), gráfica visitas vs compras en hora de CDMX, recurrencia, premios por entregar. Se quitó el interruptor de datos de ejemplo y el "modo de prueba". Configuración: giro, modo de sellos, tope, ventana de visita, colores, recompensa. Equipo (alta/baja de empleados). QR del mostrador. Textos por giro (sin "café/bebida" fijo); el grano de café solo se dibuja en cafeterías. Etiquetas de KPI ya no se cortan en móvil.
- **Pruebas ejecutadas:** E2E: panel muestra `{clientes 1, visitas 1, compras 8, sellos 8, desbloqueadas 1, canjes 1, recurrentes 0}` tras el recorrido; otro negocio ve 0 clientes; sin scroll horizontal a 390 px en cliente, caja y panel. Barbería demo sin menciones a café/bebida.
- **Resultado:** el dashboard refleja datos reales de su propio establecimiento.
- **Riesgos pendientes:** la lista de clientes trae hasta 500 filas sin paginar.
- **Estado:** PASS
