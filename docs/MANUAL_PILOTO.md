# Manual del piloto · VLUX Loyalty V0.2

Para el equipo VLUX y el negocio piloto (ejemplo: Café Demo Toluca). Datos sintéticos hasta que exista el aviso de privacidad revisado.

## 1. Antes de empezar (equipo VLUX)
1. Servidor con HTTPS en marcha (la cámara del navegador no funciona sin HTTPS fuera de `localhost`).
2. Alta del negocio: `POST /api/platform/businesses` con el token de plataforma, o `npm run db:seed:demo` para las demos.
3. Entregar al dueño su correo y contraseña en persona. Pedirle que la cambie cuando exista esa función (V0.3).
4. Imprimir el QR del mostrador: Panel → **QR del mostrador** → Imprimir.

## 2. Dueño
- Entra en `/acceso`. Llega a **Panel**.
- **Programa:** nombre, giro, colores, sellos necesarios (3 a 15), recompensa, modo de sellos (por compra o por artículo con tope), duración de una visita, enlace de reseñas de Google (opcional).
- **Equipo:** agrega empleados con correo y contraseña inicial (mínimo 10 caracteres). **Desactivar** corta su acceso al instante.
- **Clientes:** lista con sellos, visitas, compras y canjes. Botón de descarga (derecho de acceso) y de eliminación de datos personales (derecho de cancelación).
- **Resumen:** se actualiza solo cada pocos segundos.

## 3. Empleado (caja)
1. Entra en `/acceso` con su cuenta. Llega a **Caja**.
2. **Escanear con cámara** y apuntar al QR del cliente. Alternativas: foto del QR, escribir el código `XXXX-XXXX`, o buscar por nombre.
3. **Registrar compra.** Si el programa es por artículo, ajusta la cantidad antes.
4. Si aparece "¿Otra compra?", es porque hubo otra hace menos de 20 s: confirma solo si de verdad es otra compra.
5. Cuando hay **Recompensa disponible**: entrega el premio y después **Confirmar canje → Sí, canjear**. Un código ya canjeado no se acepta otra vez.

## 4. Cliente
1. Escanea el QR del mostrador → **Obtener mi tarjeta gratis**.
2. Escribe su nombre, acepta el aviso de privacidad. El contacto es opcional y solo sirve para promociones.
3. Guarda el **enlace personal** que aparece (es su llave para abrir la tarjeta en otro teléfono).
4. En caja muestra su QR. Su tarjeta se actualiza sola.

## 5. Guion de demostración (10 minutos, 3 dispositivos)
| Paso | Dispositivo | Qué mostrar |
| :- | :- | :- |
| 1 | Teléfono A (cliente) | Escanea el QR impreso → crea tarjeta "0 de 8". |
| 2 | Teléfono B (caja) | Inicia sesión como empleado → Escanear → Registrar compra. |
| 3 | Teléfono A | El sello aparece solo en ~3 s, con animación. |
| 4 | Computadora (dueño) | Resumen: 1 cliente, 1 visita, 1 compra, 1 sello. |
| 5 | Teléfono B | Registra más compras (confirmando "otra compra") hasta 8. |
| 6 | Teléfono A | Celebración y código de recompensa. |
| 7 | Teléfono B | Escanea el QR de la recompensa → Confirmar canje. |
| 8 | Computadora | Canjes 1. Mostrar que 8 compras seguidas = 1 visita. |
| 9 | Computadora | Abrir Barbería Demo Metepec: mismo producto, otros textos y reglas. |

## 6. Operación y soporte
- **Respaldo:** activar respaldos diarios del proveedor de BD. Manual: `pg_dump --format=custom "$DATABASE_ADMIN_URL" > vlux-AAAA-MM-DD.dump`.
- **Recuperación:** `pg_restore --clean --if-exists -d "$DATABASE_ADMIN_URL" archivo.dump` sobre una base nueva, verificar y después apuntar la app.
- **Cliente perdió su tarjeta:** hoy no hay recuperación automática; puede crear otra (pendiente V0.3: reenvío del enlace).
- **Empleado se fue:** Panel → Equipo → Desactivar.
- **Contraseña olvidada:** el equipo VLUX la restablece en BD (pendiente V0.3: flujo propio).
