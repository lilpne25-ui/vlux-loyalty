# VLUX Loyalty V0.4 · Investigación de mercado

Fecha de lectura de fuentes: 2026-11-01. Convención: **[HECHO]** leído en la página oficial citada; **[NO VERIFICADO]** cifra sin fuente primaria; **[HIPÓTESIS]** inferencia nuestra que hay que validar con negocios reales; **[RECOMENDACIÓN]** nuestra propuesta.

## 1. Qué es hecho y qué no (lectura honesta)

Se leyeron páginas oficiales de precios de cuatro competidores y tres artículos de "estadísticas de retención". Los precios sí son verificables. Las estadísticas de los artículos **no lo son**: los tres son contenido de proveedores (Lealify, Restroworks, BonusQR), ninguno cita estudio primario abierto y se contradicen entre sí. No las usamos como argumento de venta. Una cifra tipo "90 % de mexicanos pertenece a programas de lealtad" o "retener cuesta 5 veces menos que adquirir" circula por todos lados sin fuente; si se quiere usar en una presentación, hay que rastrear el estudio original o presentarla como "se suele decir".

El artículo mexicano (PDCC, 12 jun 2026) menciona y enlaza a lealify.com y no cita ninguna fuente. Además afirma que "el SAT considera las recompensas como deducciones autorizadas": **no lo repetimos**; requiere asesoría fiscal.

## 2. Competidores [HECHO, precios en USD, leídos 2026-11-01]

| Producto | Modelo | Precio publicado | Wallet | Notas |
|---|---|---|---|---|
| Loopy Loyalty (loopyloyalty.com/pricing) | Tarjeta de sellos en Wallet | Starter 25 / Growth 69 / Ultimate 95 al mes (20 % menos con pago anual) | Apple y Google Wallet incluidos | Clientes ilimitados; 1 / hasta 3 / hasta 10 diseños y ubicaciones; prueba de 15 días sin tarjeta. El pie dice "Made with PassKit" |
| Stamp Me (stampme.com/pricing) | Tarjeta de sellos digital | Lite 49 / Pro 79 / Elite 199 al mes (Elite aparece con oferta de 100; no sabemos cuál es el vigente) | Wallet solo cuando se valida con su app de comercio | 2 programas publicados por cuenta; programas extra con cargo único de 15; prueba de 30 días |
| PassKit (passkit.com/pricing/rates) | Plataforma + volumen de pases | Cuota de plataforma desde 39.50 al mes (1 miembro) hasta 249.50 (ilimitado), más por pase pasado el volumen incluido (250 multiuso); 0.045 por pase multiuso entre 251 y 2,500 | Apple y Google | Es infraestructura para construir, no producto listo para un cafetero. Prueba de 45 días |
| Square Loyalty (squareup.com/us/en/software/loyalty) | Puntos dentro del POS | Solo en Square Plus (49 por ubicación al mes) y Premium (149) | Apple Wallet; no aparece Google Wallet | Requiere usar el POS de Square; recompensas avisadas por SMS |

Observaciones [HECHO] sobre estos precios: ninguno publica precio en pesos; todos cobran en dólares. Ninguno de los leídos muestra marca blanca en esas páginas. Todos se apoyan en Wallet como atractivo principal.

## 3. Qué hace falta en Toluca / Metepec [HIPÓTESIS, validar con 2 negocios]

No hay datos locales verificados. Lo siguiente es lo que razonablemente esperaríamos y debe confirmarse en el piloto:

1. **Dueño sin tiempo ni equipo técnico.** Si el alta tarda más de 10 minutos no la termina. V0.4 responde con el Estudio de marca (logo, colores, listo) y un enlace de invitación.
2. **Cajero rotando.** La caja debe sellar en menos de 10 segundos y no puede requerir una app. V0.4: PWA de caja instalable.
3. **Cliente que no quiere descargar nada.** El propio artículo de PDCC dice que "la mayoría no quiere descargar aplicaciones" (aunque sin fuente). Un enlace/QR que abre una tarjeta en el navegador reduce fricción; Wallet la reduciría más, pero hoy no existe en VLUX.
4. **Precio en pesos y sin dólar.** Los tres competidores de tarjeta cobran en USD; un precio en MXN con factura es una diferencia comercial plausible, no demostrada.
5. **Soporte en español y con cara local.** Presencia en Toluca/Metepec: reunión presencial, instalación del QR en mostrador, ajuste de marca.
6. **Confianza con datos personales.** La LFPDPPP aplica. VLUX ya pide consentimiento explícito para promociones y no mezcla datos entre negocios (RLS).

## 4. Qué pedimos validar (guion de 2 entrevistas)

- ¿Hoy tienen tarjeta de papel o nada? ¿Cuántos clientes habituales tienen, a ojo?
- ¿Cuánto pagarían al mes? Probar 299 / 499 MXN sin sugerir cuál es "el bueno".
- ¿Prefieren que el cliente instale algo o abrir un enlace? Mostrarles el celular, no la teoría.
- ¿Quién sella: dueño o cajero? ¿Tienen tablet o celular en caja?
- ¿Les importa Apple/Google Wallet o es algo que nosotros les creemos?

## 5. Fuentes

- https://loopyloyalty.com/pricing/
- https://www.stampme.com/ y https://www.stampme.com/pricing
- https://passkit.com/pricing/ y https://passkit.com/pricing/rates/
- https://squareup.com/us/en/software/loyalty
- Contenido de proveedor, **no verificado**: newsinamerica.com (PDCC, 12 jun 2026), restroworks.com/blog (jun 2025), bonusqr.com/article/digital-loyalty-vs-paper-cards-smb-guide-to-retention
