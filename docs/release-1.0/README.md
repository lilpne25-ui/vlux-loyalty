# VLUX Loyalty 1.0.0-rc.1 · Paquete de cierre

## Recomendación final de lanzamiento
**No lanzar todavía con un negocio real. Sí seguir mostrando la demo.**
- El software está listo para un piloto: pruebas verdes, defectos altos corregidos, rendimiento holgado para 300 negocios, alcance congelado.
- Lo que falta **no es código**: producción separada en planes de pago, respaldos reales restaurados, pruebas en teléfonos físicos y aprobación legal. Ver la ruta mínima en [`GO_NO_GO.md`](GO_NO_GO.md).
- La ruta crítica es el abogado. Todo lo demás cabe en ~2 días de trabajo de Vlux una vez autorizado el gasto (≈ USD 45/mes).
- Precio: usar **499 como precio de lista** del piloto y validar 299 solo si el soporte medido queda < 30 min/mes por negocio ([`FINANCIAL_MODEL.md`](FINANCIAL_MODEL.md)).

## Entregables
| # | Entregable | Documento |
|---|---|---|
| 1 | Rama `release/1.0.0-rc1` | Git (etiqueta `v1.0.0-rc.1`) |
| 2 | Auditoría técnica final | [`BASELINE.md`](BASELINE.md) |
| 3 | Correcciones justificadas | [`RELEASE_NOTES.md`](RELEASE_NOTES.md) |
| 4 | Revisión de seguridad | [`SECURITY_REVIEW.md`](SECURITY_REVIEW.md) |
| 5 | Historial de migraciones verificado | [`MIGRATIONS.md`](MIGRATIONS.md) + [`0015_pegar_en_supabase.sql`](0015_pegar_en_supabase.sql) |
| 6 | Pruebas automatizadas | [`TEST_REPORT.md`](TEST_REPORT.md) |
| 7 | Respaldo y restauración | [`BACKUP_RECOVERY.md`](BACKUP_RECOVERY.md) |
| 8 | Arquitectura de producción | [`PRODUCTION_ARCHITECTURE.md`](PRODUCTION_ARCHITECTURE.md) |
| 9 | Variables y secretos | [`PRODUCTION_ARCHITECTURE.md`](PRODUCTION_ARCHITECTURE.md) § Variables, § Política de secretos |
| 10 | Monitoreo y runbook | [`RUNBOOK.md`](RUNBOOK.md) |
| 11 | Pruebas físicas | [`DEVICE_TESTS.md`](DEVICE_TESTS.md) |
| 12 | Documentación legal (borrador) | [`LEGAL_DRAFTS.md`](LEGAL_DRAFTS.md) |
| 13 | Evaluación financiera | [`FINANCIAL_MODEL.md`](FINANCIAL_MODEL.md) |
| 14 | Guía del primer piloto | [`PILOT_GUIDE.md`](PILOT_GUIDE.md) |
| 15 | Matriz GO/NO-GO | [`GO_NO_GO.md`](GO_NO_GO.md) |
| 16 | Preview de la versión candidata | [`RELEASE_NOTES.md`](RELEASE_NOTES.md) § Despliegue |
| 17 | Recomendación final | Esta página |
Además: [`PERFORMANCE.md`](PERFORMANCE.md), [`FEATURE_FLAGS.md`](FEATURE_FLAGS.md), evidencia en [`evidencia/`](evidencia/).

## Acciones de Vlux (en orden)
1. Pegar `0015_pegar_en_supabase.sql` en Supabase → SQL Editor (Preview) y avisar.
2. Crear el repo privado `vlux-ops` y sus 2 secretos (`BACKUP_RECOVERY.md` § Pasos).
3. Autorizar Vercel Pro + Supabase Pro + dominio.
4. Hacer las pruebas físicas.
5. Enviar `LEGAL_DRAFTS.md` al abogado.
