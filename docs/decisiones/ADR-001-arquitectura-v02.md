# ADR-001 · Arquitectura de VLUX Loyalty V0.2

Fecha: 2026-10-31 · Estado: aceptada para V0.2

## Contexto
V0.1 es un SPA React + TypeScript + Tailwind compilado con esbuild a un HTML autocontenido. Todo el estado vive en `localStorage` y las tres "vistas" (cliente, empleado, dueño) se cambian con botones. El motor de reglas (`execute`) es puro y está bien separado. Hay que pasar a un MVP multiempresa con backend, sin reconstruir el frontend y con un costo compatible con una hipótesis de ~299 MXN/mes por negocio.

## Decisión
1. **Frontend:** se conserva React 18 + TypeScript + Tailwind 3 y los mismos componentes. Solo se cambia el empaquetador a **Vite** (dev server, build con hashes, proxy a la API). No se migra a Next.js: no aporta nada que el MVP necesite y obligaría a reescribir rutas y vistas.
2. **Backend:** un solo servicio **Node 22 + Hono** (API JSON) que también sirve el frontend compilado. Un único despliegue para todos los negocios (multiempresa lógico, sin servidores por cliente ni microservicios).
3. **Base de datos:** **PostgreSQL 16**, migraciones SQL versionadas con su reversa (`db/migrations/*.up.sql` / `*.down.sql`). Aislamiento por `business_id` en la aplicación **y** en la base de datos con Row Level Security (la app se conecta con un rol sin `BYPASSRLS`).
4. **Autenticación propia y mínima:**
   - Dueño y empleado: correo + contraseña (scrypt de `node:crypto`), sesión opaca en cookie `HttpOnly` con hash SHA-256 en BD, expiración y revocación.
   - Cliente: sin contraseña. Al registrarse recibe un **token de acceso de 256 bits** (solo su hash vive en BD) en cookie `HttpOnly` y un enlace personal para abrir su tarjeta en otro teléfono.
   - Roles validados en el servidor en cada endpoint. La interfaz ya no permite "cambiar de perspectiva".
5. **Sincronización:** consulta periódica (polling 3 a 10 s) y al volver el foco a la pestaña. Sin WebSockets: cumple el escenario de tres dispositivos con menos piezas y funciona en cualquier hosting.
6. **QR:** identificadores opacos aleatorios. El QR de la tarjeta solo identifica; toda operación exige sesión de empleado. Lectura con cámara en vivo (`getUserMedia` + jsQR, ya dependencia de V0.1), respaldo por foto e ID manual.

## Por qué no Supabase como backend principal (por ahora)
Supabase sigue siendo una opción válida **como proveedor de PostgreSQL administrado** (el esquema es Postgres estándar y funciona tal cual ahí, igual que en Neon o Render). No se adopta Supabase Auth + RLS-desde-el-navegador porque: (a) mover las reglas de sellos/canjes a funciones SQL o Edge Functions las fragmenta; (b) en este entorno no hay proyecto ni credenciales, y la API propia se puede probar completa con Postgres local; (c) evita dependencia de proveedor en el piloto. Revisar en V0.3 si conviene Supabase Auth para recuperación por correo/WhatsApp.

## Costos estimados (no verificados con cotización; revisar antes del piloto)
- App Node pequeña (Render / Railway / Fly / Vercel con adaptador Node): del orden de 0 a 10 USD/mes para el piloto.
- PostgreSQL administrado: plan gratuito o de entrada (Neon, Supabase) para el piloto.
Un despliegue atiende a todos los negocios, así que el costo marginal por negocio es muy bajo.

## Consecuencias
- La autenticación propia es superficie de riesgo: se compensa con primitivas estándar, pruebas y un informe de seguridad.
- El rate limiting en memoria solo es válido con una instancia; con varias se debe mover a BD o a un servicio externo.
- Una sucursal por negocio en V0.2 (la tabla `branches` se pospone: ningún flujo actual la necesita).
