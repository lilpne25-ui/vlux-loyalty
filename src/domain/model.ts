// VLUX Loyalty: modelo de dominio y motor de comandos.
// Todo cambio de estado pasa por execute(), igual que pasaría por una API en producción.
// En producción este archivo se divide: tipos compartidos (frontend/backend) y reglas en el servidor.

export type Actor = 'cliente' | 'empleado' | 'dueno' | 'sistema';

export interface Business {
  id: string;
  name: string;
  city: string;
  category: string;
  primary: string; // color principal de la marca del negocio
  accent: string; // acento (sellos, detalles)
  stampsRequired: number;
  rewardDescription: string;
  reviewUrl: string;
  reviewUrlIsExample: boolean;
}

export interface Customer {
  id: string;
  name: string;
  contact: string | null;
  contactType: 'whatsapp' | 'email' | null;
  marketingConsent: boolean;
  privacyNoticeVersion: string;
  createdAt: string;
  isSample: boolean;
}

export interface Card {
  id: string; // identificador visible y contenido del QR (no es un token seguro)
  customerId: string;
  businessId: string;
  stamps: number; // sellos acumulados en el ciclo actual (puede exceder la meta si hay premio pendiente)
  cycle: number;
  totalVisits: number;
  createdAt: string;
  lastOperationAt: string | null;
  lastStampAt: string | null;
  reviewPromptShownAt: string | null;
  reviewPromptDismissed: boolean;
  celebratedRewardId: string | null;
  isSample: boolean;
}

export interface Reward {
  id: string;
  code: string;
  cardId: string;
  cycle: number;
  stampsUsed: number;
  description: string;
  status: 'available' | 'redeemed';
  unlockedAt: string;
  redeemedAt: string | null;
  isSample: boolean;
}

export type OperationType =
  | 'card_created'
  | 'stamp'
  | 'reward_unlocked'
  | 'reward_redeemed'
  | 'review_prompt_shown'
  | 'review_link_opened'
  | 'settings_updated';

export interface Operation {
  id: string;
  type: OperationType;
  cardId: string | null;
  customerId: string | null;
  rewardId?: string | null;
  at: string;
  stamps: number;
  actor: Actor;
  testMode: boolean;
  isSample: boolean;
  note?: string;
}

export interface DemoRequest {
  id: string;
  businessName: string;
  category: string;
  contact: string;
  city: string;
  message: string;
  at: string;
}

export interface DemoFlags {
  visitedEmployee: boolean;
  sawNewStamp: boolean;
  ownerAfterRedeem: boolean;
}

export interface State {
  schemaVersion: 1;
  business: Business;
  customers: Customer[];
  cards: Card[];
  rewards: Reward[];
  operations: Operation[];
  myCardId: string | null;
  demoRequests: DemoRequest[];
  demo: DemoFlags;
}

export const STAMP_COOLDOWN_MS = 60_000;
export const PRIVACY_NOTICE_VERSION = 'demo-2026-10';
export const QR_PREFIX = 'VLUXLOYALTY:CARD:';

// ---------- Identificadores ----------
// Alfabeto sin caracteres ambiguos (0/O, 1/I/L) para dictarse en el mostrador.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function randomChars(n: number, rng?: () => number): string {
  let out = '';
  const bytes = new Uint8Array(n);
  if (!rng && typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  for (let i = 0; i < n; i++) {
    const v = rng ? Math.floor(rng() * 256) : bytes[i] || Math.floor(Math.random() * 256);
    out += ALPHABET[v % ALPHABET.length];
  }
  return out;
}

export const newCardId = (rng?: () => number) => `CDT-${randomChars(4, rng)}-${randomChars(4, rng)}`;
export const newRewardCode = (rng?: () => number) => `R-${randomChars(6, rng)}`;
export const newId = (prefix: string, rng?: () => number) => `${prefix}_${randomChars(10, rng)}`;

export function normalizeCardInput(raw: string): string {
  let s = raw.trim().toUpperCase();
  if (s.startsWith(QR_PREFIX)) s = s.slice(QR_PREFIX.length);
  s = s.replace(/\s+/g, '');
  // Permite escribir sin guiones: CDT7K3PQ9MX -> CDT-7K3P-Q9MX
  const bare = s.replace(/-/g, '');
  if (/^CDT[2-9A-Z]{8}$/.test(bare)) return `CDT-${bare.slice(3, 7)}-${bare.slice(7)}`;
  return s;
}

// ---------- Estado inicial ----------
export function defaultBusiness(): Business {
  return {
    id: 'biz_cafe_demo_toluca',
    name: 'Café Demo Toluca',
    city: 'Toluca, Estado de México',
    category: 'Cafetería de especialidad',
    primary: '#2B1B14',
    accent: '#C9A15B',
    stampsRequired: 8,
    rewardDescription: 'Una bebida de cortesía',
    reviewUrl: 'https://www.google.com/maps/search/?api=1&query=Cafe+Demo+Toluca',
    reviewUrlIsExample: true,
  };
}

export function emptyState(): State {
  return {
    schemaVersion: 1,
    business: defaultBusiness(),
    customers: [],
    cards: [],
    rewards: [],
    operations: [],
    myCardId: null,
    demoRequests: [],
    demo: { visitedEmployee: false, sawNewStamp: false, ownerAfterRedeem: false },
  };
}

// ---------- Comandos ----------
export type Command =
  | { type: 'createCustomer'; name: string; contact?: string; marketingConsent: boolean; setAsMine?: boolean; isSample?: boolean; at?: string; cardId?: string }
  | { type: 'addStamp'; cardId: string; testMode: boolean; actor?: Actor; at?: string; isSample?: boolean }
  | { type: 'redeemReward'; rewardId: string; at?: string; isSample?: boolean }
  | { type: 'updateSettings'; patch: Partial<Omit<Business, 'id'>> }
  | { type: 'markReviewPrompt'; cardId: string; at?: string; isSample?: boolean }
  | { type: 'dismissReviewPrompt'; cardId: string }
  | { type: 'reviewLinkOpened'; cardId: string }
  | { type: 'celebrate'; cardId: string; rewardId: string }
  | { type: 'setMyCard'; cardId: string | null }
  | { type: 'submitDemoRequest'; request: Omit<DemoRequest, 'id' | 'at'> }
  | { type: 'demoFlag'; flag: keyof DemoFlags };

export interface Result {
  ok: boolean;
  state: State;
  message?: string;
  data?: Record<string, unknown>;
}

const fail = (state: State, message: string): Result => ({ ok: false, state, message });

function op(partial: Omit<Operation, 'id' | 'testMode' | 'isSample' | 'stamps'> & Partial<Operation>, rng?: () => number): Operation {
  return { id: newId('op', rng), stamps: 0, testMode: false, isSample: false, ...partial };
}

export function contactTypeOf(contact: string): 'whatsapp' | 'email' | null {
  if (!contact) return null;
  if (contact.includes('@')) return 'email';
  return 'whatsapp';
}

export function validateContact(contact: string): string | null {
  const c = contact.trim();
  if (!c) return null;
  if (c.includes('@')) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c) ? null : 'Revisa el correo electrónico.';
  const digits = c.replace(/\D/g, '');
  return digits.length === 10 || (digits.length === 12 && digits.startsWith('52')) ? null : 'El WhatsApp debe tener 10 dígitos.';
}

/** Desbloquea premios cuando una tarjeta alcanza la meta. Se ejecuta tras cada comando. */
function reconcile(state: State, at: string, rng?: () => number): State {
  const required = state.business.stampsRequired;
  let rewards = state.rewards;
  let operations = state.operations;
  for (const card of state.cards) {
    const pending = rewards.some((r) => r.cardId === card.id && r.status === 'available');
    if (!pending && card.stamps >= required) {
      const reward: Reward = {
        id: newId('rw', rng),
        code: newRewardCode(rng),
        cardId: card.id,
        cycle: card.cycle,
        stampsUsed: required,
        description: state.business.rewardDescription,
        status: 'available',
        unlockedAt: at,
        redeemedAt: null,
        isSample: card.isSample,
      };
      rewards = [...rewards, reward];
      operations = [
        ...operations,
        op({ type: 'reward_unlocked', cardId: card.id, customerId: card.customerId, rewardId: reward.id, at, actor: 'sistema', isSample: card.isSample }, rng),
      ];
    }
  }
  return rewards === state.rewards ? state : { ...state, rewards, operations };
}

export function execute(state: State, cmd: Command, rng?: () => number): Result {
  const now = ('at' in cmd && cmd.at) || new Date().toISOString();
  switch (cmd.type) {
    case 'createCustomer': {
      const name = cmd.name.trim().replace(/\s+/g, ' ');
      if (name.length < 2) return fail(state, 'Escribe tu nombre (mínimo 2 letras).');
      if (name.length > 40) return fail(state, 'El nombre es demasiado largo.');
      const contact = (cmd.contact || '').trim();
      const contactError = validateContact(contact);
      if (contactError) return fail(state, contactError);
      const customer: Customer = {
        id: newId('cus', rng),
        name,
        contact: contact || null,
        contactType: contactTypeOf(contact),
        marketingConsent: !!contact && cmd.marketingConsent,
        privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
        createdAt: now,
        isSample: !!cmd.isSample,
      };
      let cardId = cmd.cardId || newCardId(rng);
      while (state.cards.some((c) => c.id === cardId)) cardId = newCardId(rng);
      const card: Card = {
        id: cardId,
        customerId: customer.id,
        businessId: state.business.id,
        stamps: 0,
        cycle: 1,
        totalVisits: 0,
        createdAt: now,
        lastOperationAt: now,
        lastStampAt: null,
        reviewPromptShownAt: null,
        reviewPromptDismissed: false,
        celebratedRewardId: null,
        isSample: !!cmd.isSample,
      };
      const next: State = {
        ...state,
        customers: [...state.customers, customer],
        cards: [...state.cards, card],
        operations: [...state.operations, op({ type: 'card_created', cardId, customerId: customer.id, at: now, actor: 'cliente', isSample: !!cmd.isSample }, rng)],
        myCardId: cmd.setAsMine ? cardId : state.myCardId,
      };
      return { ok: true, state: next, data: { cardId, customerId: customer.id } };
    }

    case 'addStamp': {
      const card = state.cards.find((c) => c.id === cmd.cardId);
      if (!card) return fail(state, 'No encontramos esa tarjeta.');
      if (!cmd.testMode && card.lastStampAt) {
        const elapsed = Date.parse(now) - Date.parse(card.lastStampAt);
        if (elapsed >= 0 && elapsed < STAMP_COOLDOWN_MS) {
          const secs = Math.ceil((STAMP_COOLDOWN_MS - elapsed) / 1000);
          return fail(state, `Esta tarjeta ya recibió un sello hace unos segundos. Para evitar duplicados, espera ${secs} s o usa el modo de prueba.`);
        }
      }
      const updated: Card = { ...card, stamps: card.stamps + 1, totalVisits: card.totalVisits + 1, lastStampAt: now, lastOperationAt: now };
      let next: State = {
        ...state,
        cards: state.cards.map((c) => (c.id === card.id ? updated : c)),
        operations: [
          ...state.operations,
          op({ type: 'stamp', cardId: card.id, customerId: card.customerId, at: now, stamps: 1, actor: cmd.actor || 'empleado', testMode: cmd.testMode, isSample: !!cmd.isSample || card.isSample }, rng),
        ],
      };
      next = reconcile(next, now, rng);
      const unlocked = next.rewards.length > state.rewards.length;
      return { ok: true, state: next, data: { unlocked } };
    }

    case 'redeemReward': {
      const reward = state.rewards.find((r) => r.id === cmd.rewardId);
      if (!reward) return fail(state, 'Esa recompensa no existe.');
      if (reward.status === 'redeemed') return fail(state, `Esta recompensa ya fue canjeada${reward.redeemedAt ? ' el ' + formatDateTime(reward.redeemedAt) : ''}. No puede usarse otra vez.`);
      const card = state.cards.find((c) => c.id === reward.cardId)!;
      const updatedCard: Card = { ...card, stamps: Math.max(0, card.stamps - reward.stampsUsed), cycle: card.cycle + 1, lastOperationAt: now };
      let next: State = {
        ...state,
        rewards: state.rewards.map((r) => (r.id === reward.id ? { ...r, status: 'redeemed', redeemedAt: now } : r)),
        cards: state.cards.map((c) => (c.id === card.id ? updatedCard : c)),
        operations: [
          ...state.operations,
          op({ type: 'reward_redeemed', cardId: card.id, customerId: card.customerId, rewardId: reward.id, at: now, actor: 'empleado', isSample: !!cmd.isSample || card.isSample }, rng),
        ],
      };
      next = reconcile(next, now, rng);
      return { ok: true, state: next };
    }

    case 'updateSettings': {
      const patch = { ...cmd.patch };
      if (patch.name !== undefined) {
        patch.name = patch.name.trim();
        if (patch.name.length < 2) return fail(state, 'El nombre comercial es obligatorio.');
      }
      if (patch.stampsRequired !== undefined) {
        const n = Math.round(Number(patch.stampsRequired));
        if (!Number.isFinite(n) || n < 3 || n > 15) return fail(state, 'Los sellos necesarios deben estar entre 3 y 15.');
        patch.stampsRequired = n;
      }
      if (patch.rewardDescription !== undefined) {
        patch.rewardDescription = patch.rewardDescription.trim();
        if (patch.rewardDescription.length < 3) return fail(state, 'Describe la recompensa.');
      }
      if (patch.reviewUrl !== undefined) {
        const u = patch.reviewUrl.trim();
        if (!/^https:\/\/[^\s]+$/.test(u)) return fail(state, 'El enlace de reseñas debe empezar con https://');
        patch.reviewUrl = u;
        if (u !== state.business.reviewUrl) patch.reviewUrlIsExample = false;
      }
      for (const key of ['primary', 'accent'] as const) {
        if (patch[key] !== undefined && !/^#[0-9a-fA-F]{6}$/.test(patch[key]!)) return fail(state, 'Usa colores en formato #RRGGBB.');
      }
      const changed = (Object.keys(patch) as (keyof Business)[]).filter((k) => patch[k as keyof typeof patch] !== state.business[k]);
      if (!changed.length) return { ok: true, state, message: 'Sin cambios.' };
      const labels: Record<string, string> = { name: 'nombre', primary: 'color principal', accent: 'color de acento', stampsRequired: 'sellos necesarios', rewardDescription: 'recompensa', reviewUrl: 'enlace de reseñas', reviewUrlIsExample: '' };
      let next: State = {
        ...state,
        business: { ...state.business, ...patch },
        operations: [
          ...state.operations,
          op({ type: 'settings_updated', cardId: null, customerId: null, at: now, actor: 'dueno', note: changed.map((k) => labels[k]).filter(Boolean).join(', ') }, rng),
        ],
      };
      next = reconcile(next, now, rng);
      return { ok: true, state: next };
    }

    case 'markReviewPrompt': {
      const card = state.cards.find((c) => c.id === cmd.cardId);
      if (!card || card.reviewPromptShownAt) return { ok: true, state };
      return {
        ok: true,
        state: {
          ...state,
          cards: state.cards.map((c) => (c.id === card.id ? { ...c, reviewPromptShownAt: now } : c)),
          operations: [...state.operations, op({ type: 'review_prompt_shown', cardId: card.id, customerId: card.customerId, at: now, actor: 'sistema', isSample: !!cmd.isSample || card.isSample }, rng)],
        },
      };
    }

    case 'dismissReviewPrompt':
      return { ok: true, state: { ...state, cards: state.cards.map((c) => (c.id === cmd.cardId ? { ...c, reviewPromptDismissed: true } : c)) } };

    case 'reviewLinkOpened': {
      const card = state.cards.find((c) => c.id === cmd.cardId);
      if (!card) return { ok: true, state };
      return { ok: true, state: { ...state, operations: [...state.operations, op({ type: 'review_link_opened', cardId: card.id, customerId: card.customerId, at: now, actor: 'cliente' }, rng)] } };
    }

    case 'celebrate':
      return { ok: true, state: { ...state, cards: state.cards.map((c) => (c.id === cmd.cardId ? { ...c, celebratedRewardId: cmd.rewardId } : c)) } };

    case 'setMyCard':
      return { ok: true, state: { ...state, myCardId: cmd.cardId } };

    case 'submitDemoRequest': {
      const r = cmd.request;
      if (r.businessName.trim().length < 2) return fail(state, 'Escribe el nombre de tu negocio.');
      if (r.contact.trim().length < 5) return fail(state, 'Déjanos un WhatsApp o correo para contactarte.');
      return { ok: true, state: { ...state, demoRequests: [...state.demoRequests, { ...r, id: newId('dr', rng), at: now }] } };
    }

    case 'demoFlag':
      if (state.demo[cmd.flag]) return { ok: true, state };
      return { ok: true, state: { ...state, demo: { ...state.demo, [cmd.flag]: true } } };
  }
}

// ---------- Selectores ----------
export const customerOf = (s: State, card: Card) => s.customers.find((c) => c.id === card.customerId)!;
export const availableRewardOf = (s: State, cardId: string) => s.rewards.find((r) => r.cardId === cardId && r.status === 'available') || null;
export const redeemedRewardsOf = (s: State, cardId: string) => s.rewards.filter((r) => r.cardId === cardId && r.status === 'redeemed');
export const opsOf = (s: State, cardId: string) => s.operations.filter((o) => o.cardId === cardId);

export function progressOf(s: State, card: Card) {
  const required = s.business.stampsRequired;
  const reward = availableRewardOf(s, card.id);
  const goal = reward ? reward.stampsUsed : required;
  const shown = Math.min(card.stamps, goal);
  const extra = reward ? Math.max(0, card.stamps - reward.stampsUsed) : 0;
  return { required: goal, shown, remaining: Math.max(0, goal - card.stamps), reward, extra };
}

export interface Metrics {
  customers: number;
  visits: number;
  recurring: number;
  redeemed: number;
  stamps: number;
  reviewPrompts: number;
  reviewClicks: number;
  activeRewards: number;
  newCustomers7d: number;
}

export function metrics(s: State, includeSample: boolean): Metrics {
  const ops = s.operations.filter((o) => includeSample || !o.isSample);
  const customers = s.customers.filter((c) => includeSample || !c.isSample);
  const stampOps = ops.filter((o) => o.type === 'stamp');
  const visitsByCustomer = new Map<string, number>();
  stampOps.forEach((o) => visitsByCustomer.set(o.customerId!, (visitsByCustomer.get(o.customerId!) || 0) + 1));
  const weekAgo = Date.now() - 7 * 864e5;
  return {
    customers: customers.length,
    visits: stampOps.length,
    recurring: [...visitsByCustomer.values()].filter((n) => n >= 2).length,
    redeemed: ops.filter((o) => o.type === 'reward_redeemed').length,
    stamps: stampOps.reduce((a, o) => a + o.stamps, 0),
    reviewPrompts: ops.filter((o) => o.type === 'review_prompt_shown').length,
    reviewClicks: ops.filter((o) => o.type === 'review_link_opened').length,
    activeRewards: s.rewards.filter((r) => r.status === 'available' && (includeSample || !r.isSample)).length,
    newCustomers7d: customers.filter((c) => Date.parse(c.createdAt) >= weekAgo).length,
  };
}

export function visitsByDay(s: State, days: number, includeSample: boolean) {
  const out: { date: Date; label: string; live: number; sample: number }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 864e5);
    out.push({ date: d, label: d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }), live: 0, sample: 0 });
  }
  for (const o of s.operations) {
    if (o.type !== 'stamp') continue;
    if (o.isSample && !includeSample) continue;
    const d = new Date(o.at);
    d.setHours(0, 0, 0, 0);
    const idx = Math.round((d.getTime() - out[0].date.getTime()) / 864e5);
    if (idx >= 0 && idx < out.length) out[idx][o.isSample ? 'sample' : 'live']++;
  }
  return out;
}

export function recurrenceBuckets(s: State, includeSample: boolean) {
  const required = s.business.stampsRequired;
  const counts = new Map<string, number>();
  s.operations.forEach((o) => {
    if (o.type === 'stamp' && (includeSample || !o.isSample)) counts.set(o.customerId!, (counts.get(o.customerId!) || 0) + 1);
  });
  const custs = s.customers.filter((c) => includeSample || !c.isSample);
  const buckets = [
    { label: 'Sin visitas aún', test: (n: number) => n === 0 },
    { label: '1 visita', test: (n: number) => n === 1 },
    { label: '2 a 3 visitas', test: (n: number) => n >= 2 && n <= 3 },
    { label: `4 a ${required - 1} visitas`, test: (n: number) => n >= 4 && n < required },
    { label: `${required} o más`, test: (n: number) => n >= required },
  ];
  return buckets.map((b) => ({ label: b.label, value: custs.filter((c) => b.test(counts.get(c.id) || 0)).length }));
}

// ---------- Formato ----------
export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function relativeTime(iso: string | null) {
  if (!iso) return 'Sin operaciones';
  const diff = Date.now() - Date.parse(iso);
  const m = Math.round(diff / 60000);
  if (m < 1) return 'Hace un momento';
  if (m < 60) return `Hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `Hace ${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return 'Ayer';
  if (d < 30) return `Hace ${d} días`;
  return formatDateTime(iso);
}

export const OP_LABELS: Record<OperationType, string> = {
  card_created: 'Tarjeta creada',
  stamp: 'Visita y sello',
  reward_unlocked: 'Recompensa desbloqueada',
  reward_redeemed: 'Recompensa canjeada',
  review_prompt_shown: 'Invitación a reseña mostrada',
  review_link_opened: 'Abrió enlace de reseña',
  settings_updated: 'Programa actualizado',
};
