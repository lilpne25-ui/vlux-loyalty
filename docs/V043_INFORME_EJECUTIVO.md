# VLUX Loyalty V0.4.3 · Signature Metal Design System

**Clasificación: READY FOR DEMO (no READY FOR PILOT).** Siguen abiertos respaldos, pruebas en teléfonos físicos, revisión legal y entorno de producción separado.

## Qué cambió
- **Material:** tres acabados reales en CSS/SVG (sin WebGL): Signature Silver (aluminio cepillado neutro, protagonista), Black Titanium y Signature Color. El color del negocio solo tiñe detalles (sellos, filos, grabados) vía OKLCH; el metal no se recolorea. Inclinación ≤4°, sombra dinámica, respeta `prefers-reduced-motion`. Sin chip bancario.
- **Intelligent Logo Engine:** analiza formato, proporción, transparencia, márgenes, fondo sólido y luminosidad; autoajusta con *contain* (sin deformar ni recortar); controles de tamaño, posición, espacio, alineación y base; quitar fondo opcional y reversible; "Restaurar autoajuste". Persistencia `logo_fit` + original (migración 0009, aditiva).
- **Estudio y presentación:** comparativa de los 3 acabados con el mismo logo, antes/después, teléfono con la tarjeta, demo guiada con logos de ejemplo y subida propia, dos láminas nuevas en la presentación. Signature Silver por omisión.
- **Identidad VLUX vectorial:** probada con Potrace; **no es fiel** (el original es un render con brillo y degradado). Se conservan los PNG; los SVG son candidatos PENDIENTES DE APROBACIÓN en `docs/vectorizacion/`.
- **Lema:** configurable (`VITE_VLUX_TAGLINE`, por omisión "AI Transformation Partner"). Discrepancia con "eTransformation Partner": decisión del dueño.

## Límites que no se ocultan
- Los efectos metálicos viven en la tarjeta web/PWA; Apple/Google Wallet mostrarán una versión simplificada.
- `apple-ui-design` y `frontend-design` no están instaladas: se aplicaron principios equivalentes.
- Contraste: en pruebas, tinta ≥4.5:1 sobre todos los tramos del fondo en los 3 acabados (ajustado Signature Color de azul medio, que daba 3.68).
