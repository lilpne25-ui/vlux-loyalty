# V0.4.6 · Ubicación: qué se puede y qué no

## Lo que NO es cierto (y no se promete)
- Google Maps **no** le da a VLUX la ubicación de los clientes. Un enlace a Maps solo abre la ruta en el teléfono del cliente.
- Una PWA **no** puede detectar en segundo plano que el cliente pasa cerca del negocio (geovallas). Los navegadores no ofrecen geolocalización en segundo plano a sitios web ni a apps web instaladas.

## Experiencia A · implementada: «¿Estoy cerca?» (primer plano)
- Solo aparece si VLUX registró la ubicación pública del local (Control Center → Editar negocio → «latitud, longitud», copiada de Google Maps).
- El cliente toca «Calcular distancia»; el teléfono pide permiso; se lee la ubicación **una vez** (`getCurrentPosition`, precisión normal, sin seguimiento).
- La distancia se calcula **en el teléfono** (fórmula de haversine). La ubicación del cliente no se envía a VLUX ni al negocio, no se guarda y no existe ninguna ruta del servidor que la reciba (T28–T31, E2E E3–E4).
- `Permissions-Policy: geolocation=(self)`: solo el propio sitio puede pedirla; ningún iframe de terceros.
- Sin permiso, la tarjeta funciona igual («No pasa nada: tu tarjeta funciona igual»).
- Enlace «Cómo llegar (Google Maps)» con las coordenadas del local (no del cliente).

## Experiencia B · solo investigación: avisos al pasar cerca (requiere app nativa)
No implementada. Comparativa:

| Opción | Qué permite | Límites | Costo | Complejidad |
|---|---|---|---|---|
| PWA (actual) | Tarjeta, instalación, sin tiendas | Sin segundo plano ni geovallas; en iPhone, push solo instalada (iOS 16.4+) | Incluido | Baja (ya existe) |
| Web Push | Avisos por eventos del negocio (recompensa, regreso, cita) | Depende del permiso y del servicio push de cada navegador; sin ubicación | Sin costo por mensaje (servicios del navegador) | Media (implementado) |
| Ubicación en primer plano | Distancia al abrir la tarjeta | Solo con la app abierta y tras un toque | Incluido | Baja (implementado) |
| App nativa Android | Geovallas (Geofencing API de Google Play services), avisos al acercarse | Permiso de ubicación «siempre» (y en Android 10+ «en segundo plano» por separado), revisión de Google Play, consumo de batería, límites del sistema en número de geovallas | Cuenta de Google Play (pago único) + desarrollo y mantenimiento | Alta |
| App nativa iOS | Monitoreo de regiones (Core Location), avisos al acercarse | Permiso «Siempre», límite de regiones monitoreadas por app, revisión de App Store, explicación obligatoria del uso | Apple Developer Program (anual) + desarrollo y mantenimiento | Alta |

Precios exactos de las cuentas de desarrollador y los límites numéricos de geovallas/regiones deben verificarse en la documentación oficial el día de la decisión (no se consultaron en esta versión).

**Recomendación**: no hacer app nativa hasta tener evidencia de que los avisos por evento (Web Push) no bastan. La geovalla duplica costos (dos apps, dos tiendas) y tiene la carga de privacidad más alta del producto.

## Reglas de privacidad (aplican a cualquier versión futura)
Consentimiento explícito y separado para publicidad; sin rastreo oculto ni recolección continua; sin guardar rutas; nunca vender ni compartir entre negocios; sin sensores sin permiso; revocable; la app funciona sin ubicación. Ver `V046_PRIVACIDAD.md`.
