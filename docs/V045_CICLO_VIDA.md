# V0.4.5 · Ciclo de vida del negocio en el Control Center

## Estados

| Estado | Opera (clientes, caja, panel) | Cuenta en métricas comerciales | Cómo se llega |
|---|---|---|---|
| Activo | Sí | Sí | Alta o Reactivar |
| Suspendido | No | Sí (aparece como suspendido) | Suspender, o Restaurar desde el archivo |
| Archivado | No | No (se cuenta aparte) | Archivar, desde activo o suspendido |
| Eliminado | — | — | Eliminar, solo si está archivado; queda una constancia en `business_deletions` |

La ficha del negocio tiene la sección **Administrar negocio** con estas acciones: Editar, Suspender, Reactivar, Archivar, Restaurar y Eliminar.

## Archivar

- **Requisitos:** escribir un motivo y el nombre exacto del negocio.
- **Efectos, en una sola transacción:**
  - pasa al estado `archived`;
  - **se revocan las sesiones del personal** y las invitaciones pendientes;
  - se registran la auditoría del negocio y la de la plataforma.
- **No se borra ningún dato.**
- **Restaurar** lo regresa a **suspendido**, no a activo. Reactivarlo es una decisión aparte.

## Eliminar (destructivo)

### Candados, en orden

1. **El negocio debe estar archivado.**
2. **Tipo de datos.** Si es un **negocio real con clientes**, no se puede eliminar.
   - Solo se permite si VLUX **declara sus datos como de prueba**. Para eso se escribe `DATOS DE PRUEBA` y se da un código 2FA nuevo, y queda auditado con el nombre del administrador.
   - Este paso existe porque los negocios de prueba que se crearon en Preview no estaban marcados como demo.
   - Los negocios de demostración (`is_demo`) no requieren la declaración.
3. **Vista previa:** muestra conteos de clientes, tarjetas, compras, premios, movimientos, visitas, personal, invitaciones y bitácora. Marca qué personal **se conserva** porque tiene otros negocios y cuál se elimina.
4. **Respaldo obligatorio** del mismo administrador en los últimos 30 minutos.
   - Es un JSON con los datos del negocio, sin hashes de contraseña ni tokens.
   - Se registra su SHA-256 y la eliminación exige esa misma huella.
5. **Confirmación:** escribir el identificador (slug), un motivo y **un código 2FA nuevo**, aunque ya haya sesión. Hay límite de intentos y bloqueo tras 5 fallos.
6. **Ejecución:** `platform_purge_business` corre en una sola transacción.
   - La propia base vuelve a verificar el estado archivado, el slug y el tipo de datos.
   - Borra en orden de dependencias.
   - **Elimina personal solo si no tiene otros negocios ni referencias**; los usuarios compartidos se conservan.
   - Revoca sesiones e invitaciones.
   - Escribe una **constancia** en `business_deletions` (conteos y huella del respaldo, sin datos personales) y la auditoría `business.deleted` en la bitácora de la plataforma. La bitácora ya no depende del negocio, así que sobrevive a la eliminación.

### Defensa en profundidad (probada)

- El rol de la app (`vlux_app`) **no tiene permiso DELETE** sobre las tablas de negocio.
- Las tablas de solo inserción (`stamp_events`, `audit_events`) solo aceptan DELETE dentro de la purga, y solo para el negocio indicado.
- Llamar a la función directamente con un negocio real con clientes se rechaza en la base.

### Lo que NO se hace

- No hay purgas programadas ni automáticas.
- No se eliminó ningún negocio existente en Preview durante el desarrollo.
- Un negocio real se archiva, y su eliminación sigue un procedimiento controlado con respaldo: el administrador decide caso por caso.

### Pruebas

- Integración: T01–T09 en `tests/integration/v045-lifecycle.test.ts`.
- E2E: T38–T39 en `tests/e2e/v045-operacion.cjs`.
