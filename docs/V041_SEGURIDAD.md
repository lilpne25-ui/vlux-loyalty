# V0.4.1 · Auditoría de seguridad

Alcance: diff `v0.4-recovery..v0.4.1` y las superficies de V0.4 (accesos públicos, logo, manifiestos, Estudio, Service Worker, Wizard, cookies, PUBLIC_APP_URL).
Método: revisión de código por el subagente `msa-lud-dev` (solo lectura, 2026-11-01; la metodología es privada y no se incluye en el repositorio) más las pruebas automatizadas. **No es una auditoría dinámica externa; no se declara seguridad perfecta.**

## Hallazgos y estado
| # | Sev. | Hallazgo | Estado |
|---|---|---|---|
| 1 | Media | `PUBLIC_APP_URL` aceptaba `http://` en producción | **Corregido**: en producción solo `https` (o `http://localhost`); si no cumple se ignora |
| 3 | Media | El logo se validaba por prefijo del navegador; un archivo con cabecera válida pero contenido distinto pasaría | **Corregido**: el servidor valida firma de bytes PNG/JPEG/WebP al guardar y al servir; `Content-Disposition: inline`; SVG rechazado por regex y restricción de BD. Pendiente (baja): validar estructura completa y dimensiones |
| 2 | Media | `md5` del logo (hasta 90 KB) en cada consulta pública sin límite de tasa (riesgo de disponibilidad) | **Abierto**. Arreglo: guardar el hash en una columna al guardar el logo |
| 5 | Baja | `scope: '/'` del manifiesto de Caja/Panel | **Aceptado**: acotarlo sacaría de la app instalada el flujo `/acceso`. Probar en dispositivo real |
| 6 | Baja | El shell del Control Center se sirve también en el proyecto público (sin datos; `/api/admin` responde 404) | **Abierto**, opcional: excluir el chunk admin del build público |
| 7 | Baja | Logo con caché pública de 1 año tras suspender un negocio | Aceptado (dato ya público) |
| 4 | Baja | Enlaces de invitación de administrador usan el origen interno | **Intencional**: el Control Center vive en el proyecto interno |
Sin hallazgos críticos ni altos.

## Categorías revisadas sin hallazgos reales
XSS/inyección (sin `innerHTML`/`eval`; nombre y colores validados; `reviewUrl` solo https), carga de logo (el Estudio recodifica en canvas y rechaza SVG), `sessionStorage` del Estudio (se consume una vez y se revalida), fuga entre negocios (consultas por id con `withTenant`; **nota**: la tabla `businesses` usa una política de RLS solo de rol de aplicación, el aislamiento depende de los filtros y de `withTenant`: mejora recomendada para producción), endpoints públicos (sin id ni secretos), redirecciones abiertas, Service Worker (no cachea `/api`), cookies (HttpOnly; admin Strict; protección CSRF).

## Pruebas relacionadas
Integración 86/86 (incluye bytes falsos de logo, SVG, acabado inválido, aislamiento entre negocios); E2E v04 35/35 (rutas públicas vs protegidas, Q1–Q4).
