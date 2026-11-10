# VLUX Loyalty 1.0 · Borradores legales

> ## ⚠️ BORRADOR — REQUIERE REVISIÓN Y APROBACIÓN DE UN ABOGADO
> Estos textos los redactó un asistente automatizado a partir de lo que el software hace realmente. **No son asesoría legal** ni están listos para publicarse. Sirven para que el abogado revise rápido con hechos técnicos correctos. Todo lo marcado `[POR DEFINIR]` lo decide Vlux con su abogado.
> Contexto normativo a confirmar con el abogado: en marzo de 2025 se publicó en el DOF una **nueva Ley Federal de Protección de Datos Personales en Posesión de los Particulares**, y las funciones del INAI pasaron a la Secretaría Anticorrupción y Buen Gobierno. Falta confirmar reglamento y lineamientos vigentes a la fecha de publicación.

## 0. Hechos técnicos que el abogado debe conocer
| Tema | Lo que hace el sistema hoy |
|---|---|
| Datos del cliente final | Nombre visible (1–40 caracteres, puede ser apodo), contacto **opcional** (WhatsApp o correo), aceptación del aviso (versión y fecha), consentimiento de mercadotecnia (casilla separada, apagada por omisión), historial de compras/visitas/sellos/recompensas, eventos de clic en "reseña" |
| Datos que NO guarda | Ubicación del cliente, fecha de nacimiento, datos de pago, datos de salud, fotografía |
| Datos del negocio y empleados | Nombre del negocio, logo, dirección/ubicación pública, correos y nombres de empleados, contraseñas (hash), bitácora de acciones |
| Quién decide sobre los datos de clientes | Cada negocio (los clientes son suyos). VLUX los trata por cuenta del negocio → propuesta: **negocio = responsable, VLUX = encargado** |
| Dónde se guardan | Supabase (PostgreSQL, región us-east-1, EUA) y Vercel (funciones en iad1, EUA). Es **transferencia/remisión internacional** a proveedores |
| Seguridad | Cifrado en tránsito (TLS), aislamiento por negocio en la base (RLS), contraseñas con hash, tokens de acceso con hash, bitácoras de solo inserción, respaldos cifrados AES-256 |
| Eliminación | El dueño puede **anonimizar** a un cliente: borra nombre y contacto y quita el consentimiento; conserva el historial numérico (sin identificar a nadie). La baja completa de un negocio exporta y purga sus datos (Control Center, con doble verificación) |
| Funciones apagadas en 1.0 | Avisos push, promociones, recordatorios automáticos, citas y correo propio (`FEATURE_FLAGS.md`). Cuando se activen, el aviso de privacidad debe actualizarse **antes** |
| Reseñas | El sistema invita a reseñar en Google, **no** condiciona premios a la reseña ni filtra reseñas (las políticas de Google lo prohíben) |

---

## 1. Aviso de privacidad integral (plantilla para cada negocio) — BORRADOR
**Responsable:** `[Nombre o razón social del negocio]`, con domicilio en `[domicilio]`, contacto para privacidad `[correo/WhatsApp]`.

**Datos que recabamos:** nombre o apodo; opcionalmente tu WhatsApp o correo; las compras, visitas, sellos y recompensas de tu tarjeta de lealtad.

**Finalidades necesarias:** (a) crear y operar tu tarjeta de lealtad; (b) registrar tus compras o visitas y entregarte recompensas; (c) permitirte recuperar tu tarjeta; (d) prevenir fraude y abuso del programa.

**Finalidades secundarias (puedes negarte sin perder la tarjeta):** (e) enviarte promociones del negocio por el medio de contacto que nos diste, solo si marcas la casilla correspondiente. Para negarte o retirarlo después: `[mecanismo: escribir a …/desmarcar en tu tarjeta]`.

**Encargado y transferencias:** usamos la plataforma VLUX Loyalty, operada por `[razón social de VLUX]`, que trata tus datos por nuestra cuenta. Sus proveedores de infraestructura (Supabase Inc. y Vercel Inc.) almacenan la información en servidores en Estados Unidos. `[POR DEFINIR con abogado: cómo se informa esta remisión]`. No vendemos ni compartimos tus datos con terceros para sus propios fines.

**Derechos ARCO y revocación:** puedes acceder, rectificar, cancelar u oponerte, y revocar tu consentimiento, escribiendo a `[contacto]` con tu nombre y el código de tu tarjeta. Responderemos en el plazo que marque la ley `[plazo a confirmar]`.

**Conservación:** mientras tu tarjeta esté activa y `[N]` meses después de tu última visita; después se anonimiza. `[POR DEFINIR]`.

**Cambios:** publicaremos cualquier cambio en esta misma página. Versión `[AAAA-MM]`.

> En el sistema: la versión se configura con `PRIVACY_NOTICE_VERSION` y se guarda con cada alta. Hoy dice `borrador-2026-10`; **no operar con clientes reales hasta cambiarla a la versión aprobada**.

## 2. Términos de uso para el cliente final — BORRADOR
1. La tarjeta es gratuita, personal y la ofrece `[negocio]`. Las reglas (sellos, puntos, recompensas, vigencia) las define el negocio y se muestran en la tarjeta.
2. Las recompensas no son canjeables por dinero `[confirmar]`. El negocio puede corregir sellos registrados por error.
3. El negocio puede modificar o terminar el programa avisando con `[N]` días; las recompensas ya ganadas se respetan `[confirmar]`.
4. Uso indebido (duplicar tarjetas, manipular códigos) permite cancelar la tarjeta.
5. Invitar a reseñar es voluntario y no da beneficios.

## 3. Contrato de servicio VLUX ↔ negocio (puntos clave) — BORRADOR
| Cláusula | Propuesta |
|---|---|
| Objeto | Licencia de uso SaaS de VLUX Loyalty por suscripción mensual por sucursal |
| Precio | Plan `[Start/Premium]` `[MXN]` + IVA, pago `[anticipado mensual]`, ajuste con aviso de 30 días |
| Piloto | `[N]` semanas sin costo o con descuento; sin permanencia; criterios de éxito acordados (`PILOT_GUIDE.md`) |
| Roles de datos | Negocio = responsable; VLUX = **encargado**: trata datos solo por instrucciones del negocio, confidencialidad, medidas de seguridad, subcontratación solo a proveedores listados, aviso de vulneraciones sin demora, devolución/eliminación al terminar |
| Obligaciones del negocio | Publicar su aviso de privacidad, atender ARCO (VLUX ayuda técnicamente), capacitar a empleados, no registrar datos sensibles en campos libres |
| Disponibilidad | Objetivo `[99 %]` mensual sin compensación económica durante el piloto `[confirmar]`; mantenimiento con aviso |
| Respaldos | Diario, retención `[30]` días; RPO 24 h / RTO 4 h objetivo (no garantía) durante el piloto |
| Responsabilidad | Limitada a lo pagado en los últimos `[3/12]` meses; exclusión de lucro cesante `[confirmar]` |
| Terminación | Cualquiera, aviso de 30 días; VLUX entrega exportación de datos y purga después de `[30]` días |
| Propiedad intelectual | Software y marca VLUX son de VLUX; datos y logo del negocio son del negocio |
| Jurisdicción | `[Estado de México / Toluca]` |

## 4. Responsabilidades de VLUX (resumen operativo)
- Operar la plataforma con las medidas de `SECURITY_REVIEW.md` y `PRODUCTION_ARCHITECTURE.md`.
- No usar datos de clientes de un negocio para otro negocio ni para fines propios (métricas solo agregadas y anónimas `[confirmar uso permitido]`).
- Respaldos verificados y procedimiento de incidentes (`RUNBOOK.md`).
- Avisar al negocio de cualquier vulneración que lo afecte.
- Mantener lista actualizada de proveedores (§7).

## 5. Tratamiento de datos de clientes y ARCO (procedimiento interno)
1. Solicitud llega al negocio (o a VLUX → se reenvía al negocio en 1 día hábil).
2. Verificar identidad: el titular muestra su tarjeta (código/QR) o responde desde el contacto registrado.
3. **Acceso:** el dueño ve el historial en el panel y puede descargar la **exportación del cliente** (`GET /api/owner/customers/:id/export`: datos, aceptación del aviso, consentimiento e historial).
4. **Rectificación:** cambio de nombre/contacto `[hoy no hay pantalla de edición para el dueño; VLUX lo haría por soporte → backlog]`.
5. **Cancelación/eliminación:** "Anonimizar" en el panel (inmediato, irreversible).
6. **Oposición/revocación de promociones:** quitar consentimiento de mercadotecnia (anonimizar lo quita; `[falta botón solo para esto → backlog]`).
7. Registrar la solicitud y la respuesta (fecha, tipo, resultado) en `[registro del negocio]`.

## 6. Retención propuesta `[POR DEFINIR]`
| Dato | Propuesta | Mecanismo hoy |
|---|---|---|
| Cliente activo | Mientras use la tarjeta | — |
| Cliente inactivo | Anonimizar a los `[24]` meses sin visita | Manual (anonimizar); automatización en backlog |
| Historial numérico anonimizado | Indefinido (estadística del negocio) | Automático |
| Bitácoras de seguridad | `[24]` meses | No se purgan aún |
| Negocio dado de baja | Exportación entregada y purga a los `[30]` días | Control Center (manual) |
| Respaldos | 30 días (propios) + 7 días (Supabase) | Automático al configurarse |

## 7. Proveedores de infraestructura (encargados/subencargados)
| Proveedor | Para qué | Ubicación de datos | Estado |
|---|---|---|---|
| Supabase Inc. | Base de datos | EUA (us-east-1) | En uso |
| Vercel Inc. | Hospedaje y funciones | EUA (iad1) | En uso |
| GitHub (Microsoft) | Respaldos cifrados en repositorio privado | EUA | Por configurar |
| Google (Maps) | Enlace de reseña: el cliente sale al sitio de Google | — (no se envían datos) | En uso |
| Servicios push del navegador (Google, Apple, Mozilla, Microsoft) | Avisos | Varios | **Apagado** |
| Resend / servidor SMTP propio | Correo | EUA / `[por definir]` | **Apagado** |

## 8. Comunicaciones comerciales y push (antes de activarlas)
- Consentimiento separado y expreso (ya existe la casilla; está apagada por omisión).
- Cada mensaje debe identificar al negocio y ofrecer cómo dejar de recibirlos.
- Revisar con el abogado: REPEP/PROFECO para publicidad a consumidores, y si los avisos push requieren mención específica en el aviso.
- Giros de salud (consultorios): no usar citas ni avisos con nombres que revelen el tipo de servicio hasta tener opinión legal (`docs/V046_PRIVACIDAD.md`).

## 9. Lista para el abogado
1. ¿Responsable/encargado como se propone? ¿Hace falta contrato de encargo separado?
2. Forma correcta de informar la remisión a proveedores en EUA.
3. Plazos ARCO y retención con la ley vigente de 2025 y su reglamento.
4. Texto final del aviso, términos y contrato; versión para `PRIVACY_NOTICE_VERSION`.
5. Obligación de notificar vulneraciones (a quién y en qué plazo).
6. Facturación: VLUX emite CFDI por la suscripción `[confirmar régimen fiscal]`.
