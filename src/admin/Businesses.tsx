// Directorio de negocios y ficha de cada negocio (acceso, suscripción, configuración, estado, bitácora).
import React, { useMemo, useState } from 'react';
import { ArrowLeft, Ban, ExternalLink, KeyRound, Pencil, Plus, RefreshCw, RotateCcw, Search, UserPlus, XCircle } from 'lucide-react';
import { api, ApiError, type Vertical } from '../lib/api';
import { navigate } from '../lib/router';
import { usePolling } from '../lib/usePolling';
import { relativeTime } from '../lib/format';
import { VERTICAL_LABEL } from '../lib/vertical';
import { CopyButton, QRCode, useToast } from '../components/ui';
import { CButton, CField, CModal, COMMERCIAL, ErrorLine, PLAN_LABEL, PageHeader, Pill, Skeleton, actionLabel, cx, money, num, shortDate } from './kit';
import { prepareLogo } from './logo';

type Row = {
  id: string; slug: string; name: string; vertical: Vertical; city: string; status: 'active' | 'suspended'; isDemo: boolean; createdAt: string;
  owner: string | null; plan: string | null; commercialStatus: string | null; priceCents: number | null; currency: string | null; customers: number; lastActivity: string | null;
};

export function Directory() {
  const { data, error, refresh } = usePolling(() => api<{ businesses: Row[] }>('GET', '/admin/businesses'), 60_000, []);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'todos' | 'piloto' | 'activo' | 'suspendidos' | 'demo'>('todos');
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (data?.businesses ?? []).filter((b) => {
      if (filter === 'piloto' && b.commercialStatus !== 'piloto') return false;
      if (filter === 'activo' && b.commercialStatus !== 'activo') return false;
      if (filter === 'suspendidos' && b.status !== 'suspended') return false;
      if (filter === 'demo' && !b.isDemo) return false;
      return !t || [b.name, b.city, b.owner ?? '', b.slug].some((s) => s.toLowerCase().includes(t));
    });
  }, [data, q, filter]);

  return (
    <>
      <PageHeader title="Negocios" sub={data ? `${data.businesses.length} en la plataforma` : ' '} actions={<CButton variant="primary" onClick={() => navigate('/vlux-admin/negocios/nuevo')}><Plus size={15} /> Nuevo negocio</CButton>} />
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[220px] max-w-[360px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 cc-faint" />
          <input className="cc-input" style={{ paddingLeft: 36 }} placeholder="Buscar por nombre, ciudad o dueño" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar negocios" />
        </div>
        <select className="cc-input" style={{ width: 180 }} value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Filtrar">
          <option value="todos">Todos</option><option value="piloto">En piloto</option><option value="activo">Activos</option><option value="suspendidos">Suspendidos</option><option value="demo">Demostración</option>
        </select>
      </div>
      {error && <div className="mb-4"><ErrorLine message={error.message} onRetry={refresh} /></div>}
      <div className="cc-panel overflow-x-auto cc-scroll">
        <table className="cc-table min-w-[980px]" data-testid="directory">
          <thead><tr><th>Negocio</th><th>Giro</th><th>Ciudad</th><th>Dueño</th><th>Plan</th><th>Estado</th><th>Alta</th><th className="text-right">Clientes</th><th>Última actividad</th></tr></thead>
          <tbody>
            {!data && [0, 1, 2].map((i) => <tr key={i}><td colSpan={9}><Skeleton className="h-5" /></td></tr>)}
            {rows.map((b) => (
              <tr key={b.id} onClick={() => navigate(`/vlux-admin/negocios/${b.id}`)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && navigate(`/vlux-admin/negocios/${b.id}`)}>
                <td><div className="font-medium">{b.name}</div><div className="text-[11.5px] cc-faint font-mono">/{b.slug}</div></td>
                <td className="cc-muted">{VERTICAL_LABEL[b.vertical]}</td>
                <td className="cc-muted">{b.city || '—'}</td>
                <td className={b.owner ? '' : 'cc-faint'}>{b.owner ?? 'Sin dueño'}</td>
                <td>{b.plan ? <>{PLAN_LABEL[b.plan]}<div className="text-[11.5px] cc-faint">{money(b.priceCents, b.currency ?? 'MXN')}/mes</div></> : <span className="cc-faint">Sin registro</span>}</td>
                <td><StatusPills row={b} /></td>
                <td className="cc-muted tabular-nums">{shortDate(b.createdAt)}</td>
                <td className="text-right tabular-nums">{num(b.customers)}</td>
                <td className="cc-muted">{relativeTime(b.lastActivity)}</td>
              </tr>
            ))}
            {data && rows.length === 0 && <tr><td colSpan={9} className="py-10 text-center cc-muted">{data.businesses.length ? 'Ningún negocio coincide con el filtro.' : 'Aún no hay negocios. Crea el primero con “Nuevo negocio”.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function StatusPills({ row }: { row: { status: string; commercialStatus: string | null; isDemo: boolean } }) {
  const c = row.commercialStatus ? COMMERCIAL[row.commercialStatus] : null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {row.status === 'suspended' ? <Pill tone="red">Servicio suspendido</Pill> : c ? <Pill tone={c.tone}>{c.label}</Pill> : null}
      {row.isDemo && <Pill dot={false}>Demo</Pill>}
    </div>
  );
}

// ---------- Ficha ----------
type Invitation = { id: string; email: string; displayName: string; role: 'OWNER' | 'EMPLOYEE'; status: 'pendiente' | 'aceptada' | 'revocada' | 'vencida'; expiresAt: string; createdAt: string };
type Detail = {
  id: string; slug: string; name: string; city: string; vertical: Vertical; primaryColor: string; accentColor: string; reviewUrl: string | null; isDemo: boolean;
  program: { stampsRequired: number; stampMode: string; maxStampsPerPurchase: number; visitWindowMinutes: number; rewardDescription: string; version: number };
  status: 'active' | 'suspended'; suspendedReason: string | null; logoDataUrl: string | null; createdAt: string; registrationUrl: string;
  subscription: { plan: string; commercialStatus: string; startDate: string; pilotEndDate: string | null; renewalDate: string | null; priceCents: number; currency: string; notes: string; updatedAt: string } | null;
  staff: { membershipId: string; role: 'OWNER' | 'EMPLOYEE'; active: boolean; email: string; displayName: string; createdAt: string; lastLogin: string | null }[];
  invitations: Invitation[];
  stats: { customers: number; cards: number; purchases: number; stamps: number; rewardsRedeemed: number; lastActivity: string | null } | null;
  audit: { action: string; actorType: string; at: string }[];
};

const TABS = [['resumen', 'Resumen'], ['acceso', 'Acceso'], ['suscripcion', 'Suscripción'], ['configuracion', 'Configuración'], ['bitacora', 'Bitácora']] as const;
type Tab = (typeof TABS)[number][0];

export function BusinessDetail({ id }: { id: string }) {
  const { data: d, error, refresh } = usePolling(() => api<Detail>('GET', `/admin/businesses/${id}`), 60_000, [id]);
  const [tab, setTab] = useState<Tab>('resumen');
  const [link, setLink] = useState<{ title: string; url: string; expiresAt?: string } | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  if (error) return <ErrorLine message={error.message} onRetry={refresh} />;
  if (!d) return <div className="flex flex-col gap-3"><Skeleton className="h-8 w-64" /><Skeleton className="h-40" /></div>;
  return (
    <>
      <button className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] cc-muted hover:text-white" onClick={() => navigate('/vlux-admin/negocios')}><ArrowLeft size={14} /> Negocios</button>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div className="flex items-center gap-4 min-w-0">
          <div className="h-14 w-14 rounded-xl overflow-hidden shrink-0 flex items-center justify-center text-[20px] font-medium" style={{ background: d.primaryColor, color: d.accentColor }}>
            {d.logoDataUrl ? <img src={d.logoDataUrl} alt="" className="h-full w-full object-contain bg-white" /> : d.name.slice(0, 1)}
          </div>
          <div className="min-w-0">
            <h1 className="text-[22px] font-medium tracking-[-0.01em] truncate" data-testid="business-name">{d.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] cc-muted">
              <span>{VERTICAL_LABEL[d.vertical]}{d.city ? ` · ${d.city}` : ''}</span>
              <StatusPills row={{ status: d.status, commercialStatus: d.subscription?.commercialStatus ?? null, isDemo: d.isDemo }} />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <CButton onClick={() => setEditOpen(true)}><Pencil size={14} /> Editar</CButton>
          {d.status === 'active'
            ? <CButton variant="danger" onClick={() => setStatusOpen(true)}><Ban size={14} /> Suspender servicio</CButton>
            : <CButton variant="primary" onClick={() => setStatusOpen(true)}><RotateCcw size={14} /> Reactivar servicio</CButton>}
        </div>
      </div>
      {d.status === 'suspended' && <div className="mb-5 cc-raised px-4 py-3 text-[13px] text-[#FDA29B]">Servicio suspendido: el personal no puede entrar y la página de registro no responde. Motivo: {d.suspendedReason}</div>}

      <div className="flex gap-1 border-b border-[color:var(--cc-line)] mb-6 overflow-x-auto cc-scroll" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cx('h-10 px-3 text-[13px] -mb-px border-b-2 transition whitespace-nowrap', tab === k ? 'border-[#67C7D3] text-white' : 'border-transparent cc-muted hover:text-white')}>{label}</button>
        ))}
      </div>

      {tab === 'resumen' && <Summary d={d} />}
      {tab === 'acceso' && <Access d={d} onLink={setLink} refresh={refresh} />}
      {tab === 'suscripcion' && <Subscription d={d} refresh={refresh} />}
      {tab === 'configuracion' && <Config d={d} />}
      {tab === 'bitacora' && (
        <section className="cc-panel">
          <ul>{d.audit.map((a, i) => <li key={i} className="px-5 py-2.5 flex justify-between gap-3 text-[13px] border-b border-[color:var(--cc-line)] last:border-0"><span>{actionLabel(a.action)} <span className="cc-faint">· {a.actorType === 'platform' ? 'VLUX' : a.actorType === 'staff' ? 'personal' : a.actorType === 'customer' ? 'cliente' : 'sistema'}</span></span><span className="cc-faint tabular-nums">{relativeTime(a.at)}</span></li>)}</ul>
          {d.audit.length === 0 && <p className="px-5 py-8 text-[13px] cc-muted">Sin eventos.</p>}
        </section>
      )}

      <CModal open={!!link} onClose={() => setLink(null)} title={link?.title} labelledBy="cc-link-title">
        {link && (
          <div className="flex flex-col items-center gap-4">
            <p className="text-[13px] cc-muted self-start">No hay proveedor de correo configurado: <strong className="text-white">VLUX no envió ningún correo</strong>. Comparte este enlace por un canal seguro (WhatsApp directo, en persona). Sirve una sola vez{link.expiresAt ? ` y vence el ${new Date(link.expiresAt).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}.</p>
            <div className="rounded-lg bg-white p-2"><QRCode value={link.url} size={168} label="Código QR del enlace de invitación" /></div>
            <div className="cc-code w-full select-all" data-testid="invite-link">{link.url}</div>
            <CopyButton dark text={link.url} />
          </div>
        )}
      </CModal>
      <StatusModal open={statusOpen} d={d} onClose={() => setStatusOpen(false)} onDone={() => { setStatusOpen(false); refresh(); }} />
      <EditModal open={editOpen} d={d} onClose={() => setEditOpen(false)} onDone={() => { setEditOpen(false); refresh(); }} />
    </>
  );
}

function Summary({ d }: { d: Detail }) {
  const s = d.stats;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] items-start">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[['Clientes', s?.customers], ['Tarjetas', s?.cards], ['Compras', s?.purchases], ['Sellos', s?.stamps], ['Premios canjeados', s?.rewardsRedeemed]].map(([l, v]) => (
            <div key={l as string} className="cc-panel p-4"><div className="cc-label">{l}</div><div className="cc-kpi text-[22px] mt-2.5">{num((v as number) ?? 0)}</div></div>
          ))}
          <div className="cc-panel p-4"><div className="cc-label">Última actividad</div><div className="mt-2.5 text-[14px]">{relativeTime(s?.lastActivity ?? null)}</div></div>
        </div>
        <section className="cc-panel p-5">
          <h2 className="text-[14px] font-medium">Estado operativo</h2>
          <dl className="mt-4 grid sm:grid-cols-2 gap-x-6 gap-y-3 text-[13px]">
            <Def k="Servicio" v={d.status === 'active' ? 'Activo' : 'Suspendido'} />
            <Def k="Dueños activos" v={String(d.staff.filter((x) => x.role === 'OWNER' && x.active).length)} />
            <Def k="Empleados activos" v={String(d.staff.filter((x) => x.role === 'EMPLOYEE' && x.active).length)} />
            <Def k="Invitaciones pendientes" v={String(d.invitations.filter((x) => x.status === 'pendiente').length)} />
            <Def k="Alta" v={shortDate(d.createdAt)} />
            <Def k="Programa" v={`${d.program.stampsRequired} sellos → ${d.program.rewardDescription}`} />
          </dl>
        </section>
      </div>
      <section className="cc-panel p-5 flex flex-col items-center gap-3 text-center">
        <div className="cc-label self-start">QR de registro de clientes</div>
        <div className="rounded-lg bg-white p-2"><QRCode value={d.registrationUrl} size={156} label="QR de registro de clientes" /></div>
        <div className="cc-code w-full text-left" data-testid="registration-url">{d.registrationUrl}</div>
        <div className="flex gap-1"><CopyButton dark text={d.registrationUrl} /><a className="cc-btn cc-btn-ghost cc-btn-sm" href={d.registrationUrl} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Abrir</a></div>
        <p className="text-[11.5px] cc-faint">El dueño imprime el cartel del mostrador desde su panel (pestaña QR).</p>
      </section>
    </div>
  );
}

const Def = ({ k, v }: { k: string; v: string }) => <div><dt className="cc-faint text-[12px]">{k}</dt><dd className="mt-0.5">{v}</dd></div>;

function Access({ d, onLink, refresh }: { d: Detail; onLink: (l: { title: string; url: string; expiresAt?: string }) => void; refresh: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ displayName: '', email: '', role: 'OWNER' as 'OWNER' | 'EMPLOYEE' });
  const [err, setErr] = useState<string | null>(null);
  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    try {
      const r = await api<{ link: string; expiresAt: string }>('POST', `/admin/businesses/${d.id}/invitations`, form);
      onLink({ title: `Invitación para ${form.displayName}`, url: r.link, expiresAt: r.expiresAt });
      setForm({ displayName: '', email: '', role: 'OWNER' });
      refresh();
    } catch (x) { setErr((x as ApiError).message); }
  };
  const act = async (inv: Invitation, what: 'resend' | 'revoke') => {
    try {
      const r = await api<{ link?: string; expiresAt?: string }>('POST', `/admin/businesses/${d.id}/invitations/${inv.id}/${what}`);
      if (what === 'resend' && r.link) onLink({ title: `Nuevo enlace para ${inv.displayName}`, url: r.link, expiresAt: r.expiresAt });
      else toast('good', 'Invitación revocada.');
      refresh();
    } catch (x) { toast('bad', (x as ApiError).message); }
  };
  const tone = { pendiente: 'cyan', aceptada: 'green', revocada: 'silver', vencida: 'amber' } as const;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] items-start">
      <div className="flex flex-col gap-4">
        <section className="cc-panel overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[color:var(--cc-line)] text-[14px] font-medium">Personal con acceso</div>
          <ul>
            {d.staff.map((s) => (
              <li key={s.membershipId} className="px-5 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--cc-line)] last:border-0 text-[13px]">
                <div className="min-w-0"><div>{s.displayName} <span className="ml-1"><Pill dot={false} tone={s.role === 'OWNER' ? 'cyan' : 'silver'}>{s.role === 'OWNER' ? 'Dueño' : 'Empleado'}</Pill></span>{!s.active && <span className="ml-1"><Pill tone="amber">Inactivo</Pill></span>}</div><div className="cc-faint text-[12px] break-all">{s.email}</div></div>
                <div className="text-[12px] cc-muted">Última entrada: {s.lastLogin ? relativeTime(s.lastLogin) : 'nunca'}</div>
              </li>
            ))}
            {d.staff.length === 0 && <li className="px-5 py-6 text-[13px] cc-muted">Nadie ha aceptado una invitación todavía.</li>}
          </ul>
        </section>
        <section className="cc-panel overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[color:var(--cc-line)] text-[14px] font-medium">Invitaciones</div>
          <ul data-testid="invitations">
            {d.invitations.map((inv) => (
              <li key={inv.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--cc-line)] last:border-0 text-[13px]">
                <div className="min-w-0"><div>{inv.displayName} · <span className="cc-muted">{inv.role === 'OWNER' ? 'Dueño' : 'Empleado'}</span> <span className="ml-1"><Pill tone={tone[inv.status]}>{inv.status}</Pill></span></div><div className="cc-faint text-[12px] break-all">{inv.email} · creada {relativeTime(inv.createdAt)}</div></div>
                {(inv.status === 'pendiente' || inv.status === 'vencida') && (
                  <div className="flex gap-1.5">
                    <CButton small onClick={() => act(inv, 'resend')}><RefreshCw size={13} /> Nuevo enlace</CButton>
                    {inv.status === 'pendiente' && <CButton small variant="ghost" onClick={() => act(inv, 'revoke')}><XCircle size={13} /> Revocar</CButton>}
                  </div>
                )}
              </li>
            ))}
            {d.invitations.length === 0 && <li className="px-5 py-6 text-[13px] cc-muted">Sin invitaciones.</li>}
          </ul>
        </section>
      </div>
      <form onSubmit={invite} className="cc-panel p-5 flex flex-col gap-4">
        <h2 className="text-[14px] font-medium inline-flex items-center gap-2"><UserPlus size={15} /> Invitar persona</h2>
        <CField label="Nombre" htmlFor="inv-name"><input id="inv-name" className="cc-input" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></CField>
        <CField label="Correo" htmlFor="inv-email"><input id="inv-email" type="email" className="cc-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></CField>
        <CField label="Rol" htmlFor="inv-role"><select id="inv-role" className="cc-input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'OWNER' | 'EMPLOYEE' })}><option value="OWNER">Dueño</option><option value="EMPLOYEE">Empleado</option></select></CField>
        {err && <p className="text-[12.5px] text-[#FDA29B]" role="alert">{err}</p>}
        <CButton variant="primary" type="submit" disabled={form.displayName.trim().length < 2 || !form.email}><KeyRound size={14} /> Generar invitación</CButton>
        <p className="text-[11.5px] cc-faint">Enlace de un solo uso, vence en 72 h. Si el correo ya tiene cuenta, la persona lo vincula con su contraseña actual (nunca se reemplaza).</p>
      </form>
    </div>
  );
}

function Subscription({ d, refresh }: { d: Detail; refresh: () => void }) {
  const toast = useToast();
  const s = d.subscription;
  const [f, setF] = useState({
    plan: s?.plan ?? 'piloto', commercialStatus: s?.commercialStatus ?? 'piloto', startDate: s?.startDate ?? new Date().toISOString().slice(0, 10),
    pilotEndDate: s?.pilotEndDate ?? '', renewalDate: s?.renewalDate ?? '', price: s ? String(s.priceCents / 100) : '0', currency: s?.currency ?? 'MXN', notes: s?.notes ?? '',
  });
  const [err, setErr] = useState<string | null>(null);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    try {
      await api('PUT', `/admin/businesses/${d.id}/subscription`, {
        plan: f.plan, commercialStatus: f.commercialStatus, startDate: f.startDate, pilotEndDate: f.pilotEndDate || null, renewalDate: f.renewalDate || null,
        priceCents: Math.round(Number(f.price) * 100), currency: f.currency, notes: f.notes,
      });
      toast('good', 'Suscripción guardada.');
      refresh();
    } catch (x) { setErr((x as ApiError).message); }
  };
  return (
    <form onSubmit={save} className="cc-panel p-5 max-w-[720px] grid sm:grid-cols-2 gap-4">
      <CField label="Plan" htmlFor="sub-plan"><select id="sub-plan" className="cc-input" value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value })}>{Object.entries(PLAN_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></CField>
      <CField label="Estado comercial" htmlFor="sub-status" hint="Solo registro: no suspende el servicio."><select id="sub-status" className="cc-input" value={f.commercialStatus} onChange={(e) => setF({ ...f, commercialStatus: e.target.value })}>{Object.entries(COMMERCIAL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></CField>
      <CField label="Inicio" htmlFor="sub-start"><input id="sub-start" type="date" className="cc-input" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></CField>
      <CField label="Fin del piloto" htmlFor="sub-pilot"><input id="sub-pilot" type="date" className="cc-input" value={f.pilotEndDate} onChange={(e) => setF({ ...f, pilotEndDate: e.target.value })} /></CField>
      <CField label="Próxima renovación" htmlFor="sub-renew"><input id="sub-renew" type="date" className="cc-input" value={f.renewalDate} onChange={(e) => setF({ ...f, renewalDate: e.target.value })} /></CField>
      <div className="grid grid-cols-[1fr_96px] gap-2">
        <CField label="Precio mensual" htmlFor="sub-price"><input id="sub-price" inputMode="decimal" className="cc-input tabular-nums" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value.replace(/[^\d.]/g, '') })} /></CField>
        <CField label="Moneda" htmlFor="sub-cur"><input id="sub-cur" className="cc-input uppercase" maxLength={3} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value.toUpperCase() })} /></CField>
      </div>
      <CField label="Notas internas" htmlFor="sub-notes" className="sm:col-span-2"><textarea id="sub-notes" rows={3} className="cc-input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></CField>
      {err && <p className="sm:col-span-2 text-[12.5px] text-[#FDA29B]" role="alert">{err}</p>}
      <div className="sm:col-span-2 flex items-center justify-between gap-3">
        <p className="text-[11.5px] cc-faint">Sin cobros automáticos. El cobro se gestiona fuera de la plataforma.</p>
        <CButton variant="primary" type="submit">Guardar</CButton>
      </div>
    </form>
  );
}

function Config({ d }: { d: Detail }) {
  const p = d.program;
  return (
    <div className="grid gap-4 md:grid-cols-2 max-w-[880px]">
      <section className="cc-panel p-5">
        <h2 className="text-[14px] font-medium">Programa de lealtad <span className="cc-faint text-[12px] font-normal">· versión {p.version}</span></h2>
        <dl className="mt-4 grid gap-3 text-[13px]">
          <Def k="Sellos para el premio" v={String(p.stampsRequired)} />
          <Def k="Regla" v={p.stampMode === 'per_item' ? `1 sello por artículo (máx. ${p.maxStampsPerPurchase} por compra)` : '1 sello por compra'} />
          <Def k="Ventana de visita" v={`${p.visitWindowMinutes} min`} />
          <Def k="Premio" v={p.rewardDescription} />
        </dl>
        <p className="mt-4 text-[11.5px] cc-faint">El dueño ajusta el programa desde su panel. Así queda registrado quién lo cambió.</p>
      </section>
      <section className="cc-panel p-5">
        <h2 className="text-[14px] font-medium">Marca y reseñas</h2>
        <dl className="mt-4 grid gap-3 text-[13px]">
          <div><dt className="cc-faint text-[12px]">Colores</dt><dd className="mt-1 flex gap-2">{[d.primaryColor, d.accentColor].map((c) => <span key={c} className="inline-flex items-center gap-1.5 font-mono text-[12px]"><span className="h-4 w-4 rounded border border-white/10" style={{ background: c }} />{c}</span>)}</dd></div>
          <Def k="Enlace de reseñas de Google" v={d.reviewUrl ?? 'No configurado'} />
          <Def k="Identificador" v={`/n/${d.slug}`} />
          <Def k="Tipo" v={d.isDemo ? 'Demostración' : 'Negocio real'} />
        </dl>
      </section>
    </div>
  );
}

function StatusModal({ open, d, onClose, onDone }: { open: boolean; d: Detail; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const suspending = d.status === 'active';
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    try {
      const r = await api<{ sessionsRevoked: number }>('POST', `/admin/businesses/${d.id}/status`, { status: suspending ? 'suspended' : 'active', reason, confirm: true });
      toast('good', suspending ? `Servicio suspendido. Se cerraron ${r.sessionsRevoked} sesiones.` : 'Servicio reactivado.');
      setReason(''); setTyped('');
      onDone();
    } catch (x) { setErr((x as ApiError).message); }
  };
  return (
    <CModal open={open} onClose={onClose} title={suspending ? 'Suspender servicio' : 'Reactivar servicio'} labelledBy="cc-status-title">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-[13px] cc-muted">{suspending
          ? 'El personal no podrá entrar, se cerrarán sus sesiones y la página de registro dejará de responder. No se borra ningún dato y se puede revertir.'
          : 'El personal podrá volver a entrar y la página de registro responderá de nuevo.'}</p>
        <CField label="Motivo" htmlFor="st-reason"><input id="st-reason" className="cc-input" value={reason} onChange={(e) => setReason(e.target.value)} /></CField>
        {suspending && <CField label={<>Escribe <span className="font-mono text-white">{d.name}</span> para confirmar</>} htmlFor="st-confirm"><input id="st-confirm" className="cc-input" value={typed} onChange={(e) => setTyped(e.target.value)} /></CField>}
        {err && <p className="text-[12.5px] text-[#FDA29B]" role="alert">{err}</p>}
        <div className="flex justify-end gap-2">
          <CButton type="button" variant="ghost" onClick={onClose}>Cancelar</CButton>
          <CButton type="submit" variant={suspending ? 'danger' : 'primary'} disabled={reason.trim().length < 3 || (suspending && typed.trim() !== d.name)}>{suspending ? 'Suspender' : 'Reactivar'}</CButton>
        </div>
      </form>
    </CModal>
  );
}

function EditModal({ open, d, onClose, onDone }: { open: boolean; d: Detail; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ name: d.name, vertical: d.vertical, city: d.city, primaryColor: d.primaryColor, accentColor: d.accentColor, reviewUrl: d.reviewUrl ?? '', logoDataUrl: d.logoDataUrl });
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    try {
      await api('PATCH', `/admin/businesses/${d.id}`, { ...f, reviewUrl: f.reviewUrl.trim() || null });
      toast('good', 'Cambios guardados.');
      onDone();
    } catch (x) { setErr((x as ApiError).message); }
  };
  return (
    <CModal open={open} onClose={onClose} title="Editar negocio" labelledBy="cc-edit-title" wide>
      <form onSubmit={submit} className="grid sm:grid-cols-2 gap-4">
        <CField label="Nombre" htmlFor="ed-name"><input id="ed-name" className="cc-input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></CField>
        <CField label="Giro" htmlFor="ed-vert"><select id="ed-vert" className="cc-input" value={f.vertical} onChange={(e) => setF({ ...f, vertical: e.target.value as Vertical })}>{Object.entries(VERTICAL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></CField>
        <CField label="Ciudad" htmlFor="ed-city"><input id="ed-city" className="cc-input" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></CField>
        <CField label="Enlace de reseñas (https://)" htmlFor="ed-review"><input id="ed-review" className="cc-input" value={f.reviewUrl} onChange={(e) => setF({ ...f, reviewUrl: e.target.value })} /></CField>
        <ColorField id="ed-primary" label="Color principal" value={f.primaryColor} onChange={(v) => setF({ ...f, primaryColor: v })} />
        <ColorField id="ed-accent" label="Color de acento" value={f.accentColor} onChange={(v) => setF({ ...f, accentColor: v })} />
        <LogoField className="sm:col-span-2" value={f.logoDataUrl} onChange={(v) => setF({ ...f, logoDataUrl: v })} />
        {err && <p className="sm:col-span-2 text-[12.5px] text-[#FDA29B]" role="alert">{err}</p>}
        <div className="sm:col-span-2 flex justify-end gap-2"><CButton type="button" variant="ghost" onClick={onClose}>Cancelar</CButton><CButton type="submit" variant="primary">Guardar</CButton></div>
      </form>
    </CModal>
  );
}

export function ColorField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <CField label={label} htmlFor={id}>
      <div className="flex gap-2">
        <input type="color" aria-label={`${label} (selector)`} className="h-10 w-12 rounded-lg border border-[color:var(--cc-line-strong)] bg-transparent p-1 cursor-pointer" value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'} onChange={(e) => onChange(e.target.value.toUpperCase())} />
        <input id={id} className="cc-input font-mono uppercase" maxLength={7} value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} />
      </div>
    </CField>
  );
}

export function LogoField({ value, onChange, className }: { value: string | null; onChange: (v: string | null) => void; className?: string }) {
  const [err, setErr] = useState<string | null>(null);
  return (
    <CField label="Logotipo (opcional)" htmlFor="logo-file" hint="PNG, JPG o WebP. Se reduce a 256 px en tu navegador." error={err} className={className}>
      <div className="flex items-center gap-3">
        <div className="h-14 w-14 rounded-xl border border-[color:var(--cc-line-strong)] overflow-hidden flex items-center justify-center bg-white/[.02]">
          {value ? <img src={value} alt="Vista previa del logotipo" className="h-full w-full object-contain bg-white" /> : <span className="text-[11px] cc-faint">Sin logo</span>}
        </div>
        <input id="logo-file" type="file" accept="image/png,image/jpeg,image/webp" className="text-[12.5px] cc-muted file:mr-3 file:cc-btn file:h-8 file:px-3 file:rounded-lg file:border file:border-[color:var(--cc-line-strong)] file:bg-transparent file:text-white"
          onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; setErr(null); try { onChange(await prepareLogo(file)); } catch (x) { setErr((x as Error).message); } }} />
        {value && <CButton type="button" small variant="ghost" onClick={() => onChange(null)}>Quitar</CButton>}
      </div>
    </CField>
  );
}
