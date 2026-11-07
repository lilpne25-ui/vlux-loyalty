# Plan para proteger los datos del negocio real · 2026-11-07

**Estado: plan, nada ejecutado.** No se borró, suspendió, anonimizó, modificó, copió ni exportó ningún dato real. No se presupone autorización legal.

## 1. Riesgo vigente (explícito)
Los datos reales del negocio (y 8 contactos de origen no confirmado) viven **solo** en Supabase Preview, un proyecto compartido con la demo, **sin ningún respaldo verificado**: nunca se ha respaldado ni restaurado ese origen. Si el proyecto se pausa, se corrompe, se borra por error o lo afecta una migración, **no hay copia**. El volumen es mínimo (3 clientes, 2 compras) pero el valor no está en el volumen: el negocio puede estar usándolo. Además: Preview es uso no comercial, el aviso de privacidad es un borrador sin aprobación legal y el Data API está sin revisar. **Esto no debe quedarse indefinidamente "porque es Preview".**

## 2. Preguntas que solo el propietario puede responder (bloquean la copia, no el diseño)
| # | Pregunta | Por qué importa |
|---|---|---|
| 1 | ¿Los 3 clientes son personas reales? ¿Qué aviso vieron y qué aceptaron? | consentimiento y base legal |
| 2 | ¿Quién es el **responsable** de esos datos (Odalex) y quién el **encargado** (VLUX)? ¿Hay contrato o carta de encargo? | LFPDPPP: el encargado trata datos por cuenta del responsable bajo instrucciones |
| 3 | ¿Odalex autorizó que VLUX **haga copias** y las guarde en GitHub? ¿Dónde pueden residir? | transferencia/almacenamiento fuera de México |
| 4 | ¿Cuánto tiempo conservar respaldos? (propuesta: 30 días, igual que el artefacto) | minimización |
| 5 | ¿Quién tendrá acceso al repo `vlux-ops` y a la frase? (propuesta: solo el propietario) | control de acceso |
| 6 | ¿Cuál de los dos registros de negocio es el definitivo? | evitar restaurar o migrar el equivocado |
Mientras no haya respuesta a 1–3, **no se hace respaldo real**. Es un bloqueo legal, no técnico.

## 3. Principios
Solo cifrado (AES-256, frase de 40+ caracteres en gestor de contraseñas, nunca en GitHub). Destino privado y restringido. Restauración verificada antes de confiar. Ninguna copia de datos reales en la base sintética, en la demo, en este repositorio público ni en artefactos sin cifrar. Sin exportaciones identificables salvo autorización específica.

## 4. Pasos (cada uno requiere la acción o autorización indicada)
| Paso | Quién | Estado |
|---|---|---|
| 1. Responder la sección 2; aprobar por escrito el tratamiento (carta de encargo) | Vlux + Odalex (+ abogado) | pendiente |
| 2. Confirmar en `vlux-ops` → Settings: secretos `SUPABASE_BACKUP_URL` y `BACKUP_PASSPHRASE` presentes, variable `BACKUP_SCHEDULE` **ausente**, y colaboradores = solo el propietario | Vlux | pendiente |
| 3. Aplicar `ops/backup-verify.sh` corregido (guardas nuevas): `ops/vlux-ops/export.sh` y copiar a `vlux-ops` | Vlux | pendiente |
| 4. Confirmar que `SUPABASE_BACKUP_URL` = rol dueño del esquema (`postgres.<ref>`, Session Pooler 5432) de **Preview** y que ese es el origen autorizado | Vlux (**autorización explícita**) | pendiente |
| 5. **Primer respaldo manual** (`workflow_dispatch`) | Vlux autoriza; yo puedo ejecutarlo | **NO ejecutado** |
| 6. Descargar el artefacto; `restore-drill.sh` en una máquina local con Docker (no Supabase) | Vlux | pendiente |
| 7. Verificar que los conteos coincidan con los de este informe (3 clientes, 3 tarjetas, 2 compras del negocio real) y registrar **BACKUP PREVIEW VERIFIED** | Vlux/yo | pendiente |
| 8. Solo entonces `BACKUP_SCHEDULE=on`; segunda copia cifrada fuera de GitHub | Vlux | pendiente |
| 9. Quitar el workflow del repo público (`parches/main-retirar-respaldo-publico.patch`) | Vlux | pendiente |
**Alternativa inmediata, de menor riesgo legal, mientras se firma el paso 1:** que el propietario del negocio exporte *su propia* información desde su panel (`/api/owner/...`) a su equipo; no la copia VLUX.

## 5. Solicitudes de los titulares y retención
- **Eliminación / cancelación (ARCO):** el sistema ya anonimiza al cliente (`anonymizeCustomer`: borra nombre y contacto, revoca tarjeta y tokens) y conserva métricas agregadas. **Limitación:** un cliente anonimizado después sigue existiendo en respaldos anteriores hasta que caduquen (30 días). Documentar en el aviso y mantener un **registro de solicitudes de borrado** para volver a aplicarlas si se restaura un respaldo viejo.
- **Retención:** respaldos 30 días; sesiones y tokens expiran; no conservar respaldos de un negocio dado de baja más allá de ese plazo.
- **Restaurar sin mezclar negocios:** restaurar siempre a una base nueva y aislada; extraer un negocio con `platform_business_export(uuid)`/consultas por `business_id`; nunca `pg_restore` sobre la base viva. Reaplicar solicitudes ARCO posteriores a la fecha del respaldo.
- **Acceso a respaldos:** el artefacto está cifrado; quien tenga la frase + acceso al repo puede leer todo. Dos llaves separadas: acceso a GitHub y frase en gestor.
- **Incidente:** si se filtran artefacto y frase, tratar como brecha de datos (notificar a Odalex; ver `LEGAL_DRAFTS.md`).

## 6. Qué no se hará sin permiso expreso
Borrar, suspender, anonimizar o modificar Odalex; copiar sus datos a la base sintética; usarlo como demostración; exportarlo con datos identificables; enviar correos o notificaciones (hay 1 invitación y 1 correo pendientes: **no enviar**).
