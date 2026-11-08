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

## 2. Segunda revisión · 2026-11-08 · commit `0ee0aa5`

Comprobaciones que ejecutó: `npm run typecheck` (sin errores) y `npm run test:unit` (92/92). No ejecutó integración, E2E ni la matriz (sin base de datos).
**Veredicto del agente: APROBADO CON RESERVAS.** 7 de los 10 hallazgos previos cerrados, 3 parciales (M2, M4, B2); ningún alto ni crítico nuevo; corregir N1 y N2 antes de pegar 0017.

| Previo | Dictamen del agente |
|---|---|
| A1, A2, A3, M3, M5 | CERRADO |
| M1 | CERRADO con condición (que la tarea programada exista y corra) |
| M2 | PARCIAL aceptable (hash sin secreto solo mientras el contacto está en claro en la misma fila) |
| M4 | PARCIAL (300/h por negocio bloqueable con ~60 IPv4; bandeja llena con respuesta «ok») |
| B2 | PARCIAL (solo aviso; la descripción seguía en la bitácora) |

| Nuevo | Sev. | Hallazgo | Corrección en `90b5811` |
|---|---|---|---|
| N1 | Medio | Barrido en segundo plano (`void`) podía congelarse en Vercel con la transacción abierta y bloqueos. | Siempre **esperado**, con `statement_timeout 3s`, `lock_timeout 1s`, `idle_in_transaction_session_timeout 5s`; desde rutas solo 200 filas y nunca en sesiones demo. |
| N2 | Bajo | En el cron corría después de los avisos y podía quedarse sin tiempo. | Corre **antes** y el presupuesto de avisos descuenta lo que tardó. |
| N3 | Bajo | Con `grants.sql` viejo, 42501 abortaba la anonimización. | La anonimización termina y deja `recovery.redact_failed` en la bitácora (prueba R2-20). Compromiso aceptado: las solicitudes de ese cliente quedan sin redactar hasta sincronizar permisos; por eso el plan exige sincronizar `vlux-ops` en el mismo paso que 0017. |
| N4 | Bajo | Interbloqueo posible (`expireTenant` antes del bloqueo asesor). | Bloqueo asesor primero. |
| N5 | Bajo | Interbloqueo posible generar enlace ↔ reenvío del cliente (FK). | Reintento automático ante 40P01/40001 (2 veces). |
| N6 | Bajo | `require_scope` ordena el uso pero no es barrera; demo disparaba el barrido. | Documentado como orden de uso (la función solo reduce datos); demo ya no lo dispara. |
| N7 | Bajo | Anonimizar A podía descartar la solicitud de B si comparten número. | Solicitudes sin vincular solo se redactan si ningún otro cliente activo tiene ese contacto (prueba R2-21). |
| N8 | Bajo | Guarda de 15 s con `now()` (inicio de la transacción). | `clock_timestamp()`. |
| N9 | Bajo | Comentario contradictorio sobre `contact_hash`; 42703 genérico → 503. | Comentario corregido; el 503 ante 42703 se mantiene a propósito (degradación controlada). |
| M4 | — | Bandeja llena con respuesta «ok». | `queued:false` → el cliente ve «pídelo en caja» (no revela si es cliente; prueba R2-22). El límite de 300/h por negocio sigue siendo bloqueable con ~60 IPv4: **riesgo residual** (mitigación posible: desafío ligero o WAF de Vercel). |
| B2 | — | Descripción en bitácora inmutable. | Ya no se guarda: solo `descriptionLength`; el texto viaja únicamente en el WhatsApp a soporte. |

Riesgo que el agente deja explícito y que no se elimina con código: el dueño ve y puede copiar el enlace, y `identityVerified` es una casilla que marca el propio dueño. La protección es de proceso (QR en persona / contacto registrado), no criptográfica.
