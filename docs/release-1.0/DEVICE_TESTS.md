# VLUX Loyalty 1.0.0-rc.1 · Validación en dispositivos físicos

**Estado global: NOT TESTED.** Ninguna prueba de esta lista se ha hecho en un teléfono real. Las pruebas automatizadas (Chromium/WebKit/Firefox de Playwright, viewport móvil) **no cuentan**: WebKit automatizado no es un iPhone, y no prueba cámara, pantalla de inicio, bloqueo, luz ni red real. Nadie marca PASS sin hacerla en el equipo.

Valores: **PASS** · **FAIL** (anota qué pasó) · **BLOCKED** (no se pudo, anota por qué) · **NOT TESTED**.
Datos: usar solo el negocio sintético de Preview (`cafe-demo-toluca` o uno creado para la prueba) y nombres inventados. **Nunca datos de clientes reales.**

## Equipos (llenar antes de empezar)
| Rol | Marca y modelo | Sistema y versión | Navegador y versión | Probó | Fecha |
|---|---|---|---|---|---|
| Cliente A (iPhone) | | iOS | Safari | | |
| Cliente B (Android) | | Android | Chrome | | |
| Caja (tableta o teléfono Android) | | | Chrome | | |
| Dueño (computadora) | | | | | |
Mínimo para el piloto: 1 iPhone con iOS 17+, 1 Android 12+ con Chrome, 1 equipo de caja. Ideal: un Android de gama baja (≤ 3 GB RAM), porque es lo que suele haber en mostrador.

## URL de prueba
Preview público del RC (se anota al desplegar en `RELEASE_NOTES.md`). No requiere cuenta de Vercel.

## A. Cliente en iPhone (Safari)
| # | Prueba | Esperado | Estado | Evidencia / nota |
|---|---|---|---|---|
| A1 | Escanear con la **cámara nativa** el QR de mostrador impreso | Abre el alta del negocio en < 3 s | NOT TESTED | |
| A2 | Alta: nombre, aceptar aviso; sin aceptar el botón no avanza | Tarjeta "0 de N" y enlace personal | NOT TESTED | |
| A3 | Compartir → "Agregar a pantalla de inicio" y abrir desde el ícono | Abre la tarjeta sin pedir datos, sin barra de Safari | NOT TESTED | |
| A4 | Bloquear 1 min, volver; la caja registra mientras tanto | La tarjeta se actualiza sola en ≤ 5 s al volver | NOT TESTED | |
| A5 | Brillo al mínimo, la caja escanea el QR de la tarjeta | Se lee a la primera | NOT TESTED | |
| A6 | Texto grande del sistema (Accesibilidad → Tamaño de texto máximo) | Nada se corta; botones usables | NOT TESTED | |
| A7 | Modo avión → abrir la tarjeta desde el ícono | Mensaje claro sin conexión; al volver la red, se recupera | NOT TESTED | |
| A8 | "Avisos" en la tarjeta | Dice que aún no están disponibles (función congelada) y **no** pide permiso | NOT TESTED | |
| A9 | Botón de reseña en Google | Abre Google Maps/navegador del negocio; la visita no depende de reseñar | NOT TESTED | |

## B. Cliente en Android (Chrome)
| # | Prueba | Esperado | Estado | Evidencia / nota |
|---|---|---|---|---|
| B1 | Escanear el QR de mostrador (cámara o Google Lens) | Abre el alta | NOT TESTED | |
| B2 | Alta y tarjeta | Igual que A2 | NOT TESTED | |
| B3 | ⋮ → Instalar app / Agregar a inicio, abrir desde el ícono | Abre en modo app con el ícono y nombre del negocio | NOT TESTED | |
| B4 | Red lenta (Ajustes de desarrollador o datos móviles débiles) durante una compra | La compra no se duplica; mensajes claros | NOT TESTED | |
| B5 | Cambiar de teléfono: la caja emite "Nuevo enlace" y B escanea | Abre la tarjeta; el enlace viejo deja de servir | NOT TESTED | |

## C. Caja (empleado)
| # | Prueba | Esperado | Estado | Evidencia / nota |
|---|---|---|---|---|
| C1 | Primer inicio con contraseña temporal | Pide cambiarla | NOT TESTED | |
| C2 | Escanear con la cámara (dar permiso) el QR de A y de B | Lee en < 2 s; con poca luz también | NOT TESTED | |
| C3 | Buscar cliente por nombre sin escanear | Lo encuentra | NOT TESTED | |
| C4 | Registrar compra/visita | El sello aparece en el teléfono del cliente en ≤ 5 s | NOT TESTED | |
| C5 | Doble toque rápido en "Registrar" | Solo un sello | NOT TESTED | |
| C6 | Completar y canjear la recompensa | Celebración en el cliente; el código no se acepta dos veces | NOT TESTED | |
| C7 | Turno real: 20 operaciones seguidas | Sin cierres de sesión, sin lentitud acumulada | NOT TESTED | |
| C8 | Activación presencial con el código de 10 caracteres (XXXXX-XXXXX, vence en 30 min) | Activa la cuenta; el código no sirve una segunda vez | NOT TESTED | |

## D. Dueño (computadora o teléfono)
| # | Prueba | Esperado | Estado | Evidencia / nota |
|---|---|---|---|---|
| D1 | Panel: resumen y gráfica de 14 días | Cifras coinciden con las operaciones de la prueba | NOT TESTED | |
| D2 | Anular la compra de C4 | Saldo corregido; queda en el historial | NOT TESTED | |
| D3 | Invitar empleado y entregar por WhatsApp/copiar | El empleado activa su cuenta | NOT TESTED | |
| D4 | Anonimizar un cliente de prueba | Nombre "Cliente eliminado", sin contacto; el historial se conserva | NOT TESTED | |
| D5 | Imprimir el QR de mostrador (carta) | Se escanea a 50 cm y a 1 m | NOT TESTED | |

## Evidencia
- Capturas o video corto por prueba en `docs/evidencia/fisicos/rc1/` con nombre `A1-iphone13-ios17.4.png`. Recortar o tapar cualquier dato que no sea sintético.
- Registrar quién probó, fecha y la URL exacta del despliegue.
- Un FAIL bloquea el piloto si afecta A1–A4, B1–B3, C2–C6 o D2 (flujo de valor). Lo demás puede ir como limitación conocida.

## Resultado
| Bloque | PASS | FAIL | BLOCKED | NOT TESTED |
|---|---|---|---|---|
| A iPhone | 0 | 0 | 0 | 9 |
| B Android | 0 | 0 | 0 | 5 |
| C Caja | 0 | 0 | 0 | 8 |
| D Dueño | 0 | 0 | 0 | 5 |
