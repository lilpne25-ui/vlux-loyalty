-- VLUX Loyalty 1.0.x · Verificación de SOLO LECTURA de la política de retención de recovery_requests (0017).
-- Se puede pegar en el editor SQL de Supabase en cualquier momento: no modifica nada. Todas las filas deben decir «sí».
-- Si «abiertas vencidas en claro» > 0, la tarea de retención no ha corrido: ejecuta GET /api/internal/recovery/retention
-- (Bearer RECOVERY_RETENTION_SECRET o CRON_SECRET; primero con ?dryRun=1). Es independiente de los avisos: no envía
-- mensajes. La app nunca muestra esos contactos (los enmascara al leer). Ver TAREA_RETENCION_0017.md.
SELECT 'tabla recovery_requests presente' AS verificacion, CASE WHEN to_regclass('public.recovery_requests') IS NOT NULL THEN 'sí' ELSE 'NO (0017 no aplicada)' END AS resultado
UNION ALL SELECT 'restricción de minimizado activa', CASE WHEN EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recovery_requests_minimized' AND convalidated) THEN 'sí' ELSE 'NO' END
UNION ALL SELECT 'cerradas con contacto en claro = 0', CASE WHEN count(*) = 0 THEN 'sí' ELSE 'NO: ' || count(*) END FROM recovery_requests WHERE status NOT IN ('pending','link_issued') AND position('***' in contact) = 0
UNION ALL SELECT 'abiertas vencidas en claro = 0', CASE WHEN count(*) = 0 THEN 'sí' ELSE 'NO: ' || count(*) END FROM recovery_requests WHERE status IN ('pending','link_issued') AND expires_at < now()
UNION ALL SELECT 'cerradas de más de 90 días = 0', CASE WHEN count(*) = 0 THEN 'sí' ELSE 'NO: ' || count(*) END FROM recovery_requests WHERE status NOT IN ('pending','link_issued') AND coalesce(resolved_at, expires_at) < now() - interval '90 days'
UNION ALL SELECT 'ninguna abierta vigente más de 30 días tras su última solicitud', CASE WHEN count(*) = 0 THEN 'sí' ELSE 'NO: ' || count(*) END FROM recovery_requests WHERE status IN ('pending','link_issued') AND expires_at > last_requested_at + interval '30 days 1 minute'
UNION ALL SELECT 'barrido no ejecutable por PUBLIC', CASE WHEN NOT has_function_privilege('public', 'recovery_retention_sweep(integer)', 'EXECUTE') THEN 'sí' ELSE 'NO' END;
