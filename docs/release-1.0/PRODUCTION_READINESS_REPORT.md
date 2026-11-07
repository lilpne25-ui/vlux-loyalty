# Propuesta técnica de producción (independiente, sin compras ni despliegues)

Hechos: hoy solo existe Supabase Preview y Vercel (Preview). Hipótesis a confirmar por Vlux: costos y plan.

1. **Entornos separados.** Proyecto Supabase de Producción distinto del Preview (que contiene a un negocio real y no debe mezclarse), proyecto Vercel de producción con variables propias y dominio propio. Sin compartir secretos ni cadenas de conexión.
2. **Credenciales mínimas** (evaluación y recomendación en `R1_ROLE_SEPARATION.md`; R-1 sigue abierto). Hoy un solo rol (`vlux_app`) puede fijar su propio alcance (R-1). Propuesta: rol `vlux_tenant` (rutas de negocio/cliente, sin funciones de plataforma) y rol `vlux_platform` (Control Center y workers), con cadenas distintas por despliegue; el dueño del esquema solo para migraciones.
3. **Migraciones** (secuencia de dos fases en `DEPLOY_0016_PLAN.md`). `scripts/migrate.ts` con checksum; en Producción nueva se aplican 0001–0016 desde cero (sin datos). Preview: pegar `0016_pegar_en_supabase.sql` solo tras desplegar el código y con autorización de Vlux.
4. **Secretos.** Solo en variables de Vercel/Supabase y en el repo privado `vlux-ops`; rotación documentada; **NOT VERIFIED** el contenido de secretos de `vlux-ops`.
5. **Respaldos y recuperación.** Plan Pro de Supabase (respaldos diarios/PITR a confirmar) más copia cifrada externa vía `vlux-ops`; simulacro de restauración sintético ya PASS; real en Preview/Producción **NOT TESTED**.
6. **Monitoreo.** Monitor externo de disponibilidad, alertas de errores 5xx y de fallos de respaldo (pendiente).
7. **Secuencia propuesta:** (a) revisar y fusionar la rama de endurecimiento tras aprobación; (b) desplegar código en Preview; (c) pegar 0016 en Preview; (d) pruebas remotas de solo lectura y dos negocios sintéticos nuevos; (e) crear Producción; (f) pruebas físicas y revisión legal; (g) piloto.
8. **Costos (por confirmar):** estimación previa ≈ USD 45/mes (Vercel Pro + Supabase Pro); no se contrató nada.
9. **Riesgos de la migración 0016:** orden de despliegue (cubierto), restaurar respaldos viejos (cubierto con grants condicional), R-1 abierto, sin prueba remota todavía.

Veredicto: **TENANT ISOLATION VERIFIED en PostgreSQL 17 local · SECURITY HARDENED a nivel de código y migración · PRODUCTION READY AT CODE LEVEL**. No aplicado en Preview ni Producción.
