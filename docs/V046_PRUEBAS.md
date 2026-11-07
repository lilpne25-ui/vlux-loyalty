# V0.4.6 · Pruebas

Todas corrieron el 2026-11-07 en el contenedor de trabajo: PostgreSQL 16 local desechable, emulador local de Vercel Output, Chromium sin interfaz (Playwright) emulando Pixel 7 y iPhone 13. Correo SIMULADO (`mock`) o servidor SMTP local; servicio push SIMULADO. **Ninguna prueba se hizo en un teléfono físico.**

## Resumen
| Suite | Resultado |
|---|---|
| `npm run typecheck` | OK |
| Unitarias (`npm run test:unit`) | 65/65 |
| Integración (`npm run test:integration`, BD real con RLS) | 141/141 |
| E2E V0.4.6 (`bash scripts/e2e-v046.sh`) | 27/27 |
| Regresión E2E V0.2 → V0.4.5 (`bash scripts/e2e-v046-regresion.sh`) | todas en verde (V0.3: 24 PASS + 1 BLOCKED heredado «K», igual que en V0.3) |

## Matriz T01–T31
| Prueba | Qué comprueba | Dónde | Estado |
|---|---|---|---|
| T01 | Enlaces permanentes sin credenciales y al negocio correcto | integración + E2E A1 | VERIFICADO |
| T02 | Renovar invitación pendiente = token nuevo, el anterior deja de servir | integración + E2E A3, B2 | VERIFICADO |
| T03 | Invitación consumida nunca vuelve a mostrar token; dueño activo recibe enlace permanente | integración | VERIFICADO |
| T04 | Código presencial: un solo uso, 30 min, límite de intentos | integración + E2E B1–B5 | VERIFICADO |
| T05 | Restablecer contraseña: enlace de un solo uso, nunca se muestra la contraseña | integración | VERIFICADO |
| T06 | Sin cuentas duplicadas; bitácora sin enlaces | integración + E2E A5 | VERIFICADO |
| T07 | Un empleado nunca obtiene acceso de dueño | integración | VERIFICADO |
| T08–T11 | Manifiesto del panel/caja por negocio, íconos propios, entrada solo al negocio correcto | integración + E2E C3, F1 | VERIFICADO |
| T12 | Bienvenida del dueño con 3 acciones tras activar | E2E B3–B4 | VERIFICADO (emulado) |
| T13 | Pantalla de instalación Android/iPhone; iPhone sin botón automático | E2E C1, C2, C5 | VERIFICADO (emulado). Instalación real: PENDIENTE en dispositivo físico |
| T14–T19 | Adaptador SMTP: configuración, TLS con verificación real, STARTTLS+AUTH, 4xx/5xx/caído, flujo desde Control Center | integración con servidor SMTP local y CA generada | VERIFICADO localmente. Servidor Stalwart real: BLOQUEADO |
| T20 | Sin VAPID el push queda apagado; solo se publica la llave pública | integración | VERIFICADO |
| T21 | Suscripción exige tarjeta, servicio push conocido y categoría | integración + E2E E1 (no se pide permiso al cargar) | VERIFICADO |
| T22 | Recompensa y «casi lo logras» cifrados (descifrado real en la prueba), sin datos personales | integración | VERIFICADO |
| T23 | Sin duplicados; reintento acotado | integración | VERIFICADO |
| T24 | Aislamiento entre negocios (RLS) | integración | VERIFICADO |
| T25 | Cambiar categorías / desactivar todo; 410 desactiva | integración | VERIFICADO |
| T26 | Horas de silencio, tope semanal, 2 promociones / 30 días | integración + E2E D1–D3 | VERIFICADO |
| T27 | «Te extrañamos» una vez por ausencia; cita genérica; anonimizar apaga avisos | integración | VERIFICADO |
| T28–T31 | Ubicación pública del negocio; cálculo en el teléfono; ningún endpoint recibe la ubicación del cliente | integración + E2E E3–E4 | VERIFICADO |

Extra E2E: E2 (estado de «Mis notificaciones»), E5 (iPhone sin instalar explica agregar a inicio), G (sin scroll horizontal en móvil), Z (sin errores de consola).

## Límites honestos
- Chromium sin interfaz reporta el permiso de notificaciones como **bloqueado** aun concediéndolo; por eso la captura muestra el estado «Bloqueadas» y la pantalla de ofrecimiento se cubre con la lógica y la integración, no con captura.
- El envío push se probó contra un servicio simulado que descifra cada mensaje con las llaves del suscriptor; **no** contra FCM/Apple reales (requiere llaves VAPID en un despliegue y un teléfono).
- `beforeinstallprompt` no existe en Chromium sin interfaz: el botón «Instalar ahora» no se pudo ejercitar; se verificaron las instrucciones de respaldo.

## Pendiente en dispositivos físicos (no inventado)
1. Android/Chrome: instalar el panel desde la bienvenida, ver ícono y nombre; abrir la tarjeta, activar avisos y recibir «Recompensa lista» tras una compra.
2. iPhone (iOS 16.4+): agregar el panel y la tarjeta a inicio; confirmar que la app pide sesión una vez; activar avisos desde la app instalada y recibir uno.
3. «¿Estoy cerca?» con GPS real en el local.

## Capturas (`docs/evidencia/capturas/v046-*.png`, escala 2×)
A centro de accesos y WhatsApp · B activación presencial y `/activar` · C bienvenida, instalación Android/iPhone, acceso permanente · D comunicación con clientes · E «Mis notificaciones», «¿Estoy cerca?», iPhone · F aviso de negocio equivocado.
