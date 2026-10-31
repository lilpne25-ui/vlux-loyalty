# Compuertas por átomo · V0.2.1 (Vercel + Supabase)

Fecha: 2026-10-31. Rama `v0.2.1` sobre la etiqueta `v0.2.0`. Formato por átomo: Objetivo · Riesgo · Archivos · Pruebas · Evidencia · **Resultado**.

| # | Objetivo | Riesgo principal | Archivos | Pruebas / evidencia | Resultado |
| :- | :- | :- | :- | :- | :- |
| 01 | Hono en Vercel Functions sin servidor persistente; rutas `/api/*`, `/t/*`, estáticos, fallback SPA, encabezados y caché | Que el fallback capture la API o que se cacheen respuestas privadas | `server/vercel.ts`, `scripts/build-vercel.mjs`, `scripts/preview-vercel-output.mjs` | Emulador de rutas `config.json`: E2E 29/29 y 14/14; prueba de encabezados de caché | **PASS (local/emulador)** |
| 02 | Supabase como Postgres administrado: migraciones 0002–0004, rol mínimo, RLS, Data API | RLS desactivado por el dueño del esquema; Data API exponiendo tablas | `db/migrations/0002..0004`, `ops/grants.sql` | Migraciones ida/vuelta (`v021-migraciones-ida-vuelta.txt`); en Supabase: rol sin super ni BYPASSRLS, 0 tablas sin RLS, 0 grants a anon/authenticated, asesor 0 advertencias | **PASS** |
| 03 | Pooling transaccional seguro | Fuga del negocio entre peticiones; agotar conexiones; reintentos que dupliquen sellos | `server/db.ts`, `server/pgssl.ts`, `server/config.ts` | 60 transacciones intercaladas sin fuga; reintento solo al conectar; rol inseguro rechazado en producción | **PASS (local)**; conexión real al pooler pendiente de 06 |
| 04 | Rate limit compartido + revisión de seguridad | IP falsificable; tokens en logs; CSRF | `server/ratelimit.ts`, `server/app.ts` | Límite compartido entre 2 procesos; tokens en `#fragmento`; `INFORME_SEGURIDAD_V021.md` | **PASS** |
| 05 | Variables de entorno: runtime vs administración | `DATABASE_ADMIN_URL` en Vercel; URLs de Preview apuntando a otro dominio | `.env.example`, proyecto Vercel | Variables de Preview revisadas: solo `vlux_app` vía pooler; `PUBLIC_BASE_URL` vacía en Preview | **PASS** |
| 06 | Preview privado en Vercel | Desplegar en Production o público | Proyecto `vlux-loyalty` (Vercel Authentication en todo, Production bloqueado) | Un intento que Vercel marcó como Production se canceló por el bloqueo. Falta conectar el repo privado a Vercel | **BLOCKED** (acción de Vlux: conectar GitHub en Vercel) |
| 07 | Repetir todas las pruebas; 3 dispositivos contra el Preview en HTTPS; checklist físico | Declarar pruebas no hechas | `tests/`, `docs/CHECKLIST_DISPOSITIVOS_FISICOS.md` | Local: 20 unitarias + 49 integración PASS; emulador: E2E 29 + 14 PASS. Contra el Preview HTTPS: **no ejecutado**. Teléfonos físicos: **no ejecutado** | **PARCIAL**: PASS local, BLOCKED en Preview |
| 08 | Respaldos con restauración verificada | Respaldo que no restaura; Free sin respaldos | `ops/backup-verify.sh`, `.github/workflows/respaldo-diario.yml`, `docs/RESPALDOS.md` | Restauración aislada VERIFICADA en local. Flujo diario contra Supabase sin secretos aún | **PASS (local)**; Supabase pendiente de secretos |
| 09 | Operación: contraseñas, enlaces de tarjeta, anular compras, errores, abuso, monitoreo | Soporte manual en BD; anulaciones sin auditoría | `server/services/operations.ts`, `src/views/Account.tsx`, Owner/Employee | 13 pruebas de integración + E2E 14/14 | **PASS**; monitoreo activo pendiente |

## Estado final
**READY FOR PRIVATE DEMO, en local o en emulador.** El Preview en Vercel queda pendiente de conectar el repositorio. En cuanto el Preview pase `/api/health?db=1` y las suites E2E en HTTPS, la demo privada en Vercel también queda lista.

**NOT READY FOR REAL CUSTOMERS.** Faltan:
1. Aviso de privacidad y contrato de encargado revisados por un abogado.
2. Planes Vercel Pro y Supabase Pro (Hobby no permite uso comercial; Free no tiene respaldos y pausa el proyecto).
3. Flujo de respaldo diario funcionando contra Supabase.
4. Checklist de teléfonos físicos completado.

Para **READY FOR CLOSED PILOT** (1 o 2 cafeterías de confianza) bastan los puntos 1 a 4. No hay pendientes de código que lo bloqueen.
