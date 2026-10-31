// Esquemas de entrada (zod). Toda entrada externa se valida aquí antes de tocar la BD.
import { z } from 'zod';
import { LIMITS } from '../shared/rules';

const trimmed = (min: number, max: number) => z.string().trim().min(min).max(max);
const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Usa colores en formato #RRGGBB.');
export const verticals = ['cafeteria', 'barberia', 'salon', 'restaurante', 'otro'] as const;

export const slugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/, 'Identificador de negocio inválido.');
export const uuidSchema = z.uuid();
export const passwordSchema = z.string().min(10, 'La contraseña debe tener al menos 10 caracteres.').max(200);
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email('Correo inválido.').max(254));

export const rulesSchema = z.object({
  stampsRequired: z.number().int().min(LIMITS.stampsRequired.min).max(LIMITS.stampsRequired.max),
  stampMode: z.enum(['per_purchase', 'per_item']),
  maxStampsPerPurchase: z.number().int().min(LIMITS.maxStampsPerPurchase.min).max(LIMITS.maxStampsPerPurchase.max),
  visitWindowMinutes: z.number().int().min(LIMITS.visitWindowMinutes.min).max(LIMITS.visitWindowMinutes.max),
  rewardDescription: trimmed(3, 80),
});

export const createBusinessSchema = z.object({
  slug: slugSchema,
  name: trimmed(2, 60),
  city: trimmed(0, 80).default(''),
  vertical: z.enum(verticals).default('otro'),
  primaryColor: color.default('#2B1B14'),
  accentColor: color.default('#C9A15B'),
  reviewUrl: z.string().trim().regex(/^https:\/\/\S+$/, 'El enlace debe empezar con https://').max(500).nullable().default(null),
  isDemo: z.boolean().default(false),
  rules: rulesSchema,
  owner: z.object({ email: emailSchema, displayName: trimmed(2, 60), password: passwordSchema }),
});

export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(200), businessSlug: slugSchema.optional() });

export const registerCustomerSchema = z.object({
  displayName: trimmed(2, 40),
  contact: z.string().trim().max(120).optional().default(''),
  marketingConsent: z.boolean().default(false),
  privacyAccepted: z.literal(true, { message: 'Debes aceptar el aviso de privacidad.' }),
});

export const purchaseSchema = z.object({
  itemCount: z.number().int().min(LIMITS.itemCount.min).max(LIMITS.itemCount.max).default(1),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{8,100}$/, 'Llave de idempotencia inválida.'),
  confirmDuplicate: z.boolean().default(false),
});

export const updateProgramSchema = z.object({
  name: trimmed(2, 60),
  vertical: z.enum(verticals),
  primaryColor: color,
  accentColor: color,
  reviewUrl: z.string().trim().regex(/^https:\/\/\S+$/, 'El enlace de reseñas debe empezar con https://').max(500).nullable(),
  rules: rulesSchema,
});

export const createEmployeeSchema = z.object({ email: emailSchema, displayName: trimmed(2, 60), password: passwordSchema });
export const reviewEventSchema = z.object({ kind: z.enum(['prompt_shown', 'link_opened', 'dismissed']) });

/** Valida contacto opcional: WhatsApp MX de 10 dígitos (o 52 + 10) o correo. */
export function normalizeContact(raw: string): { contact: string | null; type: 'whatsapp' | 'email' | null; error?: string } {
  const c = raw.trim();
  if (!c) return { contact: null, type: null };
  if (c.includes('@')) {
    const r = z.email().safeParse(c.toLowerCase());
    return r.success ? { contact: r.data, type: 'email' } : { contact: null, type: null, error: 'Revisa el correo electrónico.' };
  }
  const digits = c.replace(/\D/g, '');
  if (digits.length === 10) return { contact: digits, type: 'whatsapp' };
  if (digits.length === 12 && digits.startsWith('52')) return { contact: digits.slice(2), type: 'whatsapp' };
  return { contact: null, type: null, error: 'El WhatsApp debe tener 10 dígitos.' };
}
