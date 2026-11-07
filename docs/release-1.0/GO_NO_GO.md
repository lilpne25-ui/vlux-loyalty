# VLUX Loyalty 1.0.0-rc.1 · Matriz GO / NO-GO

Fecha de evaluación: 2026-11-07. Valores: **PASS** (demostrado, con evidencia) · **FAIL** (probado y falla) · **BLOCKED** (no se puede probar sin una acción externa) · **NOT TESTED**. Nada se marca PASS sin evidencia.

## Veredicto
| Nivel | Resultado | Significa |
|---|---|---|
| **READY FOR DEMO** | ✅ **GO** | Se puede seguir mostrando con datos sintéticos en el Preview público |
| **READY FOR CONTROLLED PILOT** | ⛔ **NO-GO** | 6 de 8 bloqueos críticos abiertos. Ninguno es de código: son infraestructura, pruebas físicas, legal y respaldos reales |
| **READY FOR GENERAL AVAILABILITY** | ⛔ **NO-GO** | Requiere primero un piloto exitoso y estabilidad operativa demostrada |
Los tres niveles no son equivalentes: pasar uno no implica el siguiente.

## Bloqueos críticos de producción (cualquiera abierto = NO-GO para piloto)
| # | Requisito | Estado | Evidencia / qué falta | Quién lo desbloquea |
|---|---|---|---|---|
| 1 | Sin riesgos de seguridad altos o críticos sin resolver | **PASS** (en código) | S2, S3, S4 (altos) corregidos y probados; S1 (medio) corregido en 0015 pero **no aplicado** en Preview (`SECURITY_REVIEW.md`). Para piloto: aplicar 0015 y repetir asesores | Vlux: pegar `0015_pegar_en_supabase.sql` |
| 2 | Respaldos con restauración comprobada | **BLOCKED** | Procedimiento PASS en local (`BACKUP_RECOVERY.md`). Nunca se ha respaldado ni restaurado Supabase real; workflow 7/7 fallido por falta de secretos | Vlux: repo privado `vlux-ops` + 2 secretos + simulacro |
| 3 | Entorno de producción separado | **FAIL** | No existe. Preview interno y público comparten una BD Free | Vlux: autorizar Supabase Pro + proyectos Vercel de producción |
| 4 | Infraestructura comercial habilitada | **FAIL** | Vercel Hobby prohíbe uso comercial; Supabase Free sin respaldos y se pausa. Costo ≈ USD 45/mes (`FINANCIAL_MODEL.md`) | Vlux: contratar Vercel Pro + Supabase Pro |
| 5 | Sin fallas críticas en QR, caja, recompensas o autenticación | **PASS** (automatizado) | 148/148 integración, E2E V0.4.6 27/27 y 9 regresiones verdes; 101 aserciones negativas. Falta la parte física (ver #6) | — |
| 6 | Pruebas físicas necesarias | **NOT TESTED** | 0 de 27 pruebas de `DEVICE_TESTS.md` | Vlux/equipo: iPhone, Android y caja reales |
| 7 | Documentación de privacidad aprobada | **BLOCKED** | Borradores en `LEGAL_DRAFTS.md`; sin revisión jurídica. `PRIVACY_NOTICE_VERSION=borrador-2026-10` | Abogado |
| 8 | Monitoreo y procedimiento de recuperación | **BLOCKED** | Runbook y procedimientos escritos (`RUNBOOK.md`); monitor externo no creado (depende de producción y dominio) | Vlux: crear monitor gratuito al tener producción |
Resumen: 2 PASS · 2 FAIL · 3 BLOCKED · 1 NOT TESTED.

## Detalle por área
| Área | Requisito | Estado | Evidencia |
|---|---|---|---|
| Código | Typecheck, unitarias 71/71, integración 148/148, build | PASS | `TEST_REPORT.md` |
| Código | `npm audit` 0 vulnerabilidades | PASS | `BASELINE.md` |
| Código | E2E V0.4.6 + regresiones V0.2–V0.4.5 | PASS (1 BLOCKED: Google Wallet, fuera de alcance) | `evidencia/e2e-*` |
| Seguridad | Aislamiento por negocio (RLS 34/34, rol NOBYPASSRLS) | PASS | `SECURITY_REVIEW.md` |
| Seguridad | Funciones con `search_path` fijo | PASS local · **BLOCKED** en Preview (0015 sin pegar) | prueba 1 |
| Seguridad | Asesores de Supabase después de 0015 | BLOCKED | requiere 0015 |
| Seguridad | Data API desactivada en producción | NOT TESTED | producción no existe |
| Migraciones | 0001–0014 en Preview con checksums idénticos | PASS | `MIGRATIONS.md` |
| Migraciones | Instalación desde cero 0001→0015 | PASS | local |
| Migraciones | 0015 aplicada en Preview | BLOCKED | pegar SQL |
| Respaldos | Verificación y simulacro (local, 300 negocios, escritura concurrente) | PASS | `evidencia/backup-verify-local.txt`, `restore-drill-local.txt` |
| Respaldos | Respaldo real diario verde | FAIL | 7/7 fallidos, issue #2 |
| Respaldos | Restauración real comprobada | BLOCKED | secretos y destino privado |
| Rendimiento | 300 negocios simultáneos sin errores (local) | PASS | p95 18.4 ms, p99 40.7 ms |
| Rendimiento | Latencia real Vercel↔Supabase desde México | NOT TESTED | requiere infraestructura de pago aislada |
| Alcance | Funciones opcionales congeladas y no activables desde la web | PASS | `FEATURE_FLAGS.md` |
| Preview | RC desplegado y verificado en ambos proyectos | ver `RELEASE_NOTES.md` § Despliegue | |
| Dispositivos | iPhone / Android / caja | NOT TESTED | `DEVICE_TESTS.md` |
| Legal | Aviso, términos, contrato | BLOCKED | `LEGAL_DRAFTS.md` |
| Comercial | Modelo de costos y márgenes | PASS (modelo) | `FINANCIAL_MODEL.md`; precios = hipótesis |
| Comercial | Guía de piloto | PASS (preparada) · ejecución NOT TESTED | `PILOT_GUIDE.md` |
| Operación | Runbook e incidentes | PASS (escrito) · ensayo NOT TESTED | `RUNBOOK.md` |

## Ruta mínima a READY FOR CONTROLLED PILOT (en orden)
1. **Pegar 0015** en Supabase Preview y avisar → repetir asesores (≈ 10 min).
2. **Autorizar y contratar** Supabase Pro + Vercel Pro (≈ USD 45/mes) y dominio → crear producción según `PRODUCTION_ARCHITECTURE.md` (≈ 1 día con acompañamiento).
3. **Respaldos**: repo privado `vlux-ops`, secretos, primera ejecución verde y simulacro restaurado (≈ 1 h).
4. **Monitor externo** sobre `/api/health?db=1` (≈ 15 min).
5. **Pruebas físicas** de `DEVICE_TESTS.md` con el negocio sintético (≈ 2 h, 3 personas).
6. **Abogado**: aviso, términos y contrato aprobados; cambiar `PRIVACY_NOTICE_VERSION` (plazo del abogado: es la ruta crítica).
7. Ensayo completo de `PILOT_GUIDE.md` con negocio sintético; luego primer negocio real.
Los pasos 1, 3, 5 y 6 pueden hacerse en paralelo.

## Criterios para GENERAL AVAILABILITY (después del piloto)
- ≥ 1 piloto de 8 semanas con criterios de éxito cumplidos y precio aceptado.
- 30 días seguidos de respaldos verdes y 1 simulacro mensual restaurado.
- 0 incidentes S1 en el piloto; incidentes S2 con post-mortem.
- KPIs del tablero con agregados (no historial completo), purga de sesiones vencidas.
- Medición real de latencia y capacidad en Supabase Pro; decisión de PITR.
- Soporte medido < 30 min/negocio/mes; onboarding ≤ 2 h.
- Facturación (CFDI) y cobro operando.
