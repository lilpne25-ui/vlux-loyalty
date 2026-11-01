# Manual comercial · Alta de una cafetería en VLUX Loyalty

Para quien vende e instala VLUX Loyalty. Ejemplo: "Café La Esquina", Metepec. Tiempo total: **unos 90 minutos** repartidos en 3 momentos.

## 0. Antes de ofrecerlo: ¿este negocio califica?
| Pregunta | Buena señal |
| :- | :- |
| ¿Cuántos clientes repiten en la semana? | Más de 30% (cafetería de barrio, oficina, escuela) |
| ¿Usan tarjeta de sellos de papel? | Sí: el dolor es claro (se pierde, se falsifica, no hay datos) |
| ¿Quién atiende la caja? | 1 a 4 empleados con celular |
| ¿Tienen perfil de Google Maps? | Sí: la tarjeta empuja reseñas |
| ¿Quién decide? | El dueño está en el local al menos unas horas a la semana |

## 1. Reunión de venta (20 min, en el local)
1. **Gancho (2 min):** "¿Cuántas tarjetas de papel se tiran a la semana? ¿Sabes quiénes son tus 20 mejores clientes?"
2. **Demo en vivo (10 min):** guion de 3 dispositivos de `MANUAL_PILOTO.md` §5. Usa tu teléfono como cliente y el del dueño como caja.
3. **Oferta del piloto (5 min):**
   - 30 días sin costo y luego 299 MXN al mes. El precio es una hipótesis: anota la reacción del dueño.
   - Sin contrato largo.
   - El negocio es dueño de sus datos y los puede exportar.
4. **Cierre (3 min):**
   - Acuerda la fecha de instalación.
   - Pide la recompensa que quiere dar (por ejemplo, "10° café gratis").
   - Pide el enlace de reseñas de Google.

> No prometas: Apple Wallet o Google Wallet (es la fase V0.3), integración con su punto de venta ni cumplimiento legal "garantizado".

## 2. Instalación (45 min, en el local)
**Antes de llegar (equipo VLUX):**
1. Alta del negocio con el token de plataforma. El token **nunca** se comparte con el cliente.
   ```bash
   curl -X POST "$BASE/api/platform/businesses" -H "Authorization: Bearer $PLATFORM_ADMIN_TOKEN" \
     -H "Content-Type: application/json" -d @alta-cafe-la-esquina.json
   ```
   El JSON lleva: nombre, ciudad, giro `cafeteria`, colores, correo del dueño y contraseña temporal. Ver `server/services/businesses.ts` para los campos exactos.
2. Imprime 2 QR del mostrador: Panel → **QR del mostrador** → Imprimir. Usa tamaño media carta y, si es posible, enmícalos.
3. Ten listo el aviso de privacidad del negocio. **Sin aviso revisado no se registran clientes reales.**

**En el local:**
1. **Dueño (10 min):** entra en `/acceso` con la contraseña temporal. La app le pide cambiarla. Después configura en **Programa** los sellos (8 a 10 en cafetería), la recompensa, el modo "por compra" y el enlace de Google.
2. **Equipo (10 min):** el dueño crea a cada empleado en **Equipo**. Cada empleado entra en su teléfono y cambia su contraseña temporal.
3. **Prueba real (10 min):** un empleado registra una compra a tu tarjeta de prueba. Verifica que el sello aparece en tu teléfono en menos de 5 s.
4. **Mostrador (5 min):** pega el QR a la vista, junto a la caja.
5. **Capacitación (10 min):** muestra al empleado estos 4 casos:
   - Escanear con la cámara.
   - El cliente sin batería: buscarlo por nombre o código.
   - El aviso de "¿otra compra?".
   - Canjear el premio.

## 3. Seguimiento (25 min en 30 días)
| Día | Acción |
| :- | :- |
| 2 | Llamada de 5 min: ¿algún problema en caja? |
| 7 | Revisa el panel con el dueño: tarjetas, visitas y reseñas. Es la primera evidencia de valor |
| 21 | Anota cuántos clientes regresaron 2 o más veces. Esa cifra es el argumento para cobrar |
| 30 | Conversación de precio. Si acepta: alta de cobro. Si no: pregunta por qué y anótalo |

## 4. Soporte frecuente (sin tocar la base de datos)
| Situación | Quién | Cómo |
| :- | :- | :- |
| Empleado olvidó su contraseña | Dueño | Equipo → **Nueva contraseña** → le muestra el QR o el enlace (vale 60 min y un solo uso) |
| Dueño olvidó su contraseña | VLUX | `POST /api/platform/password-reset` → enlace de un solo uso |
| Cliente cambió de teléfono o perdió su enlace | Empleado | Caja → buscar cliente → **Nuevo enlace** → el cliente escanea. El enlace anterior deja de servir |
| Compra registrada por error | Dueño | Clientes → historial → **Anular** con motivo. Queda en la auditoría |
| Empleado dejó el negocio | Dueño | Equipo → **Desactivar** (efecto inmediato) |
| Cliente pide sus datos o su baja | Dueño | Clientes → Descargar / Eliminar datos personales |

## 5. Lo que el dueño debe saber (decir en la instalación)
- Se premia **la visita**, no la reseña. Google prohíbe pagar o premiar reseñas.
- Los datos de sus clientes son del negocio. VLUX solo los trata como encargado (pendiente el contrato).
- Si algo falla, se escribe al WhatsApp de soporte de VLUX. **[Pendiente: definir número y horario]**
