# VLUX Loyalty 1.0.0-rc.1 · Historial de migraciones

## Verificación en Supabase Preview (solo lectura, 2026-11-07 06:08 UTC)
Consulta: `SELECT version, checksum, applied_at FROM public.schema_migrations ORDER BY version`. Comparado contra `sha256sum db/migrations/*.up.sql` (el mismo algoritmo de `scripts/migrate.ts`).

| Versión | Checksum (sha256, primeros 16) | Aplicada (UTC) | ¿Coincide? |
|---|---|---|---|
| 0001_init | e79e93ea74cf9974 | 2026-10-31 19:38 | Sí |
| 0002_serverless_supabase | f9f1ecafb2d0c464 | 2026-10-31 19:38 | Sí |
| 0003_operacion_piloto | 0ad100787c591fb2 | 2026-10-31 19:38 | Sí |
| 0004_search_path | 83749950b6a368c0 | 2026-10-31 19:39 | Sí |
| 0005_vinculacion_pwa | 284504142fa9b316 | 2026-10-31 23:36 | Sí |
| 0006_control_center | 0623832df8923be6 | 2026-11-01 00:32 | Sí |
| 0007_card_finish | 64deeb153ef3f37c | 2026-11-01 04:27 | Sí |
| 0008_logo_hash_rls | 12719ab974868105 | 2026-11-01 05:26 | Sí |
| 0009_logo_fit | 8f8b4ea62d598e83 | 2026-11-07 06:03 | Sí |
| 0010_activation_drafts | e44f28e4e4c2204f | 2026-11-07 06:03 | Sí |
| 0011_business_lifecycle | bd7a703588c401e8 | 2026-11-07 03:47 | Sí |
| 0012_email_outbox | 1af14dd4ed425e04 | 2026-11-07 03:47 | Sí |
| 0013_rewards_engine | 262b7eed19915a76 | 2026-11-07 03:47 | Sí |
| 0014_access_push | d47f7ccee9a0a7e2 | 2026-11-07 05:45 | Sí |

Resultado: **historial completo 0001–0014 y 14/14 checksums idénticos**. 0009/0010 se registraron después de 0011–0013 (las estructuras ya existían); el orden de `applied_at` no afecta al ejecutor, que compara por versión. Ninguna migración histórica fue editada (el ejecutor se detendría).

## Nueva migración del RC: `0015_release_hardening` (aditiva)
| Parte | Qué hace | Riesgo |
|---|---|---|
| search_path | `ALTER FUNCTION forbid_mutation()/businesses_set_logo_hash() SET search_path = pg_catalog, public` | Nulo: cuerpo idéntico |
| EXECUTE | Retira EXECUTE a PUBLIC en 4 funciones; `vlux_app` conserva `current_business_id` | Nulo: disparadores no requieren EXECUTE (probado) |
| Privilegios por omisión | Nuevos objetos de `public` sin permisos para `anon`/`authenticated` | Nulo para la app (no usa esos roles) |
| 12 índices | Llaves foráneas en la ruta de la purga | Escritura: sin regresión medida (`PERFORMANCE.md`) |

Probado en local: aplicar → revertir → reaplicar; instalación desde cero 0001→0015; 148/148 integración; regresiones E2E.
Checksum: `e1b0156b6b8389530aa8e4ba57631cd7d4b7b6a78c1c95cca0358b0dea2fe24f`.

### Aplicada en Supabase Preview el 2026-11-07 09:05 UTC (por Vlux)
Verificada por lectura: 15 filas en `schema_migrations`, checksum de 0015 idéntico, 12 índices, 0 funciones ejecutables por PUBLIC, asesor de seguridad sin avisos (`evidencia/supabase-preview-0015.txt`). Los pasos de abajo quedan como referencia.

### Procedimiento (referencia)
1. Abrir [`0015_pegar_en_supabase.sql`](0015_pegar_en_supabase.sql), copiar todo y ejecutarlo en Supabase → SQL Editor del proyecto **vlux-loyalty-preview**.
2. El script se niega a correr si 0015 ya está registrada o si falta alguna de 0001–0014, y registra su fila de historial con el checksum correcto (probado: después, `migrate.ts up` no encuentra nada pendiente).
3. Avisar para repetir los asesores de seguridad y rendimiento (solo lectura) y cerrar S1 en `GO_NO_GO.md`.
El código del RC **no depende** de 0015 (solo permisos e índices): el Preview puede llevar el RC antes o después de pegarla.

## Procedimiento para una base de PRODUCCIÓN nueva
1. Crear el proyecto Supabase de producción (plan Pro, región `us-east-1`, contraseña nueva de 32+ caracteres en el gestor de secretos). **No** clonar Preview ni copiar sus datos.
2. Desde una máquina controlada (nunca Vercel, nunca CI público): `DATABASE_ADMIN_URL` = conexión directa o Session Pooler (puerto 5432) del dueño del esquema.
3. Crear el rol de la app: `CREATE ROLE vlux_app LOGIN NOBYPASSRLS PASSWORD '<nueva>';` (contraseña distinta a Preview).
4. `node --env-file=.env.produccion --import tsx scripts/migrate.ts up` → aplica 0001–0015 en orden, en transacciones, y registra checksums.
5. Verificar: `scripts/migrate.ts status` (15 aplicadas), asesores de Supabase (0 WARN de seguridad), y `psql -f ops/grants.sql` no cambia nada (idempotente).
6. Desactivar la Data API (PostgREST) del proyecto si no se usa.
7. Ejecutar `ops/backup-verify.sh` una vez contra la base nueva (vacía) para validar el flujo de respaldo antes del primer cliente.

## Reglas para migraciones futuras
- Solo aditivas mientras haya clientes; un cambio destructivo requiere respaldo verificado previo y ventana acordada.
- Nunca editar una migración aplicada: crear la siguiente.
- Toda función nueva o recreada declara `SET search_path` (la prueba 1 de `release-rc1.test.ts` lo exige).
- Toda tabla nueva: `ENABLE ROW LEVEL SECURITY`, permisos explícitos a `vlux_app` y actualizar `ops/grants.sql` (la prueba 5 falla si no).
- Índices en tablas grandes de producción: crearlos antes con `CREATE INDEX CONCURRENTLY` (mismo nombre) y la migración usa `IF NOT EXISTS`.
- Nunca correr `scripts/migrate.ts down` contra Preview ni producción: es solo para desarrollo.

| 0016_tenant_isolation | Aislamiento por RLS en nueve tablas, alcances `app.scope`, envolturas de funciones de plataforma, UPDATE por columnas. **No aplicada en Preview.** Pegar `0016_pegar_en_supabase.sql` DESPUÉS de desplegar el código. Reversa: `0016_tenant_isolation.down.sql`. |
| 0017_recovery_support | Solicitudes de recuperación de acceso (`recovery_requests`, RLS por negocio, sin DELETE) y `businesses.contact_whatsapp`. Aditiva, independiente de 0016 (sirve sobre 0015 o 0016). **No aplicada en Preview.** Pegar `0017_pegar_en_supabase.sql` (antes o después del código). Reversa: `0017_revertir_en_supabase.sql`. Ver `UX_OPERATIVO_1.0.x.md`. |
