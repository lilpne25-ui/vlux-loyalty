# Riesgo residual R-1 · evaluación de `vlux_tenant` y `vlux_platform`

**Estado de R-1: ABIERTO. No está solucionado.** 0016 reduce el daño de un defecto de código ordinario (consulta sin filtro, IDOR), pero no impide que un atacante con **ejecución SQL arbitraria** como `vlux_app` elija su propio alcance.

## Qué es exactamente
`vlux_app` puede ejecutar `set_config('app.scope', 'platform', true)` y `set_config('app.business_id', …)`. Las políticas confían en esos valores. Si el código público tuviera una inyección SQL capaz de ejecutar sentencias arbitrarias, el atacante podría declarar alcance `platform`/`auth` y leer filas de todos los negocios, o llamar a las funciones de plataforma (exportar o purgar). Hoy no se halló una ruta así (consultas parametrizadas; el único SQL interpolado es el alcance, validado contra lista fija), pero la base no lo impediría.

## Opciones evaluadas
| Opción | Qué cierra | Esfuerzo | Riesgo |
|---|---|---|---|
| A. Dejar como está (un rol) | nada nuevo | 0 | R-1 abierto en producción |
| **B. Dos roles de conexión: `vlux_tenant` (apps públicas) y `vlux_platform` (Control Center y workers)** | un fallo en la app pública **ya no alcanza** funciones de plataforma ni lecturas transversales de plataforma/webhook/worker | medio: 2 roles, políticas `TO` por rol, 2 cadenas de conexión por despliegue, pruebas | bajo: la app ya se despliega separada (`CONTROL_CENTER_ENABLED`, `ADMIN_APP_URL`) |
| C. Además, sustituir el alcance `auth` por funciones `SECURITY DEFINER` de búsqueda por secreto (devuelven una fila) | quita las lecturas transversales de `staff_sessions`/membresías/tokens/invitaciones al rol tenant | alto: ~8 consultas de resolución previas al negocio | medio: tocar login y enlaces |
| D. Credenciales por solicitud / un rol por negocio | aislamiento fuerte | muy alto; incompatible con el Transaction Pooler | alto |

## Recomendación
**Sí: B antes de producción (no antes de Preview)**, y C después, como segundo endurecimiento. Motivo: lo más grave de R-1 es el alcance `platform` (exportar/purgar cualquier negocio), y la separación B lo elimina del rol que expone la superficie pública (la demo es la más expuesta). C reduce el resto pero toca el flujo de inicio de sesión: no se hace sin pruebas dedicadas.
Plan B (propuesto, **no implementado**): migración 0017 con `vlux_tenant` (sin EXECUTE de funciones de plataforma, sin políticas `platform_*`/`worker`/`webhook`) y `vlux_platform` (solo lo suyo); variables `DATABASE_URL` (tenant) y `DATABASE_PLATFORM_URL`; el Control Center y los workers usan la segunda; pruebas de aislamiento ejecutadas con ambos roles; actualizar `ops/grants.sql` y el simulacro.
**Lo que sigue abierto aunque se haga B:** el alcance `auth` (C), las tablas de identidad global (R-2) y el `INSERT` abierto de la bitácora (E-1). Ninguno se declara resuelto.
