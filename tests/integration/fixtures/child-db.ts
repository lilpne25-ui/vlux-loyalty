// Proceso hijo para probar fallas de conexión y el control del rol de BD con otra configuración.
import { withTx, closePool } from '../../../server/db';
const t0 = Date.now();
try {
  await withTx((tx) => tx.query('SELECT 1'));
  console.log(JSON.stringify({ ok: true }));
} catch (e) {
  const err = e as { code?: string; message?: string };
  console.log(JSON.stringify({ ok: false, code: err.code ?? null, message: err.message, ms: Date.now() - t0 }));
} finally {
  await closePool().catch(() => {});
}
