// Versión de la aplicación y del esquema esperado. tests/unit/version.test.ts verifica que coincidan con
// package.json y con la última migración de db/migrations (evita que el Control Center muestre datos viejos).
export const APP_VERSION = '1.0.0-rc.1';
export const SCHEMA_VERSION = '0016_tenant_isolation';
