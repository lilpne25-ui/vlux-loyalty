# Plan para proteger los datos del negocio real en Preview

**Estado: plan.** No se borró, suspendió, anonimizó, modificó ni exportó ningún dato real desde las pruebas de este repositorio. No se presupone autorización legal. El detalle numérico está en la carpeta privada.

## 1. Riesgo vigente
Preview contiene datos de un negocio real y contactos de origen no confirmado, en un proyecto compartido con la demo. Preview es de uso no comercial, el aviso de privacidad es un borrador sin aprobación legal y el Data API no se ha revisado. **No debe quedarse indefinidamente "porque es Preview".** Un respaldo real cifrado y su restauración independiente ya existen (ver `GO_NO_GO.md`); falta el resto del programa de protección.

## 2. Preguntas que solo el propietario puede responder
| # | Pregunta | Por qué importa |
|---|---|---|
| 1 | ¿Los clientes son personas reales? ¿Qué aviso vieron y qué aceptaron? | consentimiento y base legal |
| 2 | ¿Quién es responsable y quién encargado? ¿Hay carta de encargo? | LFPDPPP |
| 3 | ¿El negocio autorizó las copias y su almacenamiento? ¿Dónde pueden residir? | transferencia/almacenamiento |
| 4 | ¿Cuánto tiempo conservar respaldos? (propuesta: 30 días) | minimización |
| 5 | ¿Quién accede al repositorio privado de respaldos y a la frase? | control de acceso |
| 6 | ¿Cuál registro de negocio es el definitivo? | evitar migrar el equivocado |

## 3. Principios
Solo cifrado (AES-256, frase larga en gestor de contraseñas, nunca en GitHub). Destino privado y restringido. Restauración verificada antes de confiar. Ninguna copia de datos reales en la base sintética, en la demo, en este repositorio público ni en artefactos sin cifrar. Sin exportaciones identificables salvo autorización específica.

## 4. Pasos pendientes
| Paso | Quién |
|---|---|
| Responder la sección 2 y aprobar por escrito el tratamiento | Vlux + el negocio + abogado |
| Mantener `BACKUP_SCHEDULE` apagado hasta decidir la activación controlada | Vlux |
| Sincronizar `ops/grants.sql` con 0016 en `vlux-ops` (`parches/vlux-ops-sincronizar-0016.patch`) | Vlux autoriza |
| Segunda copia cifrada fuera de GitHub | Vlux |
| Quitar el workflow del repositorio público (PR #3, `PR3_REVIEW.md`) | Vlux |

## 5. Solicitudes de los titulares y retención
- **ARCO:** el sistema anonimiza al cliente y conserva métricas agregadas. Un cliente anonimizado sigue en respaldos anteriores hasta que caduquen; mantener un **registro de solicitudes de borrado** para reaplicarlas tras una restauración.
- **Retención:** respaldos 30 días; sesiones y tokens expiran.
- **Restaurar sin mezclar negocios:** siempre a una base nueva y aislada; nunca `pg_restore` sobre la base viva.
- **Incidente:** si se filtran artefacto y frase, tratar como brecha de datos (ver `LEGAL_DRAFTS.md`).

## 6. Qué no se hará sin permiso expreso
Borrar, suspender, anonimizar o modificar al negocio real; copiar sus datos a la base sintética; usarlo como demostración; exportarlo con datos identificables; enviar correos o notificaciones.
