# Auditoría de datos en Preview (versión pública, sin datos del negocio real)

> Versión pública mínima. El detalle (conteos, clasificación por negocio, fechas, giro) vive solo en la carpeta privada del proyecto. Método: consultas de solo lectura sobre el catálogo y agregados; nada se modificó.

## Conclusiones
1. El proyecto Preview contiene datos de **un negocio real** además de datos de demostración y de origen no confirmado. Por regla, **ningún dato de cliente se trata como sintético** salvo el que se genera con el sembrador sintético del repositorio (dominios reservados).
2. Por eso un respaldo de Preview **contiene datos personales** y exige las protecciones de `DATA_PROTECTION_PLAN.md`: cifrado, repositorio privado, acceso restringido, retención acotada y restauración solo en bases aisladas.
3. La información de clientes de ciertos giros (por ejemplo, salud) se trata con el criterio más estricto de la LFPDPPP aunque no haya notas clínicas.
4. No hay evidencia de envío de correos ni de notificaciones desde esos datos.
5. Aislamiento entre negocios: ver `TENANT_ISOLATION_AUDIT.md` y, para la corrección, `RLS_SECURITY_AUDIT.md`.

## Regla para pruebas y documentación
- Las pruebas usan **solo** datos sintéticos generados localmente. Ninguna consulta de prueba lee ni escribe filas del negocio real.
- No se publican en este repositorio nombres, contactos, identificadores, giros, fechas de alta ni conteos por negocio real.
