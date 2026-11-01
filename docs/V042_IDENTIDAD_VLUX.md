# V0.4.2 · Identidad VLUX: logos oficiales integrados

**Estado: INTEGRADOS (originales de Drive, sin modificar).**

| Archivo en `public/brand/` | Origen | Tamaño | Uso |
|---|---|---|---|
| `vlux-isotipo.png` | PNG oficial de Drive | 300×310, RGBA | encabezados, ícono, pastilla sobre claro |
| `vlux-wordmark.png` | PNG oficial de Drive | 780×250, RGBA | barra de la app (fondo oscuro), pie de página |
| `vlux-logo-full.png` | PNG oficial de Drive | 1060×300, RGBA | portada, última diapositiva del Estudio |

- Los bytes son idénticos a los de Drive (se comparó el tamaño con los metadatos). Se retiraron los JPG provisionales de V0.4.1.
- No se redibujó ni cambió proporciones. Los PNG tienen **fondo translúcido con resplandor**: se ven bien sobre negro y lavados sobre blanco. Por eso en superficies claras el isotipo va dentro de una pastilla negra (#0E1013) y en la portada el logo completo lleva un difuminado de bordes (máscara CSS) para que no se note el rectángulo.
- Los íconos de la app (32, 180, 192, 512 px) se componen con el isotipo oficial sobre #0E1013 (sin redibujar).
- Paleta usada (documento oficial): negro #0E1013, plata #B9C0C9, cian discreto #67C7D3. La identidad de cada negocio es independiente de la de VLUX (la tarjeta usa los colores del negocio).

## Pendientes de identidad
1. **Lema:** el texto de la misión dice «eTransformation Partner»; el documento oficial y los PNG dicen **«AI Transformation Partner»**. No se escribió ninguno en el código: el lema solo aparece dentro de los PNG oficiales. Vlux debe confirmar cuál es el vigente.
2. Los PNG son de baja resolución (isotipo 300 px). En pantallas de alta densidad se ven suaves. Pedir SVG o PNG de ≥1200 px con fondo transparente real.
