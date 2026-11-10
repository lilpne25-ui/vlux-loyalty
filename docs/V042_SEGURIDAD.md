# V0.4.2 · Seguridad

## Corregido
**A · Disponibilidad por cálculo de hash del logo (riesgo medio de V0.4.1).** Antes, cada consulta pública del negocio calculaba `md5` del data URL completo (hasta ~90 KB). Ahora el hash se guarda en `businesses.logo_hash` (migración **0008**, con disparador que lo recalcula solo al cambiar el logo) y la API pública solo lo lee. Límites que siguen vigentes: logo ≤ 90 000 caracteres, solo PNG/JPEG/WebP verificados por firma de bytes, 5 MB máximo de archivo y ahora ≤ 40 megapíxeles y 10 s de decodificación en el navegador del Estudio; los logos solo los escribe el Control Center (autenticado, 2FA). El Estudio público no envía nada al servidor.

**B · RLS de `businesses`.** La política única `app_only` (todo permitido al rol de la app) se reemplazó por tres: lectura pública por clave, alta sin contexto (plataforma/seed) y **actualización solo de la fila del negocio fijado en `app.business_id`**. Sin RLS débil ni roles con más privilegios: sigue siendo `vlux_app`, sin DELETE. Pruebas: sin contexto → 0 filas; negocio A editando B → 0 filas; A editando A → 1; DELETE denegado.
Límite honesto: la lectura de `businesses` sigue abierta al rol de la app (las consultas públicas por slug no tienen negocio de contexto) y `app.business_id` lo fija el propio servidor. Es defensa en profundidad contra olvidos de filtro, no contra código malicioso en el servidor.

## Nuevo en V0.4.2 (superficie añadida)
Sesión de demostración (ver `V042_ACCESO_Y_DEMO.md`): apagada por omisión, cuentas reservadas, 2 h, limitada, auditada, bloqueos de escritura sensibles; probada en integración y E2E.

## Abiertos
| Riesgo | Nivel | Nota |
|---|---|---|
| Respaldos no operativos | **Alto antes de datos reales** | Faltan secretos en GitHub (ver `V042_RESPALDOS.md`) |
| Repositorio público + artefactos de Actions | Medio | El respaldo va cifrado; decisión de visibilidad es de Vlux |
| Demostración con datos compartidos | Bajo | Solo datos sintéticos; límite de aperturas por IP |
| Sin entorno de producción separado ni revisión legal (aviso de privacidad) | Alto antes de clientes reales | Pendiente |
| Pruebas en iPhone y Android físicos | Medio | NOT TESTED |

**No se declara READY FOR PILOT**: los respaldos y el entorno de producción siguen abiertos.
