// Datos de ejemplo. Se generan pasando por el mismo motor de comandos (execute),
// así las métricas del dueño siempre cuadran con las tarjetas. Todo queda marcado isSample.
import { emptyState, execute, availableRewardOf, State } from './model';

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SAMPLE = [
  { name: 'Ana Lucía M.', visits: 11, redeem: true, daysAgo: 24, contact: true },
  { name: 'Diego R.', visits: 8, redeem: false, daysAgo: 20, contact: true },
  { name: 'Fernanda S.', visits: 6, redeem: false, daysAgo: 19, contact: false },
  { name: 'Jorge P.', visits: 4, redeem: false, daysAgo: 16, contact: true },
  { name: 'Valeria C.', visits: 3, redeem: false, daysAgo: 12, contact: false },
  { name: 'Rodrigo T.', visits: 2, redeem: false, daysAgo: 9, contact: true },
  { name: 'Paola G.', visits: 2, redeem: false, daysAgo: 7, contact: false },
  { name: 'Emilio V.', visits: 1, redeem: false, daysAgo: 5, contact: false },
  { name: 'Sofía H.', visits: 1, redeem: false, daysAgo: 3, contact: true },
  { name: 'Andrés L.', visits: 0, redeem: false, daysAgo: 1, contact: false },
];

export function seedState(now = Date.now()): State {
  const rng = mulberry32(20261030);
  let s = emptyState();
  type Ev = { at: number; run: (st: State) => State };
  const events: Ev[] = [];

  SAMPLE.forEach((p, i) => {
    const reg = now - p.daysAgo * 864e5 - (2 + rng() * 6) * 36e5;
    const cardIdHolder: { id?: string } = {};
    events.push({
      at: reg,
      run: (st) => {
        const r = execute(st, { type: 'createCustomer', name: p.name, contact: p.contact ? `ejemplo${i + 1}@correo.demo` : '', marketingConsent: p.contact && rng() > 0.4, isSample: true, at: new Date(reg).toISOString() }, rng);
        cardIdHolder.id = r.data!.cardId as string;
        return r.state;
      },
    });
    const span = now - 2 * 36e5 - reg;
    for (let v = 0; v < p.visits; v++) {
      const base = reg + (span * (v + 0.5)) / Math.max(p.visits, 1);
      const d = new Date(base + (rng() - 0.5) * 6 * 36e5);
      const hour = 8 + Math.floor(rng() * 11);
      d.setHours(hour, Math.floor(rng() * 60), 0, 0);
      const at = Math.min(Math.max(d.getTime(), reg + 36e5), now - 36e5);
      events.push({
        at,
        run: (st) => {
          const id = cardIdHolder.id!;
          // Si el cliente decide canjear, lo hace en su siguiente visita, antes del nuevo sello.
          const pending = availableRewardOf(st, id);
          if (pending && p.redeem) st = execute(st, { type: 'redeemReward', rewardId: pending.id, at: new Date(at - 60000).toISOString(), isSample: true }, rng).state;
          st = execute(st, { type: 'addStamp', cardId: id, testMode: false, at: new Date(at).toISOString(), isSample: true }, rng).state;
          const card = st.cards.find((c) => c.id === id)!;
          if (card.totalVisits >= 2 && !card.reviewPromptShownAt) st = execute(st, { type: 'markReviewPrompt', cardId: id, at: new Date(at + 30000).toISOString(), isSample: true }, rng).state;
          return st;
        },
      });
    }
  });

  events.sort((a, b) => a.at - b.at).forEach((e) => (s = e.run(s)));
  // Las tarjetas de ejemplo ya "vieron" sus premios; no deben disparar la animación.
  s = { ...s, cards: s.cards.map((c) => ({ ...c, celebratedRewardId: availableRewardOf(s, c.id)?.id ?? null })) };
  return s;
}
