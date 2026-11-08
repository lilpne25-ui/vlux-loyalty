# VLUX Loyalty 1.0.x · Correcciones de seguridad y operación antes de desplegar

**Rama:** `claude/project-thread-bcmxkp` (PR #5, borrador, apilado sobre PR #4). **Fecha:** 2026-11-08.
**Restricciones respetadas:** no se aplicó 0016 ni 0017 en Supabase Preview, no se desplegó en Vercel, no se tocó Odalex, Production, `main`, secretos ni la programación de respaldos, no se fusionó nada, no se envió ningún correo ni WhatsApp real (las pruebas interceptan `wa.me`). El repositorio privado `vlux-ops` no se modificó: solo se preparó el parche.

## 1. Cambios implementados

| # | Pedido | Qué se hizo | Dónde |
|---|---|---|---|
| 1 | Recuperación segura del enlace | `issueRecoveryLink` en **una sola transacción**. Primero bloquea la tarjeta y luego la solicitud, en el mismo orden que la anonimización. Revalida el estado, revoca el enlace, crea el nuevo, cierra la solicitud y escribe la bitácora. Si algo falla no cambia nada y el enlace anterior sigue sirviendo. Hay guarda de doble toque (15 s) y reintento ante interbloqueo. El enlace solo se entrega al **contacto registrado** del cliente o **en persona** (QR). Si el contacto no coincide, el sistema exige confirmar la identidad en persona. | `server/services/recovery.ts`, `operations.ts` (`rotateCardLinkTx`), `RecoveryInbox.tsx` |
| 2 | Privacidad y caducidad | Política verificable: abierta 30 días desde la última solicitud; con enlace generado, 7 días; al cerrar, vencer o anonimizar, el contacto se **enmascara**, se borra el nombre y el hash se vuelve aleatorio. A los 90 días de cerrada, la fila se borra. La base **rechaza** una fila cerrada con datos en claro (`recovery_requests_minimized`). El barrido global `recovery_retention_sweep()` corre en la tarea programada y, como respaldo, desde la app (esperado, acotado a 3 s). La lectura nunca muestra en claro un contacto vencido. Anonimizar alcanza también las solicitudes **sin tarjeta vinculada**, sin tocar las de otro cliente que comparta el número. «Reportar problema» ya no guarda la descripción en la bitácora inmutable. | `0017_recovery_support.up.sql`, `recovery.ts`, `owner.ts`, `support.ts`, `0017_verificar_retencion.sql` |
| 3 | Landing comercial | Verificado: el destino anterior (`/?ref=tarjeta`) era la presentación interna con datos de demo. Ahora `VITE_VLUX_LANDING_URL` se valida con `new URL()`: solo https, sin usuario ni contraseña, sin puerto, con dominio real (no IP ni localhost), ≤200 caracteres y lista opcional `VITE_VLUX_LANDING_HOSTS`. Si no hay URL válida, el botón abre **WhatsApp comercial de VLUX** y nunca una ruta interna. Lleva `noreferrer`. Está documentada en `.env.example`. Comprobado en el build con y sin la variable. | `src/lib/support.ts`, `CustomerHelp.tsx`, `.env.example` |
| 4 | Reversión de 0017 en caliente | La detección positiva dura 60 s. Los errores 42P01, 42703 y 42883 invalidan la caché y responden 503 `recovery_unavailable` o `available:false`. La redacción dentro de la anonimización corre bajo `SAVEPOINT` y también tolera permisos incompletos (42501), dejando constancia en la bitácora. El resto de la app no depende de 0017. | `recovery.ts` |
| 5 | Matriz de migraciones | Script reproducible que crea la base, deja el esquema por el **mismo camino que en Supabase** (archivos para pegar y revertir) y corre toda la integración. Un clasificador separa las afirmaciones propias de 0016 o 0017 de las regresiones reales. | `scripts/verify-migration-matrix.sh`, `scripts/classify-matrix.py` |
| 6 | Respaldos | `ops/grants.sql` incluye la tabla, las columnas y las funciones de 0017 de forma condicional. Hay una verificación de `backup-verify.sh` y `restore-drill.sh` (respaldo cifrado) con y sin 0016, que compara además los permisos por columna. Parche para `vlux-ops` preparado, **sin aplicar**. | `ops/grants.sql`, `scripts/verify-backups-0017.sh`, `parches/vlux-ops-sincronizar-0017.patch` |
| 7 | Móvil | Se conservan PDF, PNG y QR. Hay casos nuevos en Android emulado (Pixel 7) y se revisa el desplazamiento horizontal en iPhone y Android emulados. | `tests/e2e/v1-ux-operativo.cjs` |

Otros cambios:
- Límite de recuperación por **red**: IPv6 /64.
- Freno por negocio de 300/h, para que pocas IP no bloqueen a los clientes reales.
- La bandeja avisa «se descartaron N solicitudes» y el cliente ve «pídelo en caja» si la bandeja del negocio está llena, sin revelar si es cliente.
- Los archivos para pegar 0017 se **generan** desde la migración (`scripts/gen-0017-paste.mjs`), así que no se pueden desincronizar.

## 2. Informe de seguridad

### 2.1 Modelo de amenazas de la recuperación y estado

| Amenaza | Control | Evidencia |
|---|---|---|
| Averiguar quién es cliente (enumeración) | Respuesta idéntica exista o no la tarjeta, incluso con la bandeja llena (`queued` depende solo de la bandeja). | R2-01, R2-22, E2E R2-02 |
| Suplantación: «soy María, mándame el enlace a este número» | El enlace va solo al contacto **registrado** o en persona. Con contacto distinto: casilla «Verifiqué en persona» obligatoria, en servidor y en interfaz; queda en la bitácora `identityVerified:true`. | R2-04, R2-14, E2E R2-11…R2-13 |
| Dejar al cliente sin acceso por un fallo a medias | Todo o nada en una transacción. | R2-12 (fallo inyectado tras revocar): el enlace viejo sigue sirviendo, no queda token nuevo ni bitácora falsa |
| Carreras (doble toque, dos dispositivos, cerrar y generar a la vez) | Bloqueos de fila en orden fijo, guarda de 15 s y reintento ante 40P01. | R2-13: 3 llamadas simultáneas dan 1 éxito, 2 `recovery_link_recent` y **1 solo** enlace vigente |
| Retención indefinida de contactos | Restricción en la base, barrido global y lectura enmascarada. | R2-15, R2-16 y verificación SQL de solo lectura |
| Re-identificación por hash | Hash aleatorio al cerrar, vencer o anonimizar. | R2-15 |
| Derecho ARCO (anonimizar) bloqueado por 0017 | SAVEPOINT y tolerancia a esquema ausente o sin permisos. | R2-18, R2-19, R2-20 |
| Abuso o saturación | 5/h por red, 300/h por negocio, 200 abiertas por negocio, aviso al dueño y respuesta «pídelo en caja». | R2-07, R2-22 |
| Fuga entre negocios | RLS `tenant_isolation`, FK compuesta tarjeta-negocio y UPDATE solo por columnas, sin DELETE para la app. | R2-05, R2-11 y matriz con 0016 |
| Fuga del enlace | Ni la solicitud ni la bitácora guardan el token; las capturas de evidencia lo tapan. | R2-03 |
| Destino malicioso del botón comercial | URL validada en compilación, https y dominio real; `noreferrer`. | L01–L03 |

### 2.2 Riesgos residuales (no se eliminan con código)
1. **El dueño ve el enlace** y la casilla de identidad la marca él mismo. La protección es de proceso, no criptográfica. Mitigación: la bitácora registra quién y cuándo, y el enlace solo va al contacto registrado.
2. **Saturación con muchas IP:** con unas 60 IPv4 se agota el freno de 300/h de un negocio durante una hora. Mientras tanto el cliente ve «pídelo en caja», y el negocio sigue operando en mostrador. Mitigaciones futuras: desafío ligero o reglas de WAF en Vercel.
3. **Tarea de retención (actualizado, §8):** la retención ya **no** corre en la ruta de avisos. Es una tarea independiente, `GET /api/internal/recovery/retention`, que nunca envía mensajes; se programa con Vercel Schedules, preparada y **apagada**. Mientras no se programe, la app barre cuando hay actividad de recuperación y la lectura nunca muestra contactos vencidos. Pero un negocio sin actividad conservaría filas vencidas en la base y en los respaldos hasta correrla a mano. Cómo comprobarlo: `0017_verificar_retencion.sql`.
4. **`grants.sql` de `vlux-ops` sin sincronizar:** con 0017 aplicada y el `grants.sql` viejo, una restauración deja la recuperación sin permisos. `backup-verify.sh` **lo detecta** (probado: «permisos de vlux_app distintos al origen»). `restore-drill.sh` por sí solo **no** lo detecta. Por eso el parche va en el mismo paso que 0017.
5. `require_scope('worker')` en el barrido ordena el uso pero no es una barrera, porque `vlux_app` puede fijarse el alcance. Es aceptable porque la función solo reduce datos y devuelve conteos.

## 3. Pruebas

| Nivel | Resultado | Notas |
|---|---|---|
| Unitarias | **92/92** | Nuevas: L01–L03 (landing), I01 (IPv6 /64) y lista de alcances actualizada. |
| Integración (PG 16 local, 0016+0017) | **226/226** | Recuperación: 24 casos (R2-01…R2-22 y R4-01/02). |
| E2E 1.0.x (emulador Vercel Output + Chromium) | **43/43** | Suplantación de punta a punta, Android emulado, landing sin ruta interna y bitácora sin datos en claro. |
| E2E regresión V0.4.6 | **27/27** | |
| Matriz de migraciones (PG 16 y PG 17.11) | ver §4 | |
| Respaldos con 0017 | ver §5 | |

### Móvil: qué es emulado y qué falta en dispositivo real

| Prueba | Tipo | Resultado |
|---|---|---|
| iPhone (390×844, UA de Safari 18) | **Emulada con Chromium**: diseño y viewport de iPhone, **no** el motor WebKit. WebKit de Playwright no está instalado en este entorno y no se instaló. | 1 hoja carta y A5; QR legible a 100 y 72 ppp; zoom 160 %; descargas; sin desplazamiento horizontal |
| Android (Pixel 7, 412×915) | **Emulada con Chromium**: mismo motor que Chrome Android, sin el sistema de impresión de Android. | 1 hoja carta; QR legible a 100 y 72 ppp; descarga PNG; «Perdí mi acceso» sin desplazamiento horizontal y botón ≥44 px |
| Safari iOS real: «Imprimir» con AirPrint o guardar PDF desde Compartir | **PENDIENTE (dispositivo físico)** | — |
| Chrome Android real: Imprimir con Android Print o PDF | **PENDIENTE (dispositivo físico)** | — |
| Impresora física: hoja única sin hoja en blanco extra y QR escaneado desde el papel con 2 teléfonos | **PENDIENTE (dispositivo físico)** | — |
| WhatsApp real (abrir `wa.me` con el mensaje prellenado) | **PENDIENTE**, por la restricción de no enviar mensajes reales | — |

Guion de 15 minutos para la prueba física: §6.4.

## 4. Matriz de migraciones (código 1.0.x final)

Ver la tabla en §4.1. Cómo leerla:
- Las pruebas de `tenant-isolation` **exigen 0016** por diseño.
- Las de recuperación (R2-xx salvo R2-10) **exigen 0017**.
- R2-10 verifica justamente el comportamiento **sin** 0017 y debe pasar siempre.
- Cualquier otra falla cuenta como regresión.

### 4.1 Resultados

Tabla en §4.2. Datos de la corrida:
- PostgreSQL **16.15** (local) y **17.11** (contenedor oficial `postgres:17` aislado).
- Bases nuevas, una por combinación.
- Suite completa de integración: 226 pruebas.

### 4.2 Resultados por combinación

| Combinación (camino de aplicación) | PG 16 | PG 17 | Fallas esperadas | Regresiones |
|---|---|---|---|---|
| 0015 (estado actual de Preview) | 164 ✓ / 62 ✗ | 164 ✓ / 62 ✗ | 42 exigen 0016 · 20 exigen 0017 | **0** |
| 0015 + 0017 (`0017_pegar` → `0017_revertir` → `0017_pegar`) | 184 ✓ / 42 ✗ | 184 ✓ / 42 ✗ | 42 exigen 0016 | **0** |
| 0016 | 206 ✓ / 20 ✗ | 206 ✓ / 20 ✗ | 20 exigen 0017 | **0** |
| 0016 + 0017 (migrate + revertir/pegar con guarda de doble pegado) | **226/226** | **226/226** | — | **0** |
| 0015 + 0017 + **0016** (orden inverso: `0017_pegar` y luego `0016_pegar`) | **226/226** | **226/226** | — | **0** |

**Código desplegado hoy en Preview (`9220227`, Fase 1 de 0016) sobre 0015 + 0017 (PG 17):** 158 pasan y 44 fallan.
- 42 fallas son las de aislamiento, que exigen 0016.
- Las otras 2 afirman la lista **exacta** de funciones y permisos de su versión; 0017 añade `recovery_mask` y `recovery_retention_sweep`, de ahí la diferencia.
- 0 fallas funcionales.

Conclusión: **0017 se puede pegar con el código que ya está desplegado**, y también antes o después de 0016.

En esta corrida `R2-10` (rutas de recuperación con 503 y el resto funcionando) **pasa** también en las bases sin 0017. Es la prueba real de degradación controlada, no una simulación.

## 5. Respaldos con 0017

Prueba con `scripts/verify-backups-0017.sh`:
- Origen: PostgreSQL 16, con datos de la suite e incluyendo 227 solicitudes de recuperación.
- Destino: PostgreSQL 17 aislado, que es el mismo motor que indica la guía de `vlux-ops`.

| Estado del origen | `backup-verify.sh` | `restore-drill.sh` (respaldo cifrado AES-256) | Permisos por columna y funciones 0017 = origen | Copia operable como `vlux_app` (RLS + barrido) |
|---|---|---|---|---|
| 0015 | OK | OK | sí | n/a |
| 0015 + 0017 | OK | OK | sí | rls-ok · barrido-ok |
| 0016 | OK | OK | sí | n/a |
| 0016 + 0017 | OK | OK | sí | rls-ok · barrido-ok |
| 0015 + 0017 + 0016 | OK | OK | sí | rls-ok · barrido-ok |

Prueba negativa: con el `grants.sql` anterior a 0017 (el que hoy tiene `vlux-ops`, versión 0016), `backup-verify.sh` **falla** con «permisos de vlux_app distintos al origen». El problema se detecta y no pasa en silencio.

**Sincronización de `vlux-ops` preparada, no aplicada:** `docs/release-1.0/parches/vlux-ops-sincronizar-0017.patch`.
- Solo cambia `ops/grants.sql`: un bloque condicional para 0017.
- Se aplica sobre la versión ya sincronizada con 0016.
- `backup-verify.sh`, `restore-drill.sh` y el workflow **no cambian**.
- Alternativa: `ops/vlux-ops/export.sh <clon>`.

## 6. Plan de despliegue compatible con la Fase 2 de 0016

Principio: **0017 es aditiva e independiente de 0016**. El código 1.0.x funciona con 0015, 0015+0017, 0016 y 0016+0017. El código desplegado hoy (rc.1) funciona con 0015+0017, aunque **no** con 0016 (eso no cambia: ver `DEPLOY_0016_PLAN.md`). Así, 0017 no añade ninguna fase ni restricción nueva a la transición de dos fases de 0016.

### 6.1 Orden recomendado (cada paso lo autoriza Vlux por escrito)
Estado de partida (según el registro del proyecto): la **Fase 1 de 0016 ya se ejecutó**. El commit `9220227` del PR #4 está desplegado en ambos Preview, Supabase sigue en 0015 y `vlux-ops` ya tiene `grants.sql` de 0016.

1. **Desplegar 1.0.x (este PR) en los dos proyectos de Preview**, con el mismo procedimiento y la misma reversión que la Fase 1. Es compatible con 0015, que es el estado actual. El esquema sigue en 0015. Las pantallas de recuperación muestran «pídelo en caja» y el resto funciona igual, como en la matriz 0015.
   - Antes de compilar, definir `VITE_VLUX_LANDING_URL` si ya hay una landing comercial. Si no, el botón usa WhatsApp comercial.
   - **No** agregar `CRON_SECRET` ni programar nada en este paso. La retención es una tarea aparte (§8); el procedimiento exacto está en `TAREA_RETENCION_0017.md` §5.
2. **Fase 2 de 0016 (sin cambios):** pegar `0016_pegar_en_supabase.sql` y verificar con `0016_verificar_solo_lectura.sql`. Sincronizar `vlux-ops` con el parche de 0016.
3. **0017**, como paso independiente, en cualquier momento después de la Fase 1:
   1. Respaldo manual fresco desde `vlux-ops` (sin tocar `BACKUP_SCHEDULE`).
   2. Pegar `0017_pegar_en_supabase.sql`. Es transaccional, tiene guardas contra doble pegado y exige 0001–0015.
   3. Pegar `0017_verificar_retencion.sql`: todas las filas deben decir «sí».
   4. Aplicar `parches/vlux-ops-sincronizar-0017.patch` en `vlux-ops` (o ejecutar `ops/vlux-ops/export.sh`) **en el mismo paso**. Después, un respaldo manual con `backup-verify.sh` verde.
   5. Prueba de humo: pedir recuperación desde un teléfono de prueba en un negocio de demostración (no Odalex), generar el enlace y cerrarlo.
   6. Retención: `RECOVERY_RETENTION_SECRET` en el proyecto interno → `?dryRun=1` → corrida real → `0017_verificar_retencion.sql`. Programarla con Vercel Schedules es opcional y va aparte (`TAREA_RETENCION_0017.md` §6).

   La matriz cubre también el orden inverso, 0017 antes de 0016 (`0015+0017+0016`).
4. Pruebas físicas (§6.4) antes de ofrecerlo a negocios reales.

### 6.2 Reversión
| Situación | Acción | Efecto |
|---|---|---|
| Problema con la recuperación tras 0017 | Pegar `0017_revertir_en_supabase.sql` | Borra las solicitudes y el WhatsApp del negocio. No hace falta redesplegar: en ≤60 s, o al primer error, las rutas pasan a 503 y el resto sigue (R2-18). Volver a sincronizar `vlux-ops` no es obligatorio, porque `grants.sql` es condicional. |
| Error al pegar 0017 | `ROLLBACK;` | Sin cambios |
| Problema con 0016 | Ver `DEPLOY_0016_PLAN.md` | 0017 no interfiere: la matriz `0016+0017` y `0015+0017+0016` está verde |
| Código 1.0.x con fallas | Promover el despliegue anterior **solo si 0016 no está aplicada** (regla vigente) | rc.1 sobre 0015+0017: 146/148; las 2 que fallan afirman la lista exacta de funciones y permisos de rc.1, no son fallas funcionales |

### 6.3 Qué no cambia
No hay cambios en Odalex, secretos, programación de respaldos, Production ni `main`.

### 6.4 Guion de prueba física (15 min, un iPhone, un Android y una impresora)
1. Desde cada teléfono: Panel → Accesos → «Imprimir cartel» (carta). Debe salir **una hoja**, sin hoja en blanco extra.
2. Escanear el QR impreso con los dos teléfonos a 1 m: debe abrir la tarjeta del negocio de prueba.
3. «Descargar PDF» en cada teléfono y abrirlo desde Archivos o Descargas: carta, una página.
4. Cliente: «Perdí mi acceso» → mensaje enviado. Dueño: bandeja → generar enlace → «Enviar por WhatsApp» debe abrir WhatsApp con el número **registrado** (no enviar) → cancelar.
5. «Conocer VLUX Loyalty» y «Soporte por WhatsApp» abren WhatsApp con el mensaje correcto (no enviar).

## 7. Veredicto

| Decisión | Veredicto | Condición |
|---|---|---|
| Código 1.0.x listo para desplegar en **Preview** (con autorización) | **GO** | Verificaciones de este informe en verde. Sin regresiones en 10 combinaciones de esquema × motor. Dos revisiones independientes; la última, «aprobado con reservas», con todas sus reservas atendidas o documentadas como residuales |
| Pegar **0017** en Supabase Preview | **GO técnico, condicionado** | Se cumplen tres cosas: (a) respaldo manual fresco; (b) parche de `vlux-ops` en el mismo paso; (c) correr la tarea independiente de retención (primero `dryRun`) y decidir si se programa. Sin programarla, la retención depende de la actividad o de correrla a mano (riesgo residual 3). Activarla **no** dispara avisos (§8) |
| Ofrecerlo a **negocios reales** (piloto comercial) | **NO-GO** | Faltan cuatro cosas: (1) pruebas en iPhone, Android e impresora **físicos** (§6.4); (2) humo manual de la Fase 1 y la Fase 2 de 0016, que siguen pendientes según el registro del proyecto; (3) decidir y publicar `VITE_VLUX_LANDING_URL`, o aceptar el WhatsApp comercial; (4) aviso de privacidad que mencione las solicitudes de recuperación y su retención (30/7/90 días) |
| Production / `main` | **Fuera de alcance** | No se tocó |

No se declara terminado lo que no se verificó:
- Safari con WebKit real, impresión física y WhatsApp real quedan **pendientes**.
- La schedule de Vercel queda **preparada pero sin probar en Vercel**: es beta pública y no se activó por instrucción de Vlux.
- Latencia y bloqueos de 0017 en Supabase **no medidos**: es aditiva y no reescribe tablas, así que se esperan bloqueos breves, pero no está medido.

## 8. Tarea de retención independiente (2026-11-08, a petición de Vlux)

Vlux pidió que habilitar la limpieza de datos no pueda disparar avisos a los negocios existentes (en especial Odalex). Detalle, procedimiento y despliegue paso a paso: **`TAREA_RETENCION_0017.md`**.

- `GET /api/internal/notifications/run` quedó **idéntica** a `9220227` (sin retención). Nueva `GET /api/internal/recovery/retention`: solo `recovery_retention_sweep()`; Bearer de servidor (`RECOVERY_RETENTION_SECRET` o `CRON_SECRET`, ≥32); `limit` 1..2000; 3 s / 1 s / 5 s de tiempos en la base; candado contra solapes; `dryRun` que ejecuta y deshace.
- **Pruebas nuevas:** 10 de integración (RT-01…RT-10) y 3 unitarias. RT-03 demuestra que no sale ningún aviso, correo ni push con una notificación lista en cola, y su control positivo la envía por la ruta de avisos.
- **Matriz con la tarea nueva (PG 16.15 y 17.11):** 0015 168 ✓ / 62 ✗ · 0015+0017 194 / 42 · 0016 210 / 20 · 0016+0017 **236/236** · 0015+0017+0016 **236/236**. El clasificador informa «SIN REGRESIONES»: las fallas son las mismas esperadas (exigen 0016 o 0017). Las RT pasan en todas; las que exigen 0017 se omiten donde no existe.
- **Parche `vlux-ops-sincronizar-0017.patch` antes de 0017:** se aplica limpio sobre el `grants.sql` de `9220227` (el sincronizado con 0016), es reversible y el resultado es idéntico al `ops/grants.sql` de la rama. Con ese archivo, `backup-verify.sh` y `restore-drill.sh` pasan en las bases **0015** y **0016** (sin 0017) y también con 0017 (`verify-backups-0017.sh`: «TODO OK», permisos finos idénticos, el rol de la app en la copia lee y barre).
- **Regresión:** unitarias 96/96, integración 236/236, E2E de UX 43/43, regresión v0.4.3–v0.4.6 OK.
- **Revisión independiente `msa-lud-dev`:** `REVISION_INDEPENDIENTE_MSA_LUD_DEV.md` §3 (aprobado con reservas; H1, H3, H4, H5, H6 y H9 corregidos; H2, H7, H8 documentados o por verificar antes de activar).
- **Vercel Schedules:** declaración preparada y **apagada** en `scripts/build-vercel.mjs` (bandera + Preview). No se activó nada ni se desplegó.
