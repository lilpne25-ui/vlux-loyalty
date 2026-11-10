# VLUX Loyalty 1.0.x · Diagnóstico móvil y de personalización del cliente · 2026-11-10

## Alcance y línea base
- Código realmente desplegado: **8c6287f** (rama `claude/project-thread-bcmxkp`, PR #5), verificado en la lista de despliegues de Vercel: es el más reciente READY de `vlux-loyalty` (interno) y `vlux-loyalty-demo`, ambos target staging. Esquema Supabase Preview en 0015 (según el informe del 8-nov; no lo releí hoy).
- Rama nueva: `claude/project-thread-ghkrmf`, creada desde 8c6287f. Sin tocar Production, Odalex, secretos, `main`, 0016/0017 ni despliegues.
- Entorno de prueba: compilación de ese commit en el emulador de Vercel Output, PostgreSQL 17 local desechable migrado solo hasta 0015 (igual que Preview), 5 negocios sintéticos (nombre largo, logo ancho, logo alto, color amarillo claro, programa de puntos, programa de 20 sellos, acabados signature/silver/black).
- Metodología: Chromium móvil emulado (Pixel 7 UA, táctil, DPR 2) a 320, 360, 375, 390, 412 y 430 px; 11 pantallas por negocio (bienvenida, registro, registro con teclado emulado, recuperación y resultado, tarjeta con avance, vista previa Wallet, celebración, modal de recompensa, tarjeta con premio, tarjeta nueva con enlace personal); detectores automáticos (desborde, recorte, objetivos táctiles, tipografía) **más** revisión visual de capturas.

## Lo que NO se pudo probar (no lo doy por verificado)
- **PWA instalada en dispositivo físico: NO PROBADO.** Solo se puede emular `display-mode: standalone`; no se corrió en esta auditoría.
- **iPhone/Safari real (WebKit), Android real, teclado móvil real, zonas seguras reales (notch, barra inferior): NO PROBADO.** El teclado se aproximó reduciendo el alto del viewport; no reproduce `visualViewport`.
- **Tipografías reales:** el sandbox no llega a Google Fonts (Geist, Young Serif), así que las capturas usan fuentes de respaldo. Los anchos de texto pueden variar con las reales.
- Edición de personalización desde Control Center (requiere administrador con 2FA de Vlux) y persistencia tras guardar: **NO PROBADO**; solo se revisó el código y se sembró por SQL en la BD local.

## Defectos reproducidos
| ID | Gravedad | Defecto | Evidencia | Estado |
|---|---|---|---|---|
| F1 | **Alta** | En programas con más de 14 sellos (p. ej. 20) a 320 px la 7.ª columna de sellos queda cortada por el borde de la tarjeta: el cliente no ve los sellos 7 y 14 (el 7 estaba lleno). A 360 px apenas cabe. | `evidencia/F1-sellos-20-320px-before.png` / `-after.png` | **Corregido** y comparado |
| F2 | Media | El nombre del negocio en la tarjeta se cortaba con «…» a 320–375 px («Barbería Los Tres Herman…»). El nombre es la identidad del negocio. | `evidencia/F2-nombre-tarjeta-320px-before/after.png` | **Corregido** (hasta 2 líneas) |
| F3 | Media-baja | Objetivos táctiles por debajo de 40 px: «Regresar» (20 px de alto, 2 pantallas), «Ya lo guardé» (19 px), «Copiar» (32 px). | `detectores-antes.json` vs `detectores-despues.json` (esos tres desaparecen) | **Corregido** a 44 px |
| F4 | Baja | «Mis notificaciones» con la etiqueta de permiso («Bloqueadas en este teléfono») se parte en 2 líneas a ≤375 px; legible pero apretado. | `M-*-tarjeta-6-anchos-antes.png` | Sin corregir (cosmético) |
| F5 | Baja | Historial: «Operación · …» se trunca a 320 px. | idem | Sin corregir |
| F6 | Baja | Botones «Ver» (36 px), «Cerrar» del modal (36 px) y pestañas Apple/Google Wallet (36 px) siguen bajo 44 px. Textos de 9–10.5 px en etiquetas de la tarjeta (diseño intencional). | `detectores-despues.json` | Sin corregir |

No se encontró (en las 6 resoluciones y 5 negocios): desborde horizontal del documento, botones cortados fuera de F1, errores de JavaScript, modales que no caben ni QR cortados. El «input oculto con teclado» que marcó el detector (0.4 px) es artefacto de la emulación, no un defecto.

## Auditoría de personalización: qué existe y qué está conectado
Todo lo siguiente existe en BD (`businesses`) y llega a las pantallas del cliente por `/api/public/businesses/:slug` y `/api/me/:slug/card`:
| Opción | Quién la edita | Se refleja en el cliente |
|---|---|---|
| Nombre, ciudad, giro | VLUX (Control Center); dueño: nombre y giro (no ciudad) | Sí (encabezado, tarjeta, textos por giro) |
| Color principal y de acento | VLUX y dueño | Sí (`brandVars`: botones, hero, tarjeta, luminancia automática para texto claro/oscuro; con amarillo claro el texto se invierte bien) |
| Acabado de tarjeta (signature/silver/black) | Solo VLUX | Sí (tarjeta metálica) |
| Logotipo + ajuste (`logo_fit`) + original | Solo VLUX | Tarjeta: sí, con ajuste. Encabezados de bienvenida/registro/Wallet: usan `BusinessLogo` en círculo de 26–44 px, **sin** `logo_fit` (el logo ancho se ve diminuto) |
| Enlace de reseñas, ubicación | VLUX; dueño: solo reseñas | Sí |
| Reglas del programa (meta, unidad, recompensa, condiciones) | VLUX y dueño | Sí |

Observaciones (no son defectos confirmados; requieren decisión del propietario del producto):
1. **Ícono de la app instalada:** `renderIcon` genera la inicial del nombre con los colores del negocio; el logotipo no se usa. ¿Se espera el logo en el ícono?
2. **Hero de la bienvenida:** para el giro cafetería siempre se muestra la ilustración de taza (aunque el negocio tenga logo); en otros giros se muestra el logo dentro de un círculo blanco de 132 px.
3. **El dueño no puede cambiar logo, acabado ni ciudad** (`server/services/owner.ts` solo actualiza nombre, giro, colores y reseñas). ¿Es intencional?
4. No existen opciones de personalización de textos, fuente ni portada; no se inventó ninguna.

## Correcciones (pequeñas, sin tocar modelo ni backend)
Ver `correcciones.diff` (4 archivos, 11 líneas netas): `LoyaltyCard.tsx` (rejilla `minmax(0,36px)` con círculos que se encogen; nombre `line-clamp-2`), `ui.tsx` (prop `touch` en `CopyButton`), `Customer.tsx` y `CustomerHelp.tsx` (44 px en Regresar, «Ya lo guardé», Copiar).
Verificación: typecheck OK, unitarias 96/96, auditoría «después» en 3 negocios × 6 anchos (cafetería, barbería, 20 sellos): F1 y F2 visualmente resueltos, F3 sin hallazgos. **No** se corrieron las suites E2E 1.0.x ni las de integración con este cambio; el cambio de tamaño de sellos afecta también a Caja, Panel y Estudio (misma pieza), que no revisé visualmente.

## Bloqueos y preguntas para el propietario del producto
1. Probar en teléfonos reales (iPhone Safari, Android Chrome, PWA instalada): es el único modo de cerrar teclado, zonas seguras y PWA.
2. Decidir las observaciones 1–3 de personalización.
3. ¿Aprueba fusionar estas correcciones en PR #5 (o abrir PR aparte)? Dependen de #4/#5; no se desplegó nada.

## Revisión independiente (msa-lud-dev, solo lectura)
Veredicto: **aprobado con observaciones menores**, sin bloqueos. Revisó el código; no ejecutó build ni pruebas. Notas: el `gap` de los sellos pequeños baja de 10 a 8 px en móvil; las dimensiones de la rejilla viven en dos sitios (estilo y clase); falta una prueba automatizada a 320 px con 20 sellos; recomienda verificar en teléfono real.
