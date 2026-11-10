// V0.4.5 · Datos sintéticos para la prueba de carga. SOLO contra una BD local (se niega a correr contra otra).
// Uso: node --env-file=.env.load --import tsx scripts/load/seed.ts <negocios> <clientes_por_negocio> <salida.json>
import fs from 'node:fs';
import { createBusiness } from '../../server/services/businesses';
import { registerCustomer } from '../../server/services/customers';
import { login } from '../../server/services/auth';
import { getPool } from '../../server/db';

const url = process.env.DATABASE_URL || '';
if (!/@(127\.0\.0\.1|localhost)[:/]/.test(url) || !/vlux_load/.test(url)) {
  console.error('Rechazado: la prueba de carga solo se siembra en la BD local vlux_load.');
  process.exit(1);
}
const [nBiz, perBiz, out] = [Number(process.argv[2] ?? 10), Number(process.argv[3] ?? 300), process.argv[4] ?? 'load-fixture.json'];
const PASSWORD = `carga-local-${Date.now()}`;
const run = Date.now().toString(36);
const fixture: { slug: string; ownerToken: string; cards: { id: string; token: string }[] }[] = [];
const types = ['stamps_purchase', 'stamps_visit', 'points'] as const;

async function main() {
  const t0 = Date.now();
  for (let b = 0; b < nBiz; b++) {
    const slug = `carga-${run}-${b}`;
    const programType = types[b % types.length];
    await createBusiness({
      slug, name: `Carga ${b}`, city: 'Local', vertical: 'otro', isDemo: true,
      rules: programType === 'points'
        ? { programType, stampsRequired: 500, stampMode: 'per_purchase', maxStampsPerPurchase: 500, visitWindowMinutes: 15, rewardDescription: 'Beneficio sintético', amountPerPointCents: 1000 }
        : { programType, stampsRequired: 8, stampMode: 'per_purchase', maxStampsPerPurchase: 1, visitWindowMinutes: 15, rewardDescription: 'Beneficio sintético' },
      owner: { email: `dueno-${slug}@carga.vlux.invalid`, displayName: 'Dueño sintético', password: PASSWORD },
    } as never);
    const r = await login(`dueno-${slug}@carga.vlux.invalid`, PASSWORD, slug);
    if (r.kind === 'choose') throw new Error('sesión ambigua');
    const cards: { id: string; token: string }[] = [];
    const batch = 20;
    for (let i = 0; i < perBiz; i += batch) {
      const rs = await Promise.all(Array.from({ length: Math.min(batch, perBiz - i) }, (_, k) =>
        registerCustomer(slug, { displayName: `Cliente ${i + k}`, contact: '', marketingConsent: false, privacyAccepted: true })));
      for (const x of rs) cards.push({ id: x.cardId, token: x.token });
    }
    fixture.push({ slug, ownerToken: r.token, cards });
    if ((b + 1) % 10 === 0) console.log(`${b + 1}/${nBiz} negocios (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
  fs.writeFileSync(out, JSON.stringify({ programTypes: types, businesses: fixture }));
  console.log(`listo: ${nBiz} negocios × ${perBiz} clientes → ${out}`);
  await getPool().end();
}
main().catch((e) => { console.error(e); process.exit(1); });
