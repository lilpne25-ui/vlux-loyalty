# VLUX Loyalty 1.0.x · Pulido UX operativo

Rama `claude/project-thread-bcmxkp`, a partir de `9220227` (estado desplegado en ambos Preview, PR #4).
Sin cambios en `main`, Production, Supabase Preview ni secretos. Migración 0017 separada, con reversa, **no aplicada en ningún entorno remoto**.
Metodología: MSA-LUD (átomos pequeños, cada uno con su prueba y su compuerta de calidad).

## 1. Diagnóstico inicial

| Frente | Qué había | Qué faltaba / problema |
| :- | :- | :- |
| R1 · Cartel QR | Vista del cartel en Accesos con `window.print()`. CSS de impresión que ocultaba todo con `visibility:hidden` y ponía el cartel `position:absolute` en la esquina, medido en píxeles de pantalla (máx. 420 px). PNG del QR solo (1024 px). | En celular salía pequeño (QR ≈ 5.7 cm), pegado a la esquina, con hojas en blanco (lo oculto seguía ocupando espacio), sin color si el navegador no imprime fondos, y dependía del ancho del teléfono y del zoom. No había PDF ni cartel completo descargable. «Imprimir esta página» del centro de accesos imprimía solo el cartel, no la página. |
| R2 · Recuperación | El personal (caja) ya podía reemitir el enlace de una tarjeta en persona (`/staff/cards/:id/link`, revoca el anterior). | El cliente no tenía cómo pedirlo. Además el contacto es **opcional** al registrarse: muchas tarjetas no tienen teléfono ni correo, así que la recuperación no puede ser 100 % automática. El correo real sigue sin estar operativo. |
| R3 · Contacto VLUX | Solo «Powered by VLUX» al pie. | Ningún canal de soporte ni enlace a la presentación. |
| R4 · Reporte de errores | Nada. | Ningún botón ni registro. |

## 2. Plan (por módulos, con riesgos)

| Módulo | Decisión | Riesgo y mitigación |
| :- | :- | :- |
| R1 | Generar el cartel como **archivo** (canvas → PNG a 200 ppp; PDF propio con fondo JPEG + QR en **rectángulos vectoriales**). Ruta dedicada `/panel/cartel` que imprime esa imagen a tamaño físico fijo con `@page`. Sin dependencias nuevas. | Safari iOS limita el lienzo (~16.7 Mpx): 200 ppp carta = 3.7 Mpx. Impresión casera no llega a la orilla: margen blanco de 13 mm. Fuentes no cargadas: se espera `document.fonts` y hay respaldo. |
| R2 | Tabla nueva `recovery_requests` (0017) + bandeja del dueño. Respuesta idéntica exista o no la tarjeta. El dueño genera el enlace y **él** lo envía (WhatsApp/correo/QR en persona). | Enumeración de clientes: respuesta y tiempos iguales. Abuso: 5/h por IP, 60/h por negocio, máximo 200 abiertas, repeticiones suman en vez de crear filas. Suplantación: la bandeja marca si el contacto coincide con el registro; si no, pide verificar en persona. Datos: vencen a 30 días (contacto enmascarado), anonimizar al cliente las enmascara. |
| R3 | Bloque discreto al pie de las vistas del cliente con dos botones. | Ninguno relevante: enlaces `wa.me` y presentación propia. |
| R4 | Botón en el encabezado del panel → modal con contexto automático → WhatsApp a soporte + evento en la bitácora con referencia `VLX-XXXXXX`. Sin migración. | Bloqueo de ventanas emergentes en iOS: se usa un enlace real (`<a target=_blank>`) y el registro va con `fetch keepalive` sin esperar. |

## 3. Cambios implementados

**Migración (separada):** `db/migrations/0017_recovery_support.{up,down}.sql` · para Supabase: `docs/release-1.0/0017_pegar_en_supabase.sql` y `0017_revertir_en_supabase.sql`.
- `recovery_requests`: RLS `tenant_isolation` (igual que 0001/0014), `SELECT, INSERT` + `UPDATE` por columnas (nunca `business_id`, `id` ni `contact_hash`), **sin DELETE**. Índice único parcial: una abierta por contacto y negocio.
- `businesses.contact_whatsapp` (opcional, 10 dígitos).
- No usa `app_scope()`: funciona con Preview en 0015 o en 0016. No choca con la numeración ni los roles de 0016.
- Reversa: `DROP TABLE recovery_requests` + quitar la columna. Borra solicitudes y el WhatsApp de cada negocio; tarjetas, clientes y bitácora intactos.
- `ops/grants.sql` actualizado (bloque condicional: sirve para respaldos anteriores y posteriores a 0017). **Hay que copiarlo también a `vlux-ops`.**
- Fuera del respaldo por negocio (`platform_business_export`): son datos operativos de 30 días. Al purgar un negocio se borran en cascada.

**Rutas nuevas**
| Ruta | Quién | Qué |
| :- | :- | :- |
| `/panel/cartel?negocio=&tam=carta\|a5` (UI) | Dueño | Cartel a tamaño físico: Imprimir, PDF, PNG, QR solo. |
| `GET /api/public/businesses/:slug/help` | Público | `{ recovery, businessWhatsapp }` (no falla sin 0017). |
| `POST /api/public/businesses/:slug/recovery` | Público | Crea/actualiza solicitud. 202 siempre igual. 503 `recovery_unavailable` sin 0017. |
| `GET /api/owner/recovery` | Dueño | Bandeja (abiertas primero) + vencimiento perezoso a 30 días. |
| `POST /api/owner/recovery/:id/link` | Dueño | Enlace nuevo (revoca los anteriores). `cardId` opcional para elegir a mano. |
| `POST /api/owner/recovery/:id/close` | Dueño | `link_sent`, `in_person`, `not_customer`, `spam`. |
| `PUT /api/owner/contact` | Dueño | WhatsApp público del negocio. |
| `POST /api/staff/support-report` | Dueño o caja | Evento `support.reported` en la bitácora. |

**Servicios:** `server/services/recovery.ts`, `server/services/support.ts`; `owner.anonymizeCustomer` enmascara solicitudes del cliente.
**Frontend:** `src/lib/poster.ts` (diseño, PDF, dibujo), `src/lib/support.ts` (wa.me, mensajes, dispositivo), `src/views/PosterPrint.tsx`, `src/components/CustomerHelp.tsx` (Perdí mi acceso + ayuda VLUX), `src/components/RecoveryInbox.tsx`, `src/components/ReportProblem.tsx`; cambios en `Owner.tsx`, `Customer.tsx`, `App.tsx`, `styles.css` (CSS de impresión nuevo), `vite.config.ts` (`__APP_VERSION__`).
**Bitácora:** `recovery.requested`, `recovery.dropped`, `recovery.link_issued`, `recovery.closed`, `card.link_reissued`, `business.contact_updated`, `support.reported`. Nunca guarda tokens; el contacto del cliente no va en los detalles.

## 4. Pruebas

| Tipo | Resultado | Detalle |
| :- | :- | :- |
| Unitarias | **88/88** (9 nuevas) | Diseño del cartel cabe en carta/A5 con 1 y 2 renglones; QR ≥ 9 cm (carta) / ≥ 6.5 cm (A5) con módulo ≥ 1.5 mm para la URL más larga; QR rasterizado a 200 ppp se lee con jsQR; PDF válido (xref exacto, MediaBox, QR vectorial); wa.me y mensajes; resumen de dispositivo. |
| Integración | **215/215** (13 nuevas) | Sin enumeración; repetición suma; enlace nuevo revoca el anterior y abre la tarjeta; elección manual; aislamiento entre negocios; permisos (anónimo 401, caja 403); límite por IP 429; WhatsApp del negocio; vencimiento y anonimización; **compatibilidad sin 0017** (503 y el resto igual); RLS directa con `vlux_app` (0 filas sin negocio, sin DELETE, sin cambiar `business_id`); reporte en bitácora. |
| Migración | PASS | 0017 subir → revertir → subir sobre **0015** y sobre **0016**; idempotente; archivo para pegar con guardas (rechaza doble aplicación) y su reversa probados. Suite de recuperación + lealtad verde sobre 0015+0017. |
| E2E nuevo | **34/34** (2 corridas seguidas) | `scripts/e2e-v1-ux.sh`. Chromium escritorio + móvil emulado (390×844). El QR se **lee después de imprimir**: PDF de impresión de Chromium y PDF/PNG descargados rasterizados con pdftoppm y decodificados. Ver lista abajo. |
| Regresión E2E | **27/27** | `scripts/e2e-v046.sh` (accesos, activación, PWA, comunicación). |

E2E 1.0.x (todas PASS): PDF carta 1 hoja 8.5×11 in con QR legible; PNG 1700×2200; QR solo 2035 px; PDF A5 148×210 mm; A5 a 72 ppp (impresión pobre) sigue legible; ruta de impresión sin barra ni pestañas; **imprimir desde el teléfono = 1 hoja carta con QR legible**, el cartel mide el ancho de la hoja (816 px CSS = 215.9 mm) y no el del teléfono; con zoom 160 % sigue saliendo 1 hoja; A5 desde el teléfono; descargar PDF desde el teléfono; soporte WhatsApp exacto `https://wa.me/527441452048?text=Hola, necesito ayuda con mi tarjeta de lealtad de <negocio>.`; presentación abre en otra pestaña; botones ≥ 40 px; flujo completo de recuperación (cliente → dueño → enlace nuevo → teléfono nuevo); mismo mensaje con contacto inexistente; bitácora completa; WhatsApp del negocio visible al cliente; reporte con negocio, vista, descripción, usuario/rol, fecha, dispositivo, versión y referencia en 2 toques; ticket en bitácora con la misma referencia; 0 errores de consola.

Capturas: `docs/evidencia/capturas-v1-ux/` (enlaces personales ocultos).

### Casos manuales pendientes (dispositivos reales)
1. iPhone Safari: Accesos → Imprimir cartel → AirPrint (carta, 100 %) y también Descargar PDF → Archivos → Imprimir. Escanear el papel con otro teléfono.
2. Android Chrome: igual con «Guardar como PDF» y con una impresora real; revisar que no salga en 2 hojas.
3. Imprimir A5 en hoja carta (el diálogo escala): el QR debe seguir leyéndose.
4. Cliente en iPhone: «Perdí mi acceso» y abrir el enlace nuevo que llegó por WhatsApp.
5. Dueño en iPhone: «Reportar problema» → debe abrir WhatsApp con el texto completo.

## 5. Resultado por requerimiento

| Requerimiento | Veredicto | Por qué |
| :- | :- | :- |
| R1 · Impresión móvil del QR | **PASS** (emulado) · físico pendiente | Ruta dedicada + PDF/PNG/QR solo, carta y A5, verificado leyendo el QR tras «imprimir». Falta confirmarlo en impresora y teléfonos reales. |
| R2 · Recuperación de acceso | **PASS** en código · **requiere aplicar 0017** | Sin 0017 la pantalla del cliente dice «pídelo en caja» y ofrece soporte VLUX; con 0017 funciona completo. |
| R3 · Contacto VLUX para clientes | **PASS** | Bienvenida, tarjeta y recuperación. |
| R4 · Reportar problema (dueño) | **PASS** | En el encabezado del panel (todas las pestañas); WhatsApp + bitácora. |

## 6. Notas honestas

**Quedó bien:** el cartel ya no depende del teléfono: es un archivo de tamaño fijo y el QR sale vectorial en el PDF. La recuperación no revela clientes y deja la decisión al dueño, sin depender de correo ni de servicios externos.

**Pendiente / límites:**
- Nada probado en teléfonos ni impresoras físicas.
- `Conocer VLUX Loyalty` apunta a `/?ref=tarjeta` (la presentación de esta misma app). Para enviar a la landing pública de la demo, compilar con `VITE_VLUX_LANDING_URL=https://…`.
- Los reportes viven en la bitácora del negocio (`support.reported`): VLUX los encuentra por la referencia del WhatsApp, pero **no hay bandeja en el Control Center**.
- El WhatsApp de recuperación y el del reporte los envía la persona desde su teléfono: si no lo envía, solo queda el registro.
- Clientes registrados sin contacto: no hay coincidencia automática; el dueño busca por nombre o código y debe verificar en persona (la UI lo advierte).
- Al aplicar 0017, copiar `ops/grants.sql` al repo privado `vlux-ops`.

**Recomendaciones**
- **V1.1:** bandeja de reportes y de recuperaciones en el Control Center (lectura con alcance `platform`); notificación push al dueño cuando llega una solicitud; recordatorio de «Recuperar» en la caja (el empleado ve las solicitudes al buscar la tarjeta).
- **V1.2:** con correo operativo, enviar el enlace de recuperación por correo de un solo uso (sin intervención del dueño) solo cuando el contacto coincide; versión del cartel en tamaño mesa (tent card 10×15 cm) y sticker redondo.

## Cómo reproducir
```
npm ci && npm run typecheck && npm run test:unit
npm run db:setup:test && npm run test:integration      # requiere .env.test con PostgreSQL local
npm run build:vercel && bash scripts/e2e-v1-ux.sh       # requiere .env con BD local, pdftoppm y python3-pil
```
