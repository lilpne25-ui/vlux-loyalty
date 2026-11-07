# Informe de pruebas de aislamiento · migración 0016

Entorno: PostgreSQL 17 (Docker local), rol `vlux_app` NOBYPASSRLS, tres negocios sintéticos A/B/C con dueños, empleados, clientes, tarjetas, compras, visitas y premios. **Sin datos de Odalex, sin Supabase Preview, sin despliegues.**

| Suite | Resultado |
|---|---|
| Unitarias | **76/76** |
| Integración completa (`--test-concurrency=1`) | **202/202** |
| De ellas, aislamiento SQL (`tenant-isolation.test.ts`) | 47/47 |
| De ellas, aislamiento vía API/IDOR (`tenant-isolation-api.test.ts`) | 7/7 |
| Guardia estática de alcances | 5/5 |
| Typecheck / build | OK / OK |
| E2E (v02, v021, v03, v042, v044, v045, v046) | PASS (ejecutadas antes de las últimas correcciones menores; la regresión de integración se repitió después) |
| Migración arriba→abajo→arriba, y SQL "pegable" sobre una base 0015 | OK; checksum registrado = checksum del archivo |
| Código nuevo sobre esquema 0015 (orden de despliegue) | 145/148, con 3 fallos esperados y específicos de 0016 |

**Rojo→verde:** con 0015 (sin 0016) las pruebas negativas fallan (A leía/actualizaba filas de B en las nueve tablas y las funciones de plataforma devolvían todo); con 0016 pasan. Evidencia en `evidencia/tenant-isolation/01…07`.

**Cobertura:** lectura cruzada (sin contexto, con A viendo B, alcance inventado), escritura cruzada (`WITH CHECK`, mover filas de negocio, UPDATE sin efecto), sin DELETE, columnas protegidas, cada alcance limitado a lo suyo, funciones `SECURITY DEFINER` con y sin alcance, contexto no filtrado entre transacciones en una conexión única del pool (incluido un `set_config` de sesión dejado a propósito), 40 solicitudes HTTP mezcladas A/B, IDOR sobre invitaciones, personal, clientes, tarjetas, enlaces, sesiones, cambio de negocio y rutas de plataforma.

**NOT TESTED:** 0016 en Supabase Preview; latencia remota (en local `q()` no añade costo medible, ver evidencia 07); dispositivos físicos; Google Wallet (BLOCKED).
