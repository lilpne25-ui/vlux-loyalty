// Proceso hijo = "otra instancia" (otra Function). Comparte solo la base de datos con el proceso de prueba.
import { rateLimit } from '../../../server/ratelimit';
import { closePool } from '../../../server/db';
const [key, times] = [process.argv[2], Number(process.argv[3])];
let blocked = 0;
for (let i = 0; i < times; i++) {
  try { await rateLimit(key, 5, 60_000); } catch { blocked++; }
}
await closePool();
console.log(JSON.stringify({ blocked }));
