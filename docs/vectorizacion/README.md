# Vectorización de la identidad VLUX · estado: PENDIENTE DE APROBACIÓN

**Resultado: los SVG NO sustituyen a los PNG oficiales.** Los tres archivos `*.candidate.svg` son candidatos de la prueba; no se usan en la aplicación.

## Qué se hizo
- Fuente: los tres PNG de la carpeta oficial de Drive (`VLUX_ISOTIPO_OFICIAL` 300×310, `VLUX_WORDMARK_OFICIAL` 780×250, `VLUX_LOGO_OFICIAL_FULL` 1060×300). La carpeta no contiene versiones vectoriales (AI, SVG, PDF vectorial); el archivo de Slides solo incrusta el mismo raster.
- Método: umbral de luminancia sobre fondo oscuro → Potrace (npm `potrace`) → optimización con SVGO. Son rutas vectoriales reales (`<path>`), sin imagen incrustada, sin scripts ni referencias externas.

## Por qué no es fiel
Los PNG no son formas planas: son un render con **brillo (glow), degradado cian→blanco, filo translúcido y fondo cepillado**. Un trazo por umbral solo puede producir una silueta de un color.
- La geometría depende del umbral: la silueta del isotipo cambia de ~5 300 px (umbral 60) a ~2 600 px (umbral 120). No hay un contorno "correcto" que trazar.
- IoU entre la máscara trazada y el SVG renderizado a tamaño nativo: 0.90–0.93. Eso mide qué tan bien Potrace sigue SU máscara, no qué tan parecido es al logo oficial.
- A simple vista (ver `comparacion-original-vs-vectorizado.png`): el isotipo sale con bordes irregulares y grosor variable, se pierden las líneas interiores finas y el lema "AI TRANSFORMATION PARTNER" queda dentado. El brillo y el degradado se pierden por completo.
- El color `#9FE8F5` del candidato lo elegí yo para ver la forma; **no es un color oficial**.

## Decisión recomendada
Mantener los PNG. Para un SVG fiel hace falta el archivo vectorial original del diseñador (AI/SVG/PDF) o un redibujo manual aprobado por el dueño de la marca. Un redibujo es decisión de diseño, no se hace aquí.

## Ubicación
- Candidatos: `docs/vectorizacion/*.candidate.svg` (no se sirven en la aplicación).
- `public/brand/` solo contiene PNG. Una prueba automática impide que aparezca ahí un SVG de VLUX sin aprobación.
