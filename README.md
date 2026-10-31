# VLUX Loyalty V0.1 (prototipo)

Prototipo interactivo: tarjeta de sellos digital con vistas de cliente, empleado y dueño, estado compartido y localStorage.

## Estructura
- `src/domain/model.ts`: tipos, motor de comandos (`execute`) y selectores/métricas. Base para la API real.
- `src/domain/seed.ts`: datos de ejemplo generados con el mismo motor (marcados `isSample`).
- `src/lib/store.ts`: estado compartido + persistencia local (se reemplaza por cliente HTTP).
- `src/lib/qr.ts`: generación de QR (qrcode-generator) y lectura desde foto (jsQR).
- `src/components/`: UI base y tarjeta de sellos reutilizable.
- `src/views/`: Customer, Employee, Owner, ForBusiness.

## Construir
```
npm i esbuild@0.21.5 tailwindcss@3.4.17 react@18.3.1 react-dom@18.3.1 qrcode-generator@1.4.4 jsqr@1.4.0 lucide-react@0.447.0
node build.mjs   # genera dist/index.html autocontenido
```
`test.cjs` recorre los 10 escenarios de aceptación con Playwright (sirve `dist/` en el puerto 8765).
