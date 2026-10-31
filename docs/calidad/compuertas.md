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
