# Informe de pruebas de aislamiento · migración 0016

Entorno: PostgreSQL 17 (Docker local), rol `vlux_app` NOBYPASSRLS, tres negocios sintéticos A/B/C con dueños, empleados, clientes, tarjetas, compras, visitas y premios. **Sin datos del negocio real, sin Supabase Preview, sin despliegues.**

| Suite | Resultado |
|---|---|
| Unitarias | **79/79** |
| Integración completa (`--test-concurrency=1`) | **202/202** |
| De ellas, aislamiento SQL (`tenant-isolation.test.ts`) | 47/47 |
| De ellas, aislamiento vía API/IDOR (`tenant-isolation-api.test.ts`) | 7/7 |
| Guardia estática de alcances | 5/5 |
| Typecheck / build | OK / OK |
| E2E (v02, v021, v03, v042, v044, v045, v046) | PASS (ejecutadas antes de las últimas correcciones menores; la regresión de integración se repitió después) |
| Migración arriba→abajo→arriba, y SQL "pegable" sobre una base 0015 | OK; checksum registrado = checksum del archivo |
| Código nuevo sobre esquema 0015 | **148/148** (se excluyen las 54 de aislamiento, que exigen 0016). Las 3 que antes fallaban eran afirmaciones propias de 0016 y ahora comprueban según la versión del esquema |
| Código anterior (rc.1) sobre esquema 0016 | **29/148**: 119 fallan por RLS → 0016 solo después de desplegar el código (`DEPLOY_0016_PLAN.md`) |
| Simulacro de respaldo cifrado + restauración aislada sobre 0016 (`run-drill.sh`, `evidencia/…/08-…`) | OK; funcional 13/13; conteos comparados por nombre de tabla |
| Revisión de solo lectura con el agente `msa-lud-dev` (ejecutado) | sin hallazgos ALTOS; 1 MEDIO corregido (cobertura de columnas en la verificación) |

**Rojo→verde:** con 0015 (sin 0016) las pruebas negativas fallan (A leía/actualizaba filas de B en las nueve tablas y las funciones de plataforma devolvían todo); con 0016 pasan. Evidencia en `evidencia/tenant-isolation/01…07`.

**Cobertura:** lectura cruzada (sin contexto, con A viendo B, alcance inventado), escritura cruzada (`WITH CHECK`, mover filas de negocio, UPDATE sin efecto), sin DELETE, columnas protegidas, cada alcance limitado a lo suyo, funciones `SECURITY DEFINER` con y sin alcance, contexto no filtrado entre transacciones en una conexión única del pool (incluido un `set_config` de sesión dejado a propósito), 40 solicitudes HTTP mezcladas A/B, IDOR sobre invitaciones, personal, clientes, tarjetas, enlaces, sesiones, cambio de negocio y rutas de plataforma.

**NOT TESTED:** 0016 en Supabase Preview; latencia remota (en local `q()` no añade costo medible, ver evidencia 07); dispositivos físicos; Google Wallet (BLOCKED).
