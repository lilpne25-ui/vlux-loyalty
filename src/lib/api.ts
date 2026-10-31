// Cliente HTTP de la API. Las cookies de sesión son HttpOnly: el navegador las envía solo.
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: Record<string, unknown>) {
    super(message);
  }
}

export async function api<T = any>(method: 'GET' | 'POST' | 'PUT' | 'PATCH', path: string, body?: unknown): Promise<T> {
  // Toda mutación viaja como JSON (el servidor rechaza otras: protección CSRF).
  if (method !== 'GET' && body === undefined) body = {};
  let res: Response;
  try {
    res = await fetch('/api' + path, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network', 'Sin conexión. Revisa tu internet e intenta de nuevo.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = data?.error;
    throw new ApiError(res.status, e?.code || 'error', e?.message || 'Ocurrió un error. Intenta de nuevo.', e?.details);
  }
  return data as T;
}

export const newIdempotencyKey = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2)).replace(/-/g, '');

// ---------- Tipos de respuesta ----------
export interface Program { stampsRequired: number; stampMode: 'per_purchase' | 'per_item'; maxStampsPerPurchase: number; visitWindowMinutes?: number; rewardDescription: string }
export interface BusinessInfo { slug: string; name: string; city: string; vertical: Vertical; primaryColor: string; accentColor: string; reviewUrl?: string | null; isDemo: boolean }
export type Vertical = 'cafeteria' | 'barberia' | 'salon' | 'restaurante' | 'otro';
export interface RewardInfo { id?: string; code: string; description: string; stampsCost: number; unlockedAt: string }
export interface HistoryItem { kind: 'card_created' | 'purchase' | 'reward_unlocked' | 'reward_redeemed'; at: string; stamps: number; items?: number; customerName?: string; publicCode?: string; staffName?: string | null }
export interface CustomerCardView {
  business: BusinessInfo;
  program: Program;
  card: { publicCode: string; customerName: string; balance: number; cycle: number; createdAt: string; visits: number; redeemed: number; reward: RewardInfo | null };
  history: HistoryItem[];
  review: { show: boolean; alreadyShown: boolean };
}
export interface StaffCard {
  id: string; publicCode: string; customerName: string; balance: number; cycle: number; status: string; createdAt: string;
  lastVisitAt: string | null; lastPurchaseAt: string | null; visits: number; purchases: number; redeemed: number; reward: (RewardInfo & { id: string }) | null;
}
export interface StaffSessionInfo { userId: string; email: string; displayName: string; role: 'OWNER' | 'EMPLOYEE'; business: { id: string; slug: string; name: string } }
