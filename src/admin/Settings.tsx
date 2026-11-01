// Planes y precios, equipo VLUX (administradores y sesiones) y bitácora global.
import React, { useState } from 'react';
import { LogOut, UserPlus } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { usePolling } from '../lib/usePolling';
import { relativeTime } from '../lib/format';
import { CopyButton, useToast } from '../components/ui';
import { CButton, CField, CModal, ErrorLine, PageHeader, Pill, Skeleton, actionLabel, money } from './kit';

type Plan = { code: string; name: string; priceCents: number; currency: string; updatedAt: string };

export function Plans() {
  const { data, error, refresh } = usePolling(() => api<{ plans: Plan[] }>('GET', '/admin/plans'), 120_000, []);
  return (
    <>
      <PageHeader title="Planes" sub="Precios de referencia (hipótesis comerciales, editables). Cambiarlos no modifica las suscripciones existentes." />
      {error && <ErrorLine message={error.message} onRetry={refresh} />}
      <div className="grid gap-3 md:grid-cols-3">
        {!data && [0, 1, 2].map((i) => <Skeleton key={i} className="h-44" />)}
        {data?.plans.map((p) => <PlanCard key={p.code} p={p} onSaved={refresh} />)}
      </div>
      <p className="mt-5 text-[12px] cc-faint">Sin integración de cobros: no se generan cargos automáticos.</p>
    </>
  );
}

function PlanCard({ p, onSaved }: { p: Plan; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(p.name);
  const [price, setPrice] = useState(String(p.priceCents / 100));
  const dirty = name !== p.name || Math.round(Number(price) * 100) !== p.priceCents;
  const save = async () => {
    try {
      await api('PUT', `/admin/plans/${p.code}`, { name, priceCents: Math.round(Number(price) * 100), currency: p.currency });
      toast('good', `Plan ${name} actualizado.`);
      onSaved();
    } catch (x) { toast('bad', (x as ApiError).message); }
  };
  return (
    <section className="cc-panel cc-sheen p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between"><span className="cc-label">{p.code}</span><span className="text-[11.5px] cc-faint">{relativeTime(p.updatedAt)}</span></div>
      <div className="cc-kpi">{money(p.priceCents, p.currency)}<span className="text-[13px] cc-muted">/mes</span></div>
      <CField label="Nombre" htmlFor={`pl-name-${p.code}`}><input id={`pl-name-${p.code}`} className="cc-input" value={name} onChange={(e) => setName(e.target.value)} /></CField>
      <CField label={`Precio mensual (${p.currency})`} htmlFor={`pl-price-${p.code}`}><input id={`pl-price-${p.code}`} inputMode="decimal" className="cc-input tabular-nums" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))} /></CField>
      <CButton variant="primary" disabled={!dirty || name.trim().length < 2} onClick={save}>Guardar</CButton>
    </section>
  );
}

type Admin = { id: string; email: string; displayName: string; mfaEnabled: boolean; disabled: boolean; createdAt: string };
type Session = { id: string; adminId: string; email: string; displayName: string; userAgent: string | null; createdAt: string; lastSeenAt: string; expiresAt: string };

export function Team({ me }: { me: { email: string; sessionId: string } }) {
  const toast = useToast();
  const admins = usePolling(() => api<{ admins: Admin[] }>('GET', '/admin/admins'), 60_000, []);
  const sessions = usePolling(() => api<{ sessions: Session[]; current: string }>('GET', '/admin/sessions'), 30_000, []);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [form, setForm] = useState({ displayName: '', email: '' });
  const [link, setLink] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    try {
      const r = await api<{ link: string }>('POST', '/admin/admins/invite', form);
      setLink(r.link);
      setForm({ displayName: '', email: '' });
    } catch (x) { setErr((x as ApiError).message); }
  };
  const toggle = async (a: Admin) => {
    if (!a.disabled && !confirm(`¿Desactivar a ${a.displayName}? Se cerrarán sus sesiones.`)) return;
    try { await api('PATCH', `/admin/admins/${a.id}`, { disabled: !a.disabled }); admins.refresh(); sessions.refresh(); } catch (x) { toast('bad', (x as ApiError).message); }
  };
  const revoke = async (s: Session) => {
    try {
      await api('POST', `/admin/sessions/${s.id}/revoke`);
      if (s.id === me.sessionId) { location.reload(); return; }
      toast('good', 'Sesión cerrada.');
      sessions.refresh();
    } catch (x) { toast('bad', (x as ApiError).message); }
  };

  return (
    <>
      <PageHeader title="Equipo y sesiones" sub="Administradores de VLUX. Todos usan segundo factor." actions={<CButton variant="primary" onClick={() => { setInviteOpen(true); setLink(null); }}><UserPlus size={15} /> Invitar administrador</CButton>} />
      <section className="cc-panel overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[color:var(--cc-line)] text-[14px] font-medium">Administradores</div>
        <ul>
          {admins.data?.admins.map((a) => (
            <li key={a.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--cc-line)] last:border-0 text-[13px]">
              <div className="min-w-0"><div>{a.displayName} {a.email === me.email && <span className="cc-faint">(tú)</span>}</div><div className="cc-faint text-[12px]">{a.email}</div></div>
              <div className="flex items-center gap-2">
                {a.disabled ? <Pill tone="red">Desactivado</Pill> : a.mfaEnabled ? <Pill tone="green">2FA activo</Pill> : <Pill tone="amber">2FA pendiente</Pill>}
                {a.email !== me.email && <CButton small variant={a.disabled ? 'secondary' : 'ghost'} onClick={() => toggle(a)}>{a.disabled ? 'Reactivar' : 'Desactivar'}</CButton>}
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="mt-4 cc-panel overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[color:var(--cc-line)] text-[14px] font-medium">Sesiones abiertas</div>
        <ul data-testid="admin-sessions">
          {sessions.data?.sessions.map((s) => (
            <li key={s.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--cc-line)] last:border-0 text-[13px]">
              <div className="min-w-0">
                <div>{s.displayName} {s.id === sessions.data?.current && <Pill tone="cyan" dot={false}>Esta sesión</Pill>}</div>
                <div className="cc-faint text-[12px] truncate max-w-[520px]">{s.userAgent ?? 'Navegador desconocido'} · activa {relativeTime(s.lastSeenAt)} · vence {new Date(s.expiresAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
              <CButton small variant="ghost" onClick={() => revoke(s)}><LogOut size={13} /> Cerrar</CButton>
            </li>
          ))}
        </ul>
      </section>
      <p className="mt-3 text-[11.5px] cc-faint">Las sesiones vencen a las 8 h o tras 30 min sin actividad.</p>

      <CModal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invitar administrador" labelledBy="cc-inv-admin">
        {link ? (
          <div className="flex flex-col gap-3">
            <p className="text-[13px] cc-muted">Enlace de un solo uso, vence en 24 h. <strong className="text-white">No se envió correo</strong>: compártelo por un canal seguro.</p>
            <div className="cc-code select-all" data-testid="admin-invite-link">{link}</div>
            <CopyButton dark text={link} />
          </div>
        ) : (
          <form onSubmit={invite} className="flex flex-col gap-4">
            <CField label="Nombre" htmlFor="ai-name"><input id="ai-name" className="cc-input" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></CField>
            <CField label="Correo" htmlFor="ai-email"><input id="ai-email" type="email" className="cc-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></CField>
            {err && <p className="text-[12.5px] text-[#FDA29B]" role="alert">{err}</p>}
            <CButton variant="primary" type="submit" disabled={form.displayName.trim().length < 2 || !form.email}>Generar enlace</CButton>
          </form>
        )}
      </CModal>
    </>
  );
}

type Event = { id: number; action: string; at: string; entityType: string | null; details: Record<string, unknown>; businessName: string | null; adminName: string | null };

export function AuditLog() {
  const { data, error, refresh } = usePolling(() => api<{ events: Event[] }>('GET', '/admin/audit?limit=200'), 30_000, []);
  return (
    <>
      <PageHeader title="Bitácora" sub="Acciones del equipo VLUX sobre la plataforma. Solo se agregan registros: no se editan ni se borran." />
      {error && <ErrorLine message={error.message} onRetry={refresh} />}
      <div className="cc-panel overflow-x-auto cc-scroll">
        <table className="cc-table min-w-[720px]" data-testid="audit-table">
          <thead><tr><th>Cuándo</th><th>Acción</th><th>Negocio</th><th>Administrador</th><th>Detalle</th></tr></thead>
          <tbody>
            {data?.events.map((e) => (
              <tr key={e.id} className="cursor-default">
                <td className="cc-muted tabular-nums whitespace-nowrap">{new Date(e.at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</td>
                <td>{actionLabel(e.action)}</td>
                <td className="cc-muted">{e.businessName ?? '—'}</td>
                <td className="cc-muted">{e.adminName ?? '—'}</td>
                <td className="cc-faint font-mono text-[11.5px] max-w-[280px] truncate">{Object.keys(e.details ?? {}).length ? JSON.stringify(e.details) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
