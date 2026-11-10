# Plan de despliegue de 0016 en Supabase Preview · dos fases

**Estado: plan. Nada se ha ejecutado ni autorizado.** Cada fase la ejecuta Vlux (o la autoriza expresamente por escrito). Alcance: Supabase Preview y sus dos despliegues (`vlux-loyalty` y `vlux-loyalty-demo`, que **comparten la misma base**).

## 1. Qué se midió (PostgreSQL 17 local, datos sintéticos)
| Combinación | Resultado | Lectura |
|---|---|---|
| Código nuevo sobre 0015 | **148/148** (todas las pruebas heredadas; se excluyen las 54 de aislamiento, que por definición exigen 0016) | el código nuevo no tiene regresiones sobre el esquema actual |
| Código nuevo sobre 0016 | 148/148 + 54/54 de aislamiento | estado final |
| Código **anterior** (rc.1) sobre 0016 | **29/148**: 119 fallan (inicio de sesión, altas, tarjetas…) con «new row violates row-level security policy» | **no hay compatibilidad hacia atrás**: aplicar 0016 antes de desplegar el código rompe el servicio |
Las tres pruebas que antes fallaban sobre 0015 eran **afirmaciones propias de 0016** (lista de funciones con `app_scope`, equivalencia de `grants.sql`, error de alcance en la purga). Ahora comprueban el estado según la versión del esquema, de modo que no ocultan nada: sobre 0015 verifican el comportamiento 0015 y sobre 0016 el comportamiento 0016.

**Consecuencia:** transición en **dos fases** con el esquema siempre compatible con el código desplegado. No se declara «compatibilidad total»: es compatibilidad del código nuevo con ambos esquemas, y **ninguna** del código anterior con 0016.

## 2. Antes de empezar (no cambia nada)
1. Elegir el commit exacto del PR #4 que se desplegará (el que Vlux apruebe) y anotar su SHA.
2. Respaldo fresco: ejecutar manualmente el flujo de respaldo de `vlux-ops` justo antes de la Fase 2 (el último se hizo antes de cualquier dato nuevo) y confirmar éxito. Sin tocar `BACKUP_SCHEDULE`.
3. Anotar los conteos por tabla (`SELECT count(*)`, solo agregados) para compararlos después.
4. Confirmar que ambos proyectos de Vercel usan la misma base de Preview; **ambos** pasan por la Fase 1 antes de la Fase 2.
5. Identificar los despliegues anteriores (URLs inmutables) de ambos proyectos para poder revertir con un clic. Después de la Fase 2 **ninguno** debe recibir tráfico.
6. Ventana: baja actividad; avisar a quien use Preview (incluido el negocio real) con 24 h.

## 3. Fase 1 · desplegar el código (esquema sigue en 0015)
Acción: desplegar el SHA elegido en los dos proyectos (Preview/staging). El esquema no cambia.
Verificaciones (todas deben pasar):
- Despliegue «Ready» en ambos; `/api/health` o equivalente responde y la versión de esquema esperada por el código se reporta sin error.
- Pruebas manuales de humo, con datos sintéticos o de demo: inicio de sesión de dueño y de empleado, abrir una tarjeta por enlace, registrar una visita de demo, abrir el Control Center con 2FA.
- Sin errores nuevos en los registros de ejecución durante 30 minutos.
Reversión de Fase 1: promover de nuevo el despliegue anterior en ambos proyectos. Es seguro porque el esquema sigue en 0015.
Compuerta: no pasar a la Fase 2 con ninguna verificación en rojo ni con un despliegue sin migrar a código nuevo.

## 4. Fase 2 · aplicar 0016 (≈ 0.1 s en local; en remoto se espera algo más por latencia: estimación, no medida)
1. Esperar ≥ 10 minutos tras el último despliegue de la Fase 1 (que terminen solicitudes en curso del código anterior).
2. Pegar `0016_pegar_en_supabase.sql` en el editor SQL de Supabase, **una sola vez**. Es transaccional (`BEGIN … COMMIT`) y tiene guardas: aborta si 0016 ya está registrada o si faltan 0001–0015. Solo toma bloqueos breves de catálogo (políticas, permisos, renombrado de funciones); no reescribe tablas ni toca datos.
3. Si el editor muestra error: ejecutar `ROLLBACK;` y confirmar con la consulta de verificación que la migración **no** quedó registrada; no reintentar sin revisar.
4. Pegar `0016_verificar_solo_lectura.sql`: **todas las filas deben decir `true`**.
5. Repetir las pruebas de humo de la Fase 1 y comparar los conteos por tabla (deben ser iguales).
6. Sincronizar `ops/grants.sql` de `vlux-ops` (`parches/vlux-ops-sincronizar-0016.patch`) y repetir respaldo + simulacro de restauración sobre 0016 (antes de activar cualquier programación de respaldos).
Tiempo de interrupción esperado: ninguno perceptible en el camino feliz; una solicitud en vuelo del código anterior podría fallar (por eso la espera del punto 1).

## 5. Reversión (matriz)
| Situación | Acción | Efecto |
|---|---|---|
| Fallo en Fase 1 | promover el despliegue anterior en ambos proyectos | vuelve al estado previo exacto |
| Error al pegar 0016 | `ROLLBACK;` | sin cambios (transaccional) |
| Problema tras 0016 (humo falla, errores 5xx de RLS) | pegar `0016_revertir_en_supabase.sql` (guarda de checksum; vuelve a 0015; borra la fila de historial; no toca datos) y repetir humo | el código nuevo sigue funcionando (148/148 sobre 0015): **no se revierte el código** |
| Cualquier situación con 0016 aplicada | **no** promover el despliegue anterior de la aplicación (falla el inicio de sesión) | — |
| Corrupción de datos (no esperada: la migración no escribe datos) | restaurar el respaldo en un proyecto nuevo y aislado; nunca sobre Preview vivo | último recurso |
La reversa se probó en local con datos presentes (≈ 500 negocios sintéticos): revertir y volver a aplicar varias veces, con conteos de **todas** las tablas idénticos antes y después; el código nuevo pasa 148/148 sobre 0015 tras revertir.

## 6. Riesgos residuales de esta transición
- Un despliegue antiguo con URL inmutable seguiría hablando con la misma base: tras la Fase 2 fallaría el inicio de sesión (falla cerrada, sin exposición de datos).
- Si un tercer consumidor usara la base con `vlux_app` (script, worker externo), debe adaptarse a los alcances antes de la Fase 2. No se encontró ninguno en el repositorio; **NOT TESTED** en el panel de Vercel/Supabase.
- Latencia y bloqueos reales de la Fase 2 en Supabase: **NOT TESTED** (solo local).
