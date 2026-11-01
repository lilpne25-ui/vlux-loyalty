# V0.4.3 · Auditoría de seguridad del Intelligent Logo Engine

| Control | Estado | Evidencia |
|---|---|---|
| Tipo real del archivo (no la extensión) | Servidor valida firma de bytes PNG/JPEG/WebP; SVG rechazado | `server/image-check.ts`, test v03 "logotipo: el servidor valida los bytes reales" |
| Original conservado también se valida | Mismo esquema que el logo | test "el original conservado también valida bytes reales" |
| Tamaño | ≤5 MB de entrada, ≤256 px, ≤90 000 caracteres almacenados; CHECK en BD (0009) | `src/admin/logo.ts`, migración 0009 |
| Imagen corrupta / falsa | Mensaje claro, sin colgarse | E2E V0.4.2 T15b |
| Memoria / tiempo | Decodificación con límite de 10 s; análisis rechaza >1 MP; quitar fondo rechaza >4 MP | `logoEngine.ts`, `logoFit.ts` (ajustado tras revisión) |
| SVG | No se acepta como logo subido. Los SVG candidatos de VLUX están fuera de la app y sin contenido activo | `tests/unit/vector.test.ts` |
| Ajuste (`logo_fit`) | Se sanea en servidor (`sanitizeFit`); basura → null; ≤600 caracteres por CHECK | tests T21/T22 |
| Aislamiento entre negocios | Escritura solo con `withTenant` (RLS 0008). La API pública NO expone el original | test T21 |
| Original recuperable | `logo_original_data_url` guarda la versión previa a "quitar fondo"; se borra si se quita el logo | test T22 |
| Procesamiento | Todo en el navegador; la demo pública no envía nada al servidor | E2E: `apiCalls.length === 0` (V0.4.2) |

## Riesgos residuales (honestos)
- La política `businesses_select USING (true)` (V0.4.2) permite leer todas las columnas al rol de la app; el original queda protegido por no estar en ninguna consulta pública, no por RLS. Una consulta futura con `SELECT *` lo expondría. Recomendación: vista pública con columnas explícitas antes del piloto.
- El servidor no compara `iw/ih` del ajuste contra la imagen real: solo lo escribe un administrador autenticado; el efecto máximo es un logo mal colocado.
- Pendientes heredados de V0.4.2: respaldos (BLOCKED), pruebas en teléfonos físicos (NO PROBADO), revisión legal, entorno de producción separado.
