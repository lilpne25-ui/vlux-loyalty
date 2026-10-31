import type { Tx } from '../db';

export type Actor = { type: 'staff' | 'customer' | 'platform' | 'system'; id: string | null };

/** Registra un evento en la bitácora (debe llamarse dentro de withTenant). Nunca guarda contraseñas ni tokens. */
export async function audit(tx: Tx, businessId: string, actor: Actor, action: string, entityType: string | null, entityId: string | null, details: Record<string, unknown> = {}) {
  await tx.query(
    'INSERT INTO audit_events (business_id, actor_type, actor_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [businessId, actor.type, actor.id, action, entityType, entityId, JSON.stringify(details)],
  );
}
