# VLUX Loyalty 1.0 · Runbook de operación

> Para el equipo VLUX durante el piloto controlado. Supone la arquitectura de `PRODUCTION_ARCHITECTURE.md` (aún no creada). Mientras solo exista Preview, aplica igual cambiando "Production" por "Preview".
> Regla de oro: **primero proteger datos, luego restaurar servicio, luego explicar.** Nunca borrar registros para "arreglar" algo: las bitácoras son de solo inserción a propósito y las correcciones se hacen con anulaciones.

## 1. Monitoreo diario (10 min, hábiles)
| Qué | Dónde | Normal | Acción si no |
|---|---|---|---|
| Disponibilidad | Monitor externo → `GET /api/health?db=1` cada 5 min | `{"ok":true,"db":true,"version":"1.0.0-rc.1"}` | §3-A / §3-B |
| Errores de la app | Vercel → proyecto → Logs / Observability, filtro `status >= 500` | 0–2 al día | Revisar el mensaje; si se repite, §3-B |
| Respaldo de anoche | `vlux-ops` → Actions → "Respaldo diario" | Verde | §4 |
| Issue de alerta | Issues abiertos con "Respaldo diario FALLÓ" | Ninguno | §4 |
| Asesores Supabase | Dashboard → Advisors (Security/Performance) | 0 ERROR, 0 WARN de seguridad | Abrir tarea; no corregir en caliente |
| Capacidad BD | Dashboard → Reports → Database: tamaño, conexiones, CPU | < 50 % de 8 GB; conexiones < 70 % | §5 |
| Uso Vercel | Settings → Usage | Dentro de los USD 20 incluidos | §5 |

## 2. Calendario de vencimientos
| Elemento | Frecuencia | Responsable |
|---|---|---|
| Certificados TLS | Automáticos (Vercel). Revisar mensual que el dominio diga "Valid Configuration" | Vlux |
| Dominio | Renovación anual con auto-renovación activada | Vlux |
| Contraseña `vlux_app` y del dueño del esquema | Cada 6 meses o al salir alguien | Vlux |
| `PLATFORM_ADMIN_TOKEN` | Rotar después del alta inicial y cada 6 meses | Vlux |
| `BACKUP_PASSPHRASE` | No rotar sin conservar la anterior (los respaldos viejos la necesitan) | Vlux |
| Tarjeta de pago de Vercel/Supabase | Revisar fecha de vencimiento trimestral (si falla el cobro, el servicio se degrada) | Vlux |
| Simulacro de restauración | Mensual durante el piloto (`ops/restore-drill.sh`) | Vlux |
| Prueba en teléfonos físicos | En cada versión nueva y al salir iOS/Android mayores | Vlux |

## 3. Incidentes
Severidad: **S1** datos expuestos o caída total · **S2** una función clave falla para un negocio · **S3** molestia con solución alterna.
Para todo S1/S2: anotar hora de inicio, síntomas, acciones y hora de cierre en `incidentes/AAAA-MM-DD.md` del repo privado `vlux-ops`.

### A. Supabase no disponible (health `db:false` o 503)
1. Confirmar en status.supabase.com y Dashboard → Project status. ¿Proyecto pausado? (en Free ocurre tras 1 semana sin actividad; en Pro no): Restore project.
2. Avisar a los negocios: "La caja no puede registrar por ahora; anota en papel nombre del cliente y compra, lo capturamos al volver". Plantilla en §6.
3. No reintentar en masa ni redeplegar: la app ya devuelve error claro y no duplica (llaves de idempotencia).
4. Al volver: `health?db=1`, capturar las compras en papel con la fecha real en la nota.
5. Si la caída supera el RTO (4 h) → evaluar restauración en proyecto nuevo (`BACKUP_RECOVERY.md`).

### B. Vercel con errores (5xx, página en blanco)
1. Vercel → Deployments: ¿hubo despliegue reciente? Sí → **Instant Rollback** al anterior y verificar. Listo.
2. No hubo despliegue: revisar Logs. Errores de conexión a BD → §A. `PUBLIC_BASE_URL is required` u otra variable → revisar variables (alguien las cambió) y redesplegar.
3. vercel-status.com si es general: comunicar y esperar.

### C. El dueño no puede iniciar sesión
1. Verificar en Control Center → Negocios → Accesos que la cuenta exista y esté activa; revisar si está bloqueada por intentos (límite de frecuencia: esperar 15 min).
2. Si olvidó la contraseña: Control Center genera **enlace de restablecimiento** de un solo uso; entregarlo por un canal verificado (llamada o WhatsApp al número registrado). Nunca por un número nuevo sin verificar identidad.
3. Si sospecha que alguien entró: cerrar sesiones (restablecer contraseña revoca sesiones) y revisar la bitácora del negocio.

### D. Operación equivocada en caja (sello o compra de más)
1. El dueño **anula** la compra en el panel (Actividad → Anular) con motivo. El saldo se corrige y queda rastro.
2. Si ya se canjeó una recompensa por error: no se borra; se anota en la bitácora y el negocio decide.
3. Nunca editar tablas a mano: las bitácoras rechazan UPDATE/DELETE por diseño.

### E. El cliente perdió acceso a su tarjeta (cambió de teléfono, borró el navegador)
1. En caja: buscar al cliente por nombre o los últimos dígitos del código de tarjeta.
2. "Nuevo enlace de tarjeta" → el cliente escanea el QR en caja. El enlace anterior deja de servir.
3. Si no se encuentra: verificar que no sea otro negocio. No crear una tarjeta nueva para "pasar" sellos sin decisión del dueño.

### F. Falla una invitación de empleado o dueño
1. Ver estado en Control Center/panel → Invitaciones (vencida, usada, revocada).
2. Revocar y generar otra; entregar el enlace por WhatsApp/copiar o con **código presencial**. El correo está desactivado en esta versión.
3. "Enlace inválido": suele ser enlace cortado por el chat → copiarlo completo o usar el QR.

### G. La PWA no abre o no se actualiza
1. Pedir abrir la tarjeta en el navegador (Safari/Chrome) con su enlace: si ahí funciona, el problema es el ícono.
2. iPhone: borrar el ícono y volver a "Agregar a inicio" desde Safari. Android: Chrome → ⋮ → Instalar app.
3. Si muestra versión vieja: cerrar por completo y abrir; el service worker se actualiza en la siguiente apertura.
4. Registrar modelo, sistema y navegador en `DEVICE_TESTS.md` como hallazgo.

### H. Posible exposición de datos (S1)
1. **Contener** (minutos): según el caso, rotar la credencial filtrada (contraseña BD, `ADMIN_SECRETS_KEY`, token), revocar sesiones del Control Center, o pausar el proyecto de Vercel afectado.
2. **Preservar evidencia**: no borrar registros; exportar logs de Vercel y bitácoras (`audit_events`, `platform_audit_events`) del periodo.
3. **Evaluar alcance**: qué negocios, cuántos clientes, qué campos (nombre visible, WhatsApp/correo).
4. **Notificar**: a los negocios afectados (son responsables de los datos de sus clientes) sin demora; la ley mexicana exige informar a los titulares cuando la vulneración afecte significativamente sus derechos. **Validar con el abogado** el texto y si procede aviso a la autoridad.
5. Post-mortem en 5 días hábiles con causa raíz y prueba que impida repetirlo.

### I. Restauración de base de datos
Procedimiento completo en `BACKUP_RECOVERY.md` → "Restauración real". Siempre restaurar primero en base aislada.

## 4. Respaldo falló
1. Abrir la ejecución fallida: el paso indica la causa (conexión, verificación, cifrado).
2. Conexión/secretos: revisar que `SUPABASE_BACKUP_URL` siga vigente (cambio de contraseña lo rompe).
3. Verificación (conteos, libro mayor, permisos): **no ignorarla**; puede indicar daño real o un cambio de esquema sin actualizar `ops/grants.sql`. Ejecutar a mano y revisar antes del siguiente día.
4. Mientras tanto, el respaldo diario de Supabase Pro sigue siendo la red de seguridad. Dos días seguidos sin respaldo propio = S2.

## 5. Capacidad
| Señal | Umbral | Acción |
|---|---|---|
| Disco BD | > 6 GB de 8 | Revisar crecimiento (`PERFORMANCE.md`); el excedente cuesta USD 0.125/GB |
| Conexiones | > 70 % | Bajar `PG_POOL_MAX` o subir cómputo (con autorización) |
| CPU BD sostenida | > 70 % en horario pico | Revisar `pg_stat_statements`; subir a Small (USD 15) con autorización |
| p95 de la caja | > 1 s | Revisar logs de Vercel por región/arranque en frío |

## 6. Plantillas de comunicación
- **Caída:** "Hola, [negocio]. Estamos teniendo una falla técnica con VLUX Loyalty desde las [hora]. Mientras la resolvemos, anota en papel el nombre del cliente y su compra; nosotros los capturamos. Te avisamos en cuanto esté arreglado."
- **Resuelto:** "Listo, VLUX Loyalty ya funciona. Mándanos la lista de compras anotadas y las capturamos hoy. Disculpa la molestia."

## 7. Reversión de despliegue
Vercel → Deployments → despliegue anterior "Ready" → ⋯ → **Instant Rollback**. Verificar `health?db=1` (la versión debe ser la anterior). Las migraciones no se revierten (ver `PRODUCTION_ARCHITECTURE.md`).
