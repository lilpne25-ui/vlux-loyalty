# V0.4.1 · Identidad oficial de VLUX

## Fuente
Vlux subió el zip `LOGOS VLUX` (12 imágenes JPG) al hilo. Se revisó también el documento de identidad en Google Drive (`IDENTIDAD OFICIAL VLUX — FUENTE DE VERDAD`, VLUX-ID-001 v1.0, estado Borrador, confidencialidad Interno): **no se copió su texto al repositorio**.
Los tres PNG nombrados en Drive (`VLUX_LOGO_OFICIAL_FULL.png`, `VLUX_WORDMARK_OFICIAL.png`, `VLUX_ISOTIPO_OFICIAL.png`) **no se pudieron descargar** desde la nube de trabajo (Drive no es alcanzable y pasar los bytes por el chat no es viable). Se usaron las imágenes del zip, que son los mismos diseños en JPG.

## Lema
El documento de identidad dice **AI Transformation Partner**. En V0.4 el brief hablaba de "eTransformation Partner"; **no existe en el código**. Se usa solo el lema oficial, y únicamente dentro de la imagen oficial del logotipo (diapositiva final de la presentación).

## Qué se usa y dónde (`public/brand/`)
Solo recortes y reescalado de los archivos originales. No se redibujó, recoloreó ni deformó nada.
| Archivo | Origen | Uso |
|---|---|---|
| `vlux-isotipo-dark.jpg` | `isotipo-neon-negro.jpg` | Barra superior de caja y panel, Control Center (fondos oscuros, mezcla `screen`) |
| `vlux-wordmark-dark.jpg` | fila "VLUX" de `app-icon-neon-con-vlux.jpg` | Barra superior de la app |
| `vlux-isotipo-light.jpg` | `isotipo-fondo-blanco.jpg` | Pantallas de acceso y páginas claras (mezcla `multiply`) |
| `vlux-icon-{32,180,192,512}.png` | icono redondeado de `app-icon-neon-con-vlux.jpg` | Favicon y apple-touch-icon |
| `vlux-lockup-dark.jpg` | `1-logotipo-principal.jpg` sin la etiqueta de la lámina | Diapositiva final de la presentación |
Sobre colores arbitrarios (póster del mostrador) el isotipo va en una pastilla negra.

## Limitaciones honestas
1. Los archivos son JPG de láminas (fondo negro/azul oscuro, sin transparencia). Se integran con mezcla `screen`/`multiply`, que funciona bien sobre fondos oscuros/claros pero no es lo ideal.
2. **Se necesitan los originales con transparencia (PNG/SVG)** para lograr bordes perfectos sobre cualquier superficie, ícono maskable de la PWA propia y materiales impresos.
3. El Wordmark claro no existe como archivo suelto; en fondos claros el nombre se escribe como texto, no como logo.
4. Si el documento de identidad define una paleta oficial (hex), no se pudo usar como regla de código; hoy el shell usa negro, blanco, plata y cian sutil sobre el diseño de V0.4.
