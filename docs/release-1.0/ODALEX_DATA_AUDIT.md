# Auditoría de datos del negocio real en Preview · 2026-11-07 (versión pública, sanitizada)

> Esta versión contiene **solo agregados y metadatos**. No incluye nombres, contactos, ids ni el nombre comercial. El detalle por negocio está en la carpeta privada del proyecto (`privado/ODALEX_DATA_AUDIT_PRIVADO.md`). Método: solo `SELECT` agregados sobre Supabase Preview (`kpcmxmmwcolcxhkiwmaq`); el negocio real se identificó por nombre/slug existentes y la unión se hizo por `business_id` y llaves foráneas. Nada se modificó.

## Qué hay en Preview (todo el proyecto)
8 negocios · 7 usuarios de personal · 11 clientes (**8 con contacto**) · 11 tarjetas · 2 compras · 35 eventos de bitácora. 34 tablas; las vacías: recompensas, reseñas, suscripciones push, citas, avisos, borrados.

## El negocio real: dos registros de negocio
El propietario declara que es real. Existen **2 registros** (uno suspendido, creado el 2026-11-06; uno activo, creado el 2026-11-07). Ninguno está marcado demo ni "sintético declarado". Agregado de ambos:

| Categoría | Cantidad | Clasificación |
|---|---:|---|
| Registros de negocio | 2 | REAL CONFIRMADO (declaración del propietario; los datos no lo prueban por sí mismos) |
| Personal con acceso (membresías / usuarios distintos) | 2 / 1 | ORIGEN DESCONOCIDO, potencialmente personal (1 correo de dominio de consumo, no reservado) |
| Clientes | 3 (1 ya anonimizado por el flujo ARCO) | ORIGEN DESCONOCIDO |
| Clientes con dato de contacto (todos WhatsApp, formato MX válido) | 2 | ORIGEN DESCONOCIDO, potencialmente personal |
| Consentimiento de privacidad aceptado / de marketing | 3 / 2 | Revisar (versión del aviso: borrador sin aprobación legal) |
| Tarjetas · tokens de acceso · códigos de emparejamiento | 3 · 3 · 4 | ORIGEN DESCONOCIDO (los tokens son secretos de acceso; solo hash) |
| Visitas · compras · eventos de sellos | 2 · 2 · 2 | ORIGEN DESCONOCIDO (1 compra con servicio y monto) |
| Recompensas · reseñas | 0 · 0 | — |
| Reglas · suscripciones (piloto) | 2 · 2 | REAL (configuración comercial) |
| Sesiones de personal (vigentes) | 3 (1) | credencial temporal; sin valor de respaldo |
| Invitaciones (pendientes) · correos en cola | 2 (0) · 1 pendiente, **0 enviados** | contiene un correo de persona real probable |
| Bitácora de negocio / de plataforma | 16 / 5 | puede contener identificadores; 3 eventos con claves personales en `details` (no se leyeron) |
| Push · citas · avisos | 0 · 0 · 0 | — |
| Borradores de activación consumidos | 2 | pueden contener datos del alta (JSON de hasta 300 KB) |

## Resto del proyecto
| Grupo | Negocios | Clientes | Con contacto | Clasificación |
|---|---:|---:|---:|---|
| Demo del sistema (`is_demo`, personal con dominios `.invalid/.test`) | 3 | 6 | 4 | Personal: SINTÉTICO CONFIRMADO (dominio reservado). Clientes: ORIGEN DESCONOCIDO (los contactos son WhatsApp; no existe dominio reservado para teléfonos) |
| No demo, no el negocio real (suspendidos, sin personal) | 3 | 2 | 2 | ORIGEN DESCONOCIDO |

## Conclusiones
1. **Ninguno de los 11 clientes puede clasificarse como sintético con certeza.** Por regla, se tratan los 8 contactos como potencialmente reales. Un respaldo de Preview **contiene datos personales** y requiere las protecciones de `ODALEX_DATA_PROTECTION_PLAN.md`.
2. **Indicio de datos de prueba mezclados:** un mismo contacto (comparado solo por huella hash, sin leerlo) aparece en 6 registros de 4 negocios, uno de ellos el negocio real. Sugiere uso de un contacto de prueba, pero **no prueba** que el cliente del negocio real sea ficticio. El propietario debe confirmarlo.
3. El negocio real lleva una vertical de salud (clientes ≈ pacientes). Aunque no hay citas ni notas clínicas, la **lista de clientes de un consultorio es información sensible** en la práctica: tratar con el criterio más estricto de la LFPDPPP.
4. No hay evidencia de envío de correos ni notificaciones (0 enviados, 0 suscripciones push).
5. Aislamiento: ver `TENANT_ISOLATION_AUDIT.md` (hallazgo H-1).
