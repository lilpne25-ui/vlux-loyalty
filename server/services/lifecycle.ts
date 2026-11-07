// V0.4.5 · Ciclo de vida de negocios en el Control Center: archivar, restaurar, respaldar y eliminar.
//  - Suspender (V0.3): pausa temporal. Reactivable.
//  - Archivar: retira el negocio de la operación y de las métricas activas. Conserva todo. Restaurable.
//  - Eliminar: definitivo. Solo negocios archivados de demostración o con datos declarados sintéticos (o sin clientes),
//    tras descargar un respaldo, escribir el identificador y reverificar 2FA. La purga corre en UNA transacción
//    (función platform_purge_business) y deja una lápida + bitácora global.
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getPool, q, withTenant, withTx } from '../db';
import { AppError, notFound } from '../errors';
import { audit } from './audit';
import { platformAudit, verifyStepUp, type AdminSession } from './platform-auth';

/** Minutos de validez del respaldo descargado para autorizar la eliminación. */
export const BACKUP_WINDOW_MINUTES = 30;
export const SYNTHETIC_PHRASE = 'DATOS DE PRUEBA';

const reasonSchema = z.string().trim().min(3, 'Escribe el motivo.').max(300);
export const archiveSchema = z.object({ reason: reasonSchema, confirm: z.literal(true, { message: 'Confirma la operación.' }) });
export const restoreSchema = z.object({ reason: reasonSchema });
export const syntheticSchema = z.object({ phrase: z.string(), code: z.string() });
export const deleteSchema = z.object({ confirmSlug: z.string().max(60), reason: reasonSchema, code: z.string(), backupSha256: z.string().regex(/^[0-9a-f]{64}$/, 'Descarga primero el respaldo.') });

async function current(id: string) {
  const b = (await getPool().query('SELECT id, slug, name, status, is_demo, synthetic_declared_at FROM businesses WHERE id = $1', [id])).rows[0];
  if (!b) throw notFound('Negocio');
  return b as { id: string; slug: string; name: string; status: 'active' | 'suspended' | 'archived'; is_demo: boolean; synthetic_declared_at: Date | null };
}

/** Archivar: fuera de operación (personal sin acceso, registro y tarjetas sin servicio), sesiones e invitaciones revocadas. */
export async function archiveBusiness(admin: AdminSession, id: string, raw: unknown) {
  const input = archiveSchema.parse(raw);
  return withTenant(id, async (tx) => {
    const cur = (await tx.query('SELECT status FROM businesses WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!cur) throw notFound('Negocio');
    if (cur.status === 'archived') throw new AppError(409, 'no_change', 'El negocio ya está archivado.');
    await tx.query("UPDATE businesses SET status = 'archived', archived_at = now(), archived_reason = $2 WHERE id = $1", [id, input.reason]);
    const sessions = (await tx.query('UPDATE staff_sessions SET revoked_at = now() WHERE business_id = $1 AND revoked_at IS NULL', [id])).rowCount ?? 0;
    const invitations = (await tx.query('UPDATE staff_invitations SET revoked_at = now() WHERE business_id = $1 AND accepted_at IS NULL AND revoked_at IS NULL', [id])).rowCount ?? 0;
    await audit(tx, id, { type: 'platform', id: null }, 'business.archived', 'business', id, { reason: input.reason });
    await platformAudit(tx, admin.adminId, 'business.archived', { businessId: id, entityType: 'business', entityId: id, details: { reason: input.reason, from: cur.status, sessionsRevoked: sessions, invitationsRevoked: invitations } });
    return { status: 'archived' as const, sessionsRevoked: sessions, invitationsRevoked: invitations };
  });
}

/** Restaurar un archivado: vuelve SUSPENDIDO (no activo) para que la reactivación sea una decisión aparte y explícita. */
export async function restoreBusiness(admin: AdminSession, id: string, raw: unknown) {
  const input = restoreSchema.parse(raw);
  return withTenant(id, async (tx) => {
    const cur = (await tx.query('SELECT status FROM businesses WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!cur) throw notFound('Negocio');
    if (cur.status !== 'archived') throw new AppError(409, 'not_archived', 'Solo se restaura un negocio archivado.');
    await tx.query("UPDATE businesses SET status = 'suspended', suspended_reason = $2, archived_at = NULL, archived_reason = NULL WHERE id = $1", [id, `Restaurado del archivo: ${input.reason}`.slice(0, 300)]);
    await audit(tx, id, { type: 'platform', id: null }, 'business.restored', 'business', id, { reason: input.reason });
    await platformAudit(tx, admin.adminId, 'business.restored', { businessId: id, entityType: 'business', entityId: id, details: { reason: input.reason } });
    return { status: 'suspended' as const };
  });
}

async function counts(id: string) {
  return withTenant(id, async (tx) => {
    const r = (await tx.query(
      `SELECT (SELECT count(*) FROM customers)::int AS customers, (SELECT count(*) FROM cards)::int AS cards, (SELECT count(*) FROM visits)::int AS visits,
              (SELECT count(*) FROM purchases)::int AS purchases, (SELECT count(*) FROM rewards)::int AS rewards, (SELECT count(*) FROM stamp_events)::int AS stamp_events,
              (SELECT count(*) FROM audit_events)::int AS audit_events`,
    )).rows[0];
    return { customers: r.customers, cards: r.cards, visits: r.visits, purchases: r.purchases, rewards: r.rewards, stampEvents: r.stamp_events, auditEvents: r.audit_events };
  });
}

/** Vista previa de la eliminación: qué se borra, qué se conserva y si está permitido. Sin efectos. */
export async function deletionPreview(admin: AdminSession, id: string) {
  const b = await current(id);
  const [c, staff, inv, backup] = await Promise.all([
    counts(id),
    q(
      `SELECT u.email, u.display_name, m.role,
              EXISTS (SELECT 1 FROM staff_memberships o WHERE o.user_id = u.id AND o.business_id <> $1) AS shared
         FROM staff_memberships m JOIN staff_users u ON u.id = m.user_id WHERE m.business_id = $1 ORDER BY m.role, u.display_name`, [id]),
    q('SELECT count(*) FILTER (WHERE accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now())::int AS pending, count(*)::int AS total FROM staff_invitations WHERE business_id = $1', [id]),
    lastBackup(admin.adminId, id),
  ]);
  const synthetic = b.is_demo || !!b.synthetic_declared_at;
  const blockers: string[] = [];
  if (b.status !== 'archived') blockers.push('Primero archiva el negocio.');
  if (!synthetic && c.customers > 0) blockers.push('Tiene clientes y no está marcado como demostración: declara que son datos de prueba (con 2FA) o consérvalo archivado.');
  return {
    business: { id: b.id, slug: b.slug, name: b.name, status: b.status, isDemo: b.is_demo, syntheticDeclaredAt: b.synthetic_declared_at },
    counts: { ...c, staff: staff.rowCount ?? 0, invitations: inv.rows[0].total, pendingInvitations: inv.rows[0].pending },
    staff: staff.rows.map((r) => ({ email: r.email, displayName: r.display_name, role: r.role, sharedWithOtherBusinesses: r.shared })),
    backup,
    canDelete: blockers.length === 0,
    blockers,
    requiresSyntheticDeclaration: !synthetic && c.customers > 0,
    confirmationText: b.slug,
    backupWindowMinutes: BACKUP_WINDOW_MINUTES,
  };
}

async function lastBackup(adminId: string, businessId: string) {
  const r = (await q(
    `SELECT details->>'sha256' AS sha, created_at FROM platform_audit_events
      WHERE action = 'business.exported' AND admin_id = $1 AND business_id = $2 AND created_at > now() - make_interval(mins => $3)
      ORDER BY created_at DESC LIMIT 1`, [adminId, businessId, BACKUP_WINDOW_MINUTES],
  )).rows[0];
  return r ? { sha256: r.sha as string, at: r.created_at as Date } : null;
}

/** Respaldo JSON de UN negocio (sin hashes de contraseñas ni tokens). Queda registrado con su huella SHA-256. */
export async function exportBusiness(admin: AdminSession, id: string) {
  await current(id);
  const data = (await q('SELECT platform_business_export($1) AS j', [id])).rows[0].j;
  const body = JSON.stringify({ format: 'vlux-business-export/1', exportedAt: new Date().toISOString(), data }, null, 2);
  const sha = createHash('sha256').update(body).digest('hex');
  await platformAudit(getPool(), admin.adminId, 'business.exported', { businessId: id, entityType: 'business', entityId: id, details: { sha256: sha, bytes: Buffer.byteLength(body) } });
  return { body, sha256: sha };
}

/** Declarar que los datos de un negocio ARCHIVADO son sintéticos (pruebas de VLUX). Exige frase escrita y 2FA. */
export async function declareSynthetic(admin: AdminSession, id: string, raw: unknown) {
  const input = syntheticSchema.parse(raw);
  if (input.phrase.trim().toUpperCase() !== SYNTHETIC_PHRASE) throw new AppError(422, 'validation', `Escribe exactamente «${SYNTHETIC_PHRASE}» para confirmar.`);
  const b = await current(id);
  if (b.status !== 'archived') throw new AppError(409, 'not_archived', 'Primero archiva el negocio.');
  if (b.is_demo || b.synthetic_declared_at) throw new AppError(409, 'no_change', 'Este negocio ya está marcado como datos de prueba.');
  await verifyStepUp(admin, input.code, 'declare_synthetic');
  return withTenant(id, async (tx) => {
    await tx.query('UPDATE businesses SET synthetic_declared_at = now() WHERE id = $1', [id]);
    await audit(tx, id, { type: 'platform', id: null }, 'business.synthetic_declared', 'business', id);
    await platformAudit(tx, admin.adminId, 'business.synthetic_declared', { businessId: id, entityType: 'business', entityId: id });
    return { ok: true };
  });
}

/** Eliminación definitiva y transaccional. */
export async function deleteBusiness(admin: AdminSession, id: string, raw: unknown) {
  const input = deleteSchema.parse(raw);
  const preview = await deletionPreview(admin, id);
  if (input.confirmSlug.trim() !== preview.business.slug) throw new AppError(422, 'validation', 'El identificador escrito no coincide.');
  if (!preview.canDelete) throw new AppError(409, 'not_deletable', preview.blockers.join(' '));
  if (!preview.backup || preview.backup.sha256 !== input.backupSha256) throw new AppError(409, 'backup_required', `Descarga el respaldo (vale ${BACKUP_WINDOW_MINUTES} min) antes de eliminar.`);
  await verifyStepUp(admin, input.code, 'delete_business');
  try {
    return await withTx(async (tx) => {
      const purged = (await tx.query('SELECT platform_purge_business($1, $2) AS c', [id, preview.business.slug])).rows[0].c as Record<string, number>;
      await tx.query(
        `INSERT INTO business_deletions (business_id, slug, name, was_demo, counts, backup_sha256, reason, deleted_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, preview.business.slug, preview.business.name, preview.business.isDemo, JSON.stringify(purged), input.backupSha256, input.reason, admin.adminId],
      );
      await platformAudit(tx, admin.adminId, 'business.deleted', { businessId: id, entityType: 'business', entityId: id, details: { slug: preview.business.slug, name: preview.business.name, reason: input.reason, backupSha256: input.backupSha256, ...purged } });
      return { deleted: true, counts: purged };
    });
  } catch (e) {
    // La función de purga tiene sus propias reglas en BD (defensa en profundidad): se traducen sin detalles internos.
    if ((e as { code?: string }).code === '23514') throw new AppError(409, 'not_deletable', 'La base de datos rechazó la eliminación (estado o confirmación no válidos).');
    throw e;
  }
}

export async function listDeletions() {
  return (await q(
    `SELECT d.slug, d.name, d.was_demo, d.counts, d.reason, d.deleted_at, a.display_name FROM business_deletions d JOIN platform_admins a ON a.id = d.deleted_by ORDER BY d.deleted_at DESC LIMIT 50`,
  )).rows.map((r) => ({ slug: r.slug, name: r.name, wasDemo: r.was_demo, counts: r.counts, reason: r.reason, deletedAt: r.deleted_at, deletedBy: r.display_name }));
}
