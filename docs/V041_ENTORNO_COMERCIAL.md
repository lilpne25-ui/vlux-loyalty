# V0.4.1 · Preparación del entorno comercial

## Estado hoy
| Entorno | Qué es | Datos |
|---|---|---|
| Desarrollo | PostgreSQL local y emulador | Sintéticos |
| Demostración | Preview de Vercel + Supabase Preview (`kpcmxmmwcolcxhkiwmaq`); proyecto **público** `vlux-loyalty-demo` y proyecto **interno** `vlux-loyalty` | Sintéticos |
| Producción comercial | **No existe** | Ninguno |
Los dos proyectos de Vercel comparten la misma base de Preview. Por eso **un negocio real no debe darse de alta ahí**.

## Qué falta antes del piloto con datos reales (no se hizo; requiere decisiones/pagos de Vlux)
1. Proyecto Supabase **de producción** separado (hoy el Free tiene 2 proyectos; un tercero exige pausar uno o pasar a Pro) y un rol `vlux_app` propio.
2. Proyecto Vercel de producción con dominio propio (el alias `*.vercel.app` no es presentable) y pruebas de dominio.
3. Respaldos operativos y una restauración probada (ver V041_RESPALDOS.md).
4. Aviso de privacidad y consentimientos revisados por un abogado (LFPDPPP). **Pendiente de validación jurídica real; no se declara cumplimiento.**
5. Política de retención y proceso ARCO: existen exportar/anonimizar al cliente (probado), falta la política escrita.
6. Evitar uso accidental de la base demo: en producción, `isDemo=false` y una variable de entorno que distinga el entorno; hoy los negocios demo se marcan con `is_demo`.
7. Revisar el hallazgo de RLS de `businesses` (ver V041_SEGURIDAD.md).
8. Pruebas físicas en iPhone y Android.
Nada de esto se publicó ni se compró.
