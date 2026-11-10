# Tarea de retención de 0017 separada de los avisos · procedimiento de despliegue en ambos Preview

Estado al 2026-11-08: **código listo en el PR #5, nada desplegado, nada activado.** Supabase Preview sigue en 0015, sin 0016 ni 0017. Este documento sirve de guía: ningún paso se ejecuta sin la autorización expresa de Vlux.

## 1. Qué cambió y por qué

Antes, `GET /api/internal/notifications/run` ejecutaba la retención de «Perdí mi acceso» y luego `runNotificationJob()`. Programarla para limpiar datos habría disparado también los avisos de todos los negocios, incluida Odalex.

Ahora son dos tareas independientes:

| Ruta | Qué hace | Quién la puede llamar |
|---|---|---|
| `GET /api/internal/notifications/run` | Solo avisos. Es **idéntica** al commit `9220227`; se verificó con `diff` y con la prueba RT-04 | `Bearer CRON_SECRET` (≥32) |
| `GET /api/internal/recovery/retention` | Solo `recovery_retention_sweep()`: vence (30 días o 7 días tras generar el enlace), enmascara y borra a los 90 días. No lee ni escribe avisos, correos ni push | `Bearer RECOVERY_RETENTION_SECRET` o `Bearer CRON_SECRET` (≥32 cada uno) |

Detalles de la ruta de retención:

- **Autenticación de servidor.** Usa `bearerMatchesAny()` con comparación en tiempo constante.
  - Un secreto ausente o de menos de 32 caracteres cuenta como cerrado.
  - Solo acepta la cabecera `Authorization: Bearer …`: nunca por URL, cookie ni sesión de personal.
  - `RECOVERY_RETENTION_SECRET` **no** abre la ruta de avisos.
  - Ningún secreto lleva prefijo `VITE_`, así que no llega al navegador.
- **Límites.**
  - `?limit=1..2000` (500 por omisión). Fuera de ese rango responde 422 sin ejecutar nada.
  - En la base: `statement_timeout 3s`, `lock_timeout 1s` e `idle_in_transaction_session_timeout 5s`.
  - Un candado asesor `pg_try_advisory_xact_lock` impide dos barridos a la vez. Si ya hay uno corriendo, responde `busy:true` sin esperar.
  - La función de Vercel se corta a los 15 s.
- **Prueba sin cambiar datos (`?dryRun=1`).** Ejecuta la función completa y luego hace `ROLLBACK`. Responde cuántas filas vencería o borraría, sin modificar nada (prueba RT-05, con huella md5 de la tabla antes y después).
- **Compatibilidad.**
  - Sin 0017 responde `200 {available:false}`.
  - Con 0016 corre con alcance `worker`; sin alcance, la función se niega (RT-08).
  - Con 0017 aplica la retención.
- **Respuesta:** `{available, busy, dryRun, limit, expired, deleted, ms}`. Nunca incluye contactos.
- El **respaldo oportunista** de la app (cada 10 min, máximo 200 filas, al haber actividad de recuperación) se mantiene y comparte el mismo candado.

## 2. Evidencia de «no genera mensajes» (pruebas RT-01…RT-10)

Archivo: `tests/integration/v1-retention-task.test.ts`.

- **RT-03.** El escenario de prueba es un negocio con cliente suscrito a push y **una notificación lista en cola**, más dos solicitudes que deben vencer o borrarse. La ruta de retención aplica la retención y, después:
  - las huellas de `notification_outbox`, `email_outbox` y `push_subscriptions` son idénticas a las de antes;
  - se registran 0 envíos push y 0 solicitudes HTTP salientes, porque `fetch` está interceptado;
  - la notificación sigue `queued`.

  **Control positivo:** acto seguido, la ruta de avisos sí envía esa misma notificación. Así se demuestra que la prueba habría detectado un envío.
- **RT-04.** La ruta de avisos ya no barre: su respuesta no trae `recoveryRetention` y las filas quedan intactas.
- **RT-09.** Garantía estática: `services/recovery.ts` no importa notificaciones, push ni correo, y la ruta no llama a nada de eso.

## 3. Vercel Schedules (investigación, 2026-11-08)

Fuente: documentación oficial (vercel.com/docs/schedules: configuration, manage, handle-runs, migrate-from-cron-jobs) y el anuncio de beta pública.

**Lo confirmado:**

- **Estado del producto.**
  - Beta pública.
  - Sustituye a Cron Jobs, que la documentación ya llama «legacy».
  - Funciona en cualquier entorno, incluido Preview.
- **Declaración.**
  - Las schedules estáticas se declaran en `schedules` de `vercel.json`, o en `.vercel/output/config.json` cuando se usa la Build Output API, como en este proyecto.
  - Destinos posibles: `path`, `function` o `topic`.
- **Preview.** Una schedule estática nueva en una rama de Preview **nace inactiva**.
  - Se prueba una vez con `vercel schedules invoke <nombre> --git-branch <rama>`.
  - Se habilita por tiempo limitado con `vercel schedules enable <nombre> --git-branch <rama> --for 1h`.
  - El estado que se fija se conserva entre despliegues.
- **Destino `path`.**
  - Vercel envía `POST` por omisión; `requestMethod: "GET"` lo cambia.
  - Manda `Authorization: Bearer <CRON_SECRET>` si `CRON_SECRET` existe, junto con `user-agent: vercel-cron/1.0` y cabeceras `ce-*`.
  - El cuerpo va vacío.
- **Desactivación.** `vercel schedules disable <nombre>` la desactiva sin redesplegar.
- **Convivencia con Cron Jobs.** Si se declaran `crons` y `schedules` para la misma ruta, la ruta corre dos veces. Aquí no hay `crons`.

**Lo que no está confirmado o se infiere:**

- El estado inicial en **Production**. La documentación solo dice que en Preview y en entornos personalizados nace inactiva, así que hay que **suponer que en Production nace activa**. Por eso la declaración está detrás de una bandera de compilación.
- Precio y límites por plan en beta.
- Si la ruta `path` admite parámetros de consulta. No se usan: el límite por omisión (500) basta.

**Hecho del entorno, leído con la herramienta de Vercel sin descifrar nada:**

- Ninguno de los dos proyectos tiene hoy `CRON_SECRET`, llaves VAPID ni SMTP en Preview. Por eso la ruta de avisos responde 401 y en Preview no puede salir ningún push ni correo.
- No hay entornos personalizados. Los despliegues aparecen como `target: staging` y son de Preview.
- Los pushes a esta rama **no** generaron despliegues automáticos: el último despliegue de ambos proyectos sigue siendo `9220227`.

### Configuración preparada (apagada)

En `scripts/build-vercel.mjs`:

```js
const RECOVERY_RETENTION_SCHEDULE = {
  'recovery-retention': { schedule: '47 8 * * *', timezone: 'UTC', path: '/api/internal/recovery/retention', requestMethod: 'GET' },
};
if (process.env.VLUX_SCHEDULE_RECOVERY_RETENTION === '1' && process.env.VERCEL_ENV === 'preview') config.schedules = RECOVERY_RETENTION_SCHEDULE;
```

La schedule corre diario a las 08:47 UTC (02:47 en Ciudad de México), 30 min **antes** del respaldo diario de las 09:17 UTC, para que el respaldo ya no lleve contactos vencidos.

- **Sin la variable:** el `config.json` no declara ninguna schedule. Se verificó compilando sin la variable, con ella sin `VERCEL_ENV` y con ella en `preview`.
- **Doble llave (revisión H1):** además de la variable exige `VERCEL_ENV=preview`, así que un build de Production no la declara aunque la variable exista «para todos los entornos». Aun así, créala **solo para Preview**.
- **Con la variable, en Preview:** queda declarada pero **inactiva** hasta que alguien la habilite por rama.

**Recomendación:** no usar `CRON_SECRET` en Preview mientras no se quiera programar la tarea. La ruta de retención funciona con `RECOVERY_RETENTION_SECRET`, que **no** abre la ruta de avisos.

Para que la schedule corra sola, Vercel necesita `CRON_SECRET`, que también abre la ruta de avisos para quien lo tenga. **Advertencia:** si más adelante se agregan llaves VAPID o SMTP con `CRON_SECRET` presente, esa ruta puede enviar avisos reales con un simple `curl` autenticado. El `CRON_SECRET` debe ser ASCII imprimible sin espacios, de 32 a 512 caracteres; otro formato da 401 silencioso. Ninguna schedule llama a esa ruta, y en Preview no hay VAPID ni SMTP, pero la decisión es de Vlux.

**Alternativa sin `CRON_SECRET`:** usar un destino `function` privado (`experimentalTriggers: schedule/v1beta`). Requiere una segunda función en la Build Output. No se implementó para no abrir otra fase de desarrollo.

## 4. Probar la retención sin tocar datos reales

- **Local, en una base de prueba:**
  ```bash
  npm run test:integration
  node --env-file=.env.test --import tsx --test --test-concurrency=1 tests/integration/v1-retention-task.test.ts
  ```
- **Preview, después de 0017 y solo con autorización:**
  - Primero `?dryRun=1`: ejecuta y deshace, sin cambios.
  - Después, la consulta de solo lectura `0017_verificar_retencion.sql`.

  El sandbox de Claude no llega a `*.vercel.app`, así que el comando se corre desde la máquina de Vlux. La ruta vive en el proyecto **interno** (donde se configura el secreto), que está detrás del login de Vercel: se usa `vercel curl`, que pasa la protección. Si Vercel responde 401/403 antes de llegar a la app, no es la autenticación de la tarea sino la protección del despliegue.
  ```bash
  # Pide el secreto sin mostrarlo ni guardarlo en el historial:
  read -rs RET && vercel curl "/api/internal/recovery/retention?dryRun=1" --deployment https://vlux-loyalty-vlux-s-projects.vercel.app \
    -- -H "Authorization: Bearer $RET"; unset RET
  ```
  Pendiente de comprobar en Vercel (H7): que las llamadas de una Schedule atraviesen esa protección. Se verifica con `vercel schedules invoke` antes de habilitarla; si falla, configurar el bypass de automatización.
  Sin 0017 responde `{"available":false,…}`. Con 0017 responde los conteos de lo que haría.

## 5. Procedimiento exacto para desplegar el código UX (PR #5) en ambos Preview

Requisito: **autorización expresa de Vlux**. Este procedimiento no aplica 0016 ni 0017, no cambia secretos, no toca Odalex, Production ni `main`.

| Proyecto | id | Despliegue vigente (`9220227`) = reversión |
|---|---|---|
| `vlux-loyalty` (interno) | `prj_Lw00KhaMT0aYMXbzcP2L2q1UYrZl` | `dpl_7ceMd1mH5EbD9oWi2JbWzj1UijBN` |
| `vlux-loyalty-demo` | `prj_jGgwKOO4Dc1XReDAtoEVVwar0y0E` | `dpl_9uPPfPv1WT2gtuewPBgs9qCea86s` |

Equipo `team_UfkcOHiredBxALAjWFrswOFE`.

**Antes (no cambia nada):**

1. Fijar el SHA final del PR #5, el último commit con CI en verde, y anotarlo.
2. Correr manualmente el flujo «Respaldo diario verificado» de `vlux-ops` y confirmar que termina con éxito. Sin tocar `BACKUP_SCHEDULE`.
3. Conteos agregados por tabla en Supabase Preview (solo `count(*)`) y huella de Odalex (la misma consulta de hash usada en la Fase 1), para comparar al final.
4. **No** agregar `CRON_SECRET`, `RECOVERY_RETENTION_SECRET` ni `VLUX_SCHEDULE_RECOVERY_RETENTION` en este paso. Sin ellas, la ruta de retención responde 401 y no existe ninguna schedule.

**Desplegar (mismo SHA en los dos proyectos):**

5. En Vercel → proyecto → Deployments → «Create Deployment»: rama `claude/project-thread-bcmxkp` y el SHA anotado. Primero el interno, luego la demo.
   - Equivale a la herramienta `create_deployment` con `gitSource {type: github, org: lilpne25-ui, repo: vlux-loyalty, ref: <SHA>}` y destino Preview, como en la Fase 1.
6. Esperar a que ambos estén en `READY`. El *build command* es el de siempre (`npm run build:vercel`).
   - En el log del build **no** debe aparecer «Vercel Schedules: recovery-retention DECLARADA».
   - Además, `vercel schedules list --git-branch claude/project-thread-bcmxkp` debe devolver vacío.

**Verificar (solo lectura, ~10 min):**

7. `GET /api/health?db=1` en ambos → `{"ok":true,"db":true,…}`.
8. Comprobar que las rutas nuevas degradan bien con 0015:
   - `GET /api/internal/recovery/retention` sin cabecera → **401**;
   - `GET /api/internal/notifications/run` sin cabecera → **401**, igual que hoy.
9. Humo manual con el negocio sintético `sintetico-fase1`:
   - dueño: Accesos → Cartel (PDF/PNG);
   - Ayuda en la tarjeta: al enviar «Perdí mi acceso» aparece «Pídelo en caja · La recuperación en línea aún no está activa». Sin 0017 la API responde 503 `recovery_unavailable` y no guarda nada;
   - «Reportar problema» abre WhatsApp;
   - caja: un sello y un canje;
   - cerrar sesión.
10. Los conteos por tabla y la huella de Odalex deben coincidir con los del paso 3, salvo las filas del negocio sintético. Además: 0 errores en los registros de ejecución durante 30 min.

**Reversión:** promover `dpl_7ceMd1mH5EbD9oWi2JbWzj1UijBN` (interno) y `dpl_9uPPfPv1WT2gtuewPBgs9qCea86s` (demo). Es seguro mientras el esquema siga en 0015 o 0016, porque el código 1.0.x no requiere 0017.

## 6. Después, por separado y con autorización (no forma parte de este paso)

1. Instalar el parche `vlux-ops-sincronizar-0017.patch` en `vlux-ops`. **Puede instalarse antes de 0017:** se aplica limpio sobre el `grants.sql` sincronizado con 0016, y los respaldos y el simulacro pasan en 0015 y 0016 con el archivo parchado (sección 7). Después, un respaldo manual fresco.
2. Pegar `0017_pegar_en_supabase.sql` (checksum `a36831fe…`), luego `0017_verificar_retencion.sql`.
3. Agregar `RECOVERY_RETENTION_SECRET` (≥32, tipo *sensitive*) en el proyecto interno y redesplegar ese mismo SHA para que la función lo lea.
4. Correr la retención con `?dryRun=1`, luego sin `dryRun`, y repetir `0017_verificar_retencion.sql`.
5. Programación automática (opcional), en este orden:
   - agregar `CRON_SECRET` en el proyecto interno;
   - agregar `VLUX_SCHEDULE_RECOVERY_RETENTION=1` como variable de **build** del interno, nunca de la demo, para que solo un proyecto ejecute la tarea;
   - redesplegar;
   - `vercel schedules invoke recovery-retention --git-branch <rama>`;
   - si todo va bien, `vercel schedules enable recovery-retention --git-branch <rama>`.

   Para apagarla: `vercel schedules disable recovery-retention --git-branch <rama>`.

## 7. Parche de `vlux-ops` antes de 0017 y respaldos actuales

Ver el informe `CORRECCIONES_1.0.x.md` §8 para los resultados con fecha.
