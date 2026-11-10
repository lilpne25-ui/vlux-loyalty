# V0.4.5 · Catálogo de 16 giros y motor común de recompensas

## Catálogo (`shared/catalog.ts`)

Hay 16 giros:

| Grupo | Giros |
|---|---|
| Alimentos | Cafetería, Restaurante |
| Belleza | Barbería, Salón de belleza, Salón de uñas |
| Salud | **Dentista**, **Consultorio médico**, **Óptica** |
| Automotriz | Taller mecánico, Autolavado |
| Bienestar | Gimnasio, Spa |
| Mascotas | **Veterinaria** |
| Comercio | Boutique, Tienda de accesorios |
| Servicios | Otros servicios |

Cada giro trae:
- nombre y categoría;
- ícono y lugar ("Tu barbería");
- un ejemplo;
- los tipos de programa recomendados;
- plantillas con sus valores por defecto.

**Las plantillas son sugerencias editables, no restricciones.** Agregar un giro significa agregar una entrada en el catálogo y su id en la restricción de la BD (en una migración nueva).

### Giros regulados (en negritas arriba)

En estos giros la UI muestra un aviso y el programa sigue tres reglas:
- **No se guardan datos de salud.** El servicio participante es solo un nombre corto ("Limpieza", "Baño"), sin diagnósticos, tratamientos ni historial.
- **VLUX Loyalty no es un sistema médico.** Las plantillas premian la **constancia** con beneficios **no clínicos** que define el establecimiento.
- **La recompensa nunca condiciona decisiones de salud.**

Antes de usarlo con el público, el establecimiento debe revisar con su asesor las reglas profesionales y de publicidad que le apliquen.

## Motor común (no seis motores)

Todas las reglas se guardan en `reward_rules` y todo usa:
- un solo libro de movimientos (`stamp_events`);
- un solo flujo de canje (`rewards`);
- un solo cálculo, `unitsForOperation` en `shared/rules.ts`.

| Tipo | Qué suma | Datos que pide la caja |
|---|---|---|
| Sellos por compra | 1 por compra, o 1 por artículo con tope | Artículos (si es por artículo) |
| Sellos por visita | 1 por visita; varias compras dentro de la ventana cuentan como una | Nada |
| Sellos por servicio | 1 por servicio **participante**, con tope por operación | El servicio |
| Puntos por consumo | `floor(monto / pesos por punto)`, con tope | El monto (sin integración con el POS) |
| Personalizado | Sellos con unidad y condiciones propias | Según el modo |
| *Frecuencia* (diseñado, **no activado**) | Visitas válidas dentro de un periodo | — |

La frecuencia queda pendiente porque necesita saldos con vencimiento por periodo. Activarla sin eso rompería la regla de no perder premios ganados.

### Campos configurables

- tipo y nombre del programa;
- meta (cantidad) y recompensa (nombre y descripción);
- condiciones visibles para el cliente;
- unidad personalizada (singular y plural);
- servicios participantes;
- pesos por punto;
- tope por operación;
- ventana de visita;
- máximo de operaciones con premio por día;
- vigencia (fecha final).

### Garantías

- **Versionado:** cada cambio crea una versión nueva de la regla. Los premios ya desbloqueados conservan su costo y su descripción, y el saldo acumulado se respeta.
- **Cambio de familia:** pasar de sellos a puntos, o al revés, **se bloquea mientras haya tarjetas con saldo**. Sería mezclar unidades distintas.
- **Doble acumulación:** se evita con la llave de idempotencia por operación y la guardia de duplicado ("Sí, registrar otra").
- **Doble canje:** se evita con un bloqueo de fila; probado con dos canjes en paralelo.
- **Fin de vigencia y límite diario:** después de la vigencia no se suma nada, pero los premios ganados se respetan. Si se alcanza el límite diario, la operación se registra sin unidades y la caja lo explica.

### Tarjeta

Se reutiliza el motor visual existente con sus acabados Signature Silver, Black Titanium y Signature Color:
- **sellos:** muestra la cuadrícula de sellos;
- **puntos, o metas de más de 20:** muestra un medidor (`PointsMeter`).

La etiqueta usa la unidad del programa: sellos, visitas, servicios, puntos o la personalizada.

## Pruebas

- Integración: T18–T30 en `tests/integration/v045-rewards.test.ts`.
- Unitarias: `tests/unit/catalog.test.ts`. Cada plantilla de cada giro pasa la validación del cliente **y** la del servidor.
- E2E: T31–T32 y T36–T37.
