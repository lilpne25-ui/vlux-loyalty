# V0.4.2 · Pruebas

Local (PostgreSQL local, emulador Vercel Output, Chromium): `tsc` sin errores · build OK · unit + integración **91/91** (incluye `v042.test.ts`: RLS, hash de logo, demo) · E2E nuevo `v042-comercial.cjs` **36/36** · regresiones: v021 14/14, v022-pwa 40/40, v02 29/29, v03 24/24 (1 BLOCKED: Google Wallet), v04 35/35.

| # | Prueba | Resultado | Evidencia |
|---|---|---|---|
| T01 | La URL principal muestra VLUX Loyalty, no el Café | PASS | E2E T01/T01b; Preview: HTML servido 200 |
| T02 | Logos oficiales visibles | PASS | E2E T02 (3 PNG cargan); Preview: `/brand/vlux-logo-full.png` 200 |
| T03 | Navegación principal | PASS | E2E T03a-c |
| T04 | Cliente sin Vercel Authentication | PASS (local) / PASS por configuración (Preview: `ssoProtection` desactivada en el proyecto público; GET públicos 200) | E2E T04; get_project |
| T05 | Dueño con la autenticación propia | PASS local · **NOT TESTED en Preview** (el POST de sesión no se puede lanzar desde aquí; usuarios y `DEMO_ACCESS` verificados) | E2E T05 |
| T06 | Empleado con la autenticación propia | PASS local · NOT TESTED en Preview (igual) | E2E T06 |
| T07 | Control Center protegido | PASS: interno con SSO activo; público responde 404 en `/api/admin/*` | get_project; fetch |
| T08 | Estudio de marca | PASS | E2E T08 |
| T09 | Colores extraídos del logo | PASS | E2E T09 |
| T10 | Tarjeta personalizada se actualiza | PASS | E2E T10 |
| T11 | Sellos se registran | PASS (estudio y caja) | E2E T11, T06 |
| T12 | Panel refleja operaciones | PASS | E2E T12, G1 |
| T13 | PWA conserva accesos | PASS (manifest); instalación en teléfonos físicos NOT TESTED | E2E T13 |
| T14 | `businesses` aislada | PASS: integración (sin contexto/otro negocio = 0 filas; DELETE denegado); políticas verificadas en Preview | `v042.test.ts` |
| T15 | Logo resiste abusos conocidos | PASS: falso .png, 6 MB, SVG rechazados; hash almacenado; sin escrituras desde el Estudio | E2E T15a-d |
| T16 | Recorrido comercial completo | PASS local | E2E T16 |
| T17 | Datos de prueba no se presentan como reales | PASS: «Demostración», «Datos ficticios», negocio `is_demo` | E2E, UI |
| T18 | Rutas heredadas | PASS local (redirección con aviso, sin errores) | E2E T18 |
| T19 | Versión pública sin APIs de administración | PASS en Preview (404) | fetch |
| T20 | Production intacto | PASS: solo despliegues `staging`; no se tocó Production | Vercel |

Capturas locales en `docs/evidencia/capturas/v042-*.png`. No se probó en iPhone/Android físicos ni con navegadores móviles reales.
