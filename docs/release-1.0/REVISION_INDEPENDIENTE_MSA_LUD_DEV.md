# Revisión independiente con el agente `msa-lud-dev` · 1.0.x (PR #5)

Evidencia de participación del agente de revisión `msa-lud-dev` (MSA Edición Lud, instalado en privado; la metodología no se incluye en el repositorio por licencia). Cada revisión corrió como agente separado, **en modo solo lectura** (sin editar archivos, sin red, sin base de datos), sobre el código de esta rama. Lo que sigue es su informe, condensado sin cambiar dictámenes ni severidades.

## 1. Primera revisión · 2026-11-08 · diff `9220227..2a35cf0`

Comprobaciones que ejecutó: `npm run typecheck` (sin errores) y `npm run test:unit` (88/88). No ejecutó integración ni E2E (requieren base de datos).
**Veredicto del agente: NO-GO** hasta corregir A1–A3, M1 y M3 y ejecutar las verificaciones de migración y restauración.

| ID | Sev. | Hallazgo (resumen del agente) | Corrección aplicada en `0ee0aa5` |
|---|---|---|---|
| A1 | Alto | `issueRecoveryLink()` usaba 5 transacciones sin bloqueo: un fallo tras revocar dejaba al cliente sin acceso; dos llamadas simultáneas podían dejar dos tokens válidos o entregar uno ya revocado; una carrera con «cerrar» podía reabrir la solicitud. | Una sola transacción: `rotateCardLinkTx` (bloqueo de tarjeta → solicitud, revocar, insertar, bitácora) + `UPDATE … WHERE status IN (…)` + guarda de doble toque (15 s). Pruebas R2-12 (fallo inyectado) y R2-13 (3 llamadas simultáneas y cerrar/generar a la vez). |
| A2 | Alto | Toma de cuenta por ingeniería social: el enlace se ofrecía para enviarse al contacto que escribió el solicitante, aunque no coincidiera con el registrado. | La API ya no devuelve el contacto de la solicitud; devuelve `deliverTo` = contacto **registrado** (o `null` → entrega en persona con QR). Con contacto distinto exige `identityVerified` (casilla «Verifiqué en persona»). Pruebas R2-04, R2-14 y E2E R2-11…R2-13. |
| A3 | Alto | Reversa de 0017 con caché positiva: 500 en todas las rutas nuevas y **la anonimización (ARCO) fallaba**. | Caché con vigencia de 60 s; 42P01/42703/42883 invalidan la caché y responden 503 / `available:false`; la redacción dentro de la anonimización corre bajo `SAVEPOINT`. Pruebas R2-18 (caché caliente) y R2-19 (error a mitad de transacción). |
| M1 | Medio | Vencimiento a 30 días solo al abrir la bandeja; `expires_at` no se renovaba; `LIMIT 500`. | `recovery_retention_sweep()` (todos los negocios) en la tarea programada y, de respaldo, cada 10 min desde la app; vencimiento por negocio en cada escritura/lectura; la lectura nunca muestra en claro un contacto vencido; verificación SQL de solo lectura `0017_verificar_retencion.sql`. Prueba R2-15/R2-16. |
| M2 | Medio | `contact_hash` sin secreto permitía re-identificar tras enmascarar; la máscara de correo conservaba el dominio. | Al cerrar, vencer o anonimizar: hash reemplazado por un valor aleatorio. Máscara `a***@g***.com`. Restricción de BD `recovery_requests_minimized`: una fila cerrada con datos en claro es imposible. |
| M3 | Medio | Anonimizar no alcanzaba solicitudes sin tarjeta vinculada (y el contacto se borraba antes de buscar). | Se lee el contacto antes de borrarlo y se redactan las solicitudes vinculadas **o** con el mismo contacto/hash. Prueba R2-17. |
| M4 | Medio | DoS: 60/h por negocio bloqueaba a clientes reales; IPv6 sin agrupar; bandeja llena silenciosa. | Por red (/64 en IPv6, prueba I01); freno por negocio a 300/h; la bandeja muestra «se descartaron N solicitudes en 24 h». Desafío ligero (captcha): **no implementado**, queda como riesgo residual. |
| M5 | Medio | «Conocer VLUX Loyalty» iba a `/?ref=tarjeta` (presentación con datos de demo); validación por regex; sin `noreferrer`; sin documentar. | `safeLandingUrl()` con `new URL()`: https, sin credenciales ni puerto, dominio real, lista opcional `VITE_VLUX_LANDING_HOSTS`. Sin URL válida → WhatsApp comercial de VLUX, nunca ruta interna. `noreferrer`. Documentado en `.env.example`. Verificado en build con y sin la variable. |
| B1 | Bajo | `listRecovery` escribe en un GET (también en demo). | Las sesiones demo ya no escriben (solo se enmascara al leer). En sesiones reales el GET sigue venciendo solicitudes del propio negocio (deliberado: garantiza no mostrar datos vencidos). |
| B2 | Bajo | La descripción del reporte queda en bitácora inmutable. | Aviso en el formulario: «No escribas datos de tus clientes…». |
| B3 | Bajo | Conteo de pendientes sin bloqueo. | Bloqueo asesor por negocio en `requestRecovery`. |
| B4 | Bajo | Título del PDF con caracteres fuera del BMP y nombres largos sin espacios. | **Sin cambio** (cosmético). |
| B5 | Bajo | Ctrl+P en Accesos imprime la página completa. | Aceptado: la ruta oficial es `/panel/cartel`. |
| B6 | Bajo | Sin `GRANT UPDATE (updated_at)`. | Sin cambio: el agente mismo indica que funciona (lo prueba la suite). |

Lo que el agente verificó como correcto: respuesta idéntica exista o no la tarjeta, RLS y permisos por columna de 0017, compatibilidad por lectura con 0015/0016, `ops/grants.sql` condicional, checksum del archivo para pegar, purga de negocio en cascada, CSRF, ausencia de XSS, tokens fuera de bitácora y capturas, permisos por rol, PDF de una página con QR vectorial y zona de silencio.

## 2. Segunda revisión · sobre `0ee0aa5`

Ver la sección añadida al terminar la segunda pasada.
