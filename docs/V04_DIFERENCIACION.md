# VLUX Loyalty V0.4 · Diferenciación

## Dónde estamos frente al mercado (hechos de nuestro producto, verificados en pruebas)

| Capacidad | VLUX Loyalty V0.4 | Loopy / Stamp Me / PassKit |
|---|---|---|
| Apple / Google Wallet | **No existe todavía.** Se documenta como siguiente fase (docs V03_APPLE_WALLET, V03_GOOGLE_WALLET) | Sí, es su producto central |
| Tarjeta instalable como app sin tienda | Sí: PWA por negocio, con marca propia | No es su enfoque |
| Tres roles con acceso propio (cliente, caja, dueño) y enlaces/QR por rol | Sí: Centro de accesos | Varía; no lo pudimos comparar página por página |
| Estudio de marca con color extraído del logo y vistas previas | Sí | No verificado en sus páginas |
| Presentación comercial para cerrar en reunión | Sí, dentro del panel de administración | No aplica |
| Aislamiento entre negocios en base de datos (RLS) | Sí, probado en integración | No verificado |
| Precio y facturación en pesos | Hipótesis de precio desde 299 MXN/mes, sin decidir | Precios en USD |

## Mensaje que sí podemos sostener hoy
"Tu tarjeta de sellos con tu marca, lista en minutos, que tus clientes abren desde un QR sin descargar nada, con caja para tu cajero y panel para ti. Soporte local en español."

## Mensaje que NO podemos sostener hoy
- "En Apple Wallet / Google Wallet": no existe. Si un cliente lo pide, respuesta honesta: es la fase siguiente y depende de cuentas de Apple y Google que aún no se abren.
- "Aumenta tus ventas X %": no hay dato propio ni fuente verificada. Hasta tener el piloto, solo medimos visitas repetidas de los negocios piloto.

## Riesgo de fondo [RECOMENDACIÓN]
Competir en Wallet contra Loopy y Stamp Me desde cero no es el mejor primer paso: ya existen, desde 25 USD/mes. La ventaja realista de VLUX es el servicio completo local (alta, marca, QR, capacitación, factura en pesos) sobre una tecnología que ya funciona. Wallet debe entrar como mejora cuando un cliente real lo pida y lo pague, vía PassKit u otra infraestructura, no reconstruyendo desde cero.
