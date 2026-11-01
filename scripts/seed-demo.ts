// Crea los negocios de demostración del piloto (datos sintéticos, sin personas reales):
//   - Café Demo Toluca: 8 sellos = bebida de cortesía (1 sello por compra).
//   - Barbería Demo Metepec: 6 sellos = corte de cortesía (verifica que nada esté amarrado a cafeterías).
// Uso: DEMO_PASSWORD='...' npm run db:seed:demo   (idempotente: si el negocio existe, lo omite)
import { createBusiness } from '../server/services/businesses';
import { getPool, closePool, withTenant } from '../server/db';

const password = process.env.DEMO_PASSWORD;
if (!password || password.length < 10) {
  console.error('Define DEMO_PASSWORD (mínimo 10 caracteres). No se usan contraseñas fijas en el código.');
  process.exit(1);
}

// V0.4.2: negocio sintético NEUTRO de VLUX para la demostración pública (sin giro de cafetería). Sus cuentas
// (@demo.vlux.invalid) usan una contraseña aleatoria que se descarta: solo se entra por /api/public/demo/session.
const { randomBytes } = await import('node:crypto');
const demos = [
  {
    slug: 'vlux-demo', name: 'VLUX Demo', city: 'Demostración', vertical: 'otro' as const,
    primaryColor: '#14171C', accentColor: '#67C7D3', reviewUrl: null, cardFinish: 'silver',
    rules: { stampsRequired: 6, stampMode: 'per_purchase' as const, maxStampsPerPurchase: 1, visitWindowMinutes: 30, rewardDescription: 'Un beneficio de cortesía' },
    owner: { email: 'dueno@demo.vlux.invalid', displayName: 'Dueño de demostración' },
    employee: { email: 'caja@demo.vlux.invalid', displayName: 'Caja de demostración' },
    randomPassword: true,
  },
  {
    slug: 'cafe-demo-toluca', name: 'Café Demo Toluca', city: 'Toluca, Estado de México', vertical: 'cafeteria' as const,
    primaryColor: '#2B1B14', accentColor: '#C9A15B', reviewUrl: 'https://www.google.com/maps/search/?api=1&query=Cafe+Demo+Toluca',
    rules: { stampsRequired: 8, stampMode: 'per_purchase' as const, maxStampsPerPurchase: 1, visitWindowMinutes: 120, rewardDescription: 'Una bebida de cortesía' },
    owner: { email: 'dueno@cafe-demo.vlux.test', displayName: 'Dueña Demo Café' },
    employee: { email: 'caja@cafe-demo.vlux.test', displayName: 'Barista Demo' },
  },
  {
    slug: 'barberia-demo-metepec', name: 'Barbería Demo Metepec', city: 'Metepec, Estado de México', vertical: 'barberia' as const,
    primaryColor: '#14171C', accentColor: '#B9C0C9', reviewUrl: null,
    rules: { stampsRequired: 6, stampMode: 'per_purchase' as const, maxStampsPerPurchase: 1, visitWindowMinutes: 240, rewardDescription: 'Un corte de cortesía' },
    owner: { email: 'dueno@barberia-demo.vlux.test', displayName: 'Dueño Demo Barbería' },
    employee: { email: 'caja@barberia-demo.vlux.test', displayName: 'Barbero Demo' },
  },
];

const { hashPassword } = await import('../server/security');
for (const d of demos) {
  const exists = (await getPool().query('SELECT id FROM businesses WHERE slug = $1', [d.slug])).rows[0];
  if (exists) { console.log(`ya existe: ${d.slug}`); continue; }
  const { employee, ...rest } = d as typeof d & { randomPassword?: boolean; cardFinish?: string };
  const { randomPassword, cardFinish, ...input } = rest as any;
  const pw = randomPassword ? randomBytes(24).toString('base64url') : password;
  const r = await createBusiness({ ...input, isDemo: true, owner: { ...d.owner, password: pw } });
  if (cardFinish) await withTenant(r.businessId, (tx) => tx.query('UPDATE businesses SET card_finish = $2 WHERE id = $1', [r.businessId, cardFinish]));
  const hash = await hashPassword(pw);
  const userId = (await getPool().query('INSERT INTO staff_users (email, password_hash, display_name) VALUES ($1, $2, $3) ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING id', [employee.email, hash, employee.displayName])).rows[0].id;
  await getPool().query("INSERT INTO staff_memberships (business_id, user_id, role) VALUES ($1, $2, 'EMPLOYEE') ON CONFLICT DO NOTHING", [r.businessId, userId]);
  console.log(`creado: ${d.name} → /n/${d.slug} · dueño ${d.owner.email} · caja ${employee.email}`);
}
await closePool();
