// Panel del dueño: métricas reales, clientes, actividad, configuración, equipo y QR del mostrador.
// V0.2: todo viene de la BD de SU negocio (RLS). Ya no hay datos de ejemplo mezclados con datos reales.
import React, { useEffect, useMemo, useState } from 'react';
import { Users, Footprints, Repeat, Gift, Stamp, Star, Settings2, LayoutGrid, ListChecks, Save, RotateCcw, Info, ShoppingBag, Trophy, UserPlus, QrCode, Printer, Download, Trash2, KeyRound, Undo2 } from 'lucide-react';
import { api, ApiError, BusinessInfo, HistoryItem, Program, Vertical } from '../lib/api';
import { relativeTime, businessQrValue } from '../lib/format';
import { usePolling } from '../lib/usePolling';
import { VERTICAL_LABEL } from '../lib/vertical';
import { Badge, Button, Field, inputCls, useToast, cx, Modal, QRCode, BusinessLogo, VluxMark, CopyButton } from '../components/ui';
import { LoyaltyCardFace } from '../components/LoyaltyCard';
import { sanitizeFit } from '../lib/logoFit';
import { AccessCenter, Links } from '../components/AccessCenter';
import { InstallAppButton, useStaffAppHead } from '../components/InstallApp';
import { HistoryTable } from './Employee';
import { brandVars, ErrorBox, Loading } from '../components/Brand';

type Tab = 'resumen' | 'clientes' | 'config' | 'equipo' | 'accesos';
interface Dashboard {
  kpis: { customers: number; newCustomers7d: number; visits: number; purchases: number; stamps: number; recurring: number; rewardsUnlocked: number; redemptions: number; rewardsPending: number; reviewPrompts: number; reviewClicks: number };
  series: { day: string; visits: number; purchases: number }[];
  recurrence: { label: string; value: number }[];
  program: { stampsRequired: number; rewardDescription: string };
  nearReward: string[];
  pendingRewards: string[];
}
type FullBusiness = BusinessInfo & { program: Program & { ruleId: string; version: number; visitWindowMinutes: number } };

export function OwnerView({ onBusinessChanged }: { onBusinessChanged: () => void }) {
  const [tab, setTab] = useState<Tab>('resumen');
  const biz = usePolling(() => api<FullBusiness>('GET', '/staff/business'), 60_000, []);
  useStaffAppHead(biz.data?.slug, 'panel', biz.data?.name);
  if (biz.error && !biz.data) return <div className="gutter py-10"><ErrorBox message={biz.error.message} onRetry={biz.refresh} /></div>;
  if (!biz.data) return <Loading />;
  const b = biz.data;

  return (
    <div className="dash-bg min-h-full">
      <div className="mx-auto w-full max-w-[1180px] gutter py-6 sm:py-8 flex flex-col gap-5">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[12px] uppercase tracking-[0.14em] text-slate2">Panel del negocio</div>
            <h1 className="text-[24px] sm:text-[28px] font-semibold tracking-tight text-ink leading-tight break-words">{b.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-slate2">
              <Badge tone="good"><span className="h-1.5 w-1.5 rounded-full bg-[#12B76A]" /> Programa activo</Badge>
              {b.isDemo && <Badge tone="sample">Negocio de demostración</Badge>}
              <span>{b.program.stampsRequired} sellos = {b.program.rewardDescription.toLowerCase()}</span>
            </div>
          </div>
          <InstallAppButton app="panel" />
        </header>

        <nav className="flex gap-1 border-b border-line -mb-1 overflow-x-auto no-scrollbar" role="tablist" aria-label="Secciones del panel">
          {([
            ['resumen', 'Resumen', <LayoutGrid size={15} key="a" />],
            ['clientes', 'Clientes', <ListChecks size={15} key="b" />],
            ['config', 'Programa', <Settings2 size={15} key="c" />],
            ['equipo', 'Equipo', <Users size={15} key="d" />],
            ['accesos', 'Accesos', <QrCode size={15} key="e" />],
          ] as const).map(([k, label, icon]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cx('h-10 px-3 -mb-px inline-flex items-center gap-1.5 text-[13.5px] font-medium border-b-2 whitespace-nowrap transition shrink-0', tab === k ? 'border-ink text-ink' : 'border-transparent text-slate2 hover:text-ink')}>
              {icon} {label}
            </button>
          ))}
        </nav>

        {tab === 'resumen' && <Summary />}
        {tab === 'clientes' && <Customers />}
        {tab === 'config' && <Settings business={b} onSaved={() => { biz.refresh(); onBusinessChanged(); }} />}
        {tab === 'equipo' && <Team />}
        {tab === 'accesos' && <AccessTab business={b} />}
      </div>
    </div>
  );
}

function Summary() {
  const { data, error, refresh } = usePolling(() => api<Dashboard>('GET', '/owner/dashboard'), 8000, []);
  if (error && !data) return <ErrorBox message={error.message} onRetry={refresh} />;
  if (!data) return <Loading />;
  const k = data.kpis;
  const kpis = [
    { id: 'customers', label: 'Clientes registrados', value: k.customers, icon: <Users size={16} />, hint: `${k.newCustomers7d} nuevos en 7 días` },
    { id: 'visits', label: 'Visitas', value: k.visits, icon: <Footprints size={16} />, hint: 'Ocasiones distintas en el negocio' },
    { id: 'purchases', label: 'Compras', value: k.purchases, icon: <ShoppingBag size={16} />, hint: 'Registradas por caja' },
    { id: 'stamps', label: 'Sellos entregados', value: k.stamps, icon: <Stamp size={16} />, hint: 'Según la regla del programa' },
    { id: 'recurring', label: 'Clientes recurrentes', value: k.recurring, icon: <Repeat size={16} />, hint: k.customers ? `${Math.round((k.recurring / k.customers) * 100)}% volvió en otra visita` : 'Con 2 visitas o más' },
    { id: 'unlocked', label: 'Recompensas desbloqueadas', value: k.rewardsUnlocked, icon: <Trophy size={16} />, hint: `${k.rewardsPending} por entregar` },
    { id: 'redemptions', label: 'Canjes', value: k.redemptions, icon: <Gift size={16} />, hint: 'Recompensas entregadas' },
    { id: 'reviews', label: 'Invitaciones a reseña', value: k.reviewPrompts, icon: <Star size={16} />, hint: `${k.reviewClicks} abrieron el enlace` },
  ];
  const days = data.series.map((d) => ({ label: new Date(d.day + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }), visits: d.visits, purchases: d.purchases }));
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((x) => (
          <div key={x.id} className="panel p-4 sm:p-5 flex flex-col gap-2 min-w-0" data-testid={`kpi-${x.id}`}>
            <div className="flex items-start justify-between gap-2 text-[12.5px] text-slate2">
              <span className="leading-tight">{x.label}</span>
              <span className="h-7 w-7 shrink-0 rounded-lg bg-[#F1F3F6] inline-flex items-center justify-center text-[#475467]">{x.icon}</span>
            </div>
            <div className="text-[28px] sm:text-[32px] font-semibold tracking-tight text-ink tabular-nums leading-none kpi-num" data-testid={`kpi-${x.id}-value`} key={x.value}>{x.value}</div>
            <div className="text-[12px] text-slate2 leading-snug">{x.hint}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="panel p-4 sm:p-5 min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[15px] font-semibold text-ink">Visitas por día</h2>
            <div className="flex items-center gap-3 text-[12px] text-slate2">
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-ink" /> Visitas</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#9FD8E0]" /> Compras</span>
            </div>
          </div>
          <p className="text-[12.5px] text-slate2 mt-0.5">Últimos 14 días (hora del centro de México)</p>
          <VisitsChart days={days} />
        </section>
        <section className="panel p-4 sm:p-5 min-w-0">
          <h2 className="text-[15px] font-semibold text-ink">Recurrencia</h2>
          <p className="text-[12.5px] text-slate2 mt-0.5">Clientes según sus visitas</p>
          <RecurrenceChart buckets={data.recurrence} />
        </section>
      </div>

      <section className="panel p-4 sm:p-5">
        <h2 className="text-[15px] font-semibold text-ink">Estado del programa</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl bg-[#F6F7F9] p-4">
            <div className="text-[12px] text-slate2">Regla vigente</div>
            <div className="mt-1 text-[14px] text-ink font-medium">{data.program.stampsRequired} sellos = {data.program.rewardDescription.toLowerCase()}</div>
          </div>
          <div className="rounded-xl bg-[#FDF8EF] p-4 min-w-0">
            <div className="text-[12px] text-[#7A5A1F]">Premios por entregar</div>
            <div className="mt-1 text-[22px] font-semibold text-[#5C4314] tabular-nums">{k.rewardsPending}</div>
            <div className="mt-1 text-[12px] text-[#7A5A1F] break-words">{data.pendingRewards.join(', ') || 'Ninguno'}</div>
          </div>
          <div className="rounded-xl bg-[#EEF8FA] p-4 min-w-0">
            <div className="text-[12px] text-[#0E6874]">A 1 o 2 sellos del premio</div>
            <div className="mt-1 text-[22px] font-semibold text-[#0B4F58] tabular-nums">{data.nearReward.length}</div>
            <div className="mt-1 text-[12px] text-[#0E6874] break-words">{data.nearReward.join(', ') || 'Ninguno'}</div>
          </div>
        </div>
      </section>
    </div>
  );
}

function niceMax(v: number) {
  if (v <= 4) return 4;
  if (v <= 6) return 6;
  if (v <= 8) return 8;
  if (v <= 10) return 10;
  return Math.ceil(v / 5) * 5;
}

function VisitsChart({ days }: { days: { label: string; visits: number; purchases: number }[] }) {
  const W = 640, H = 220, padL = 28, padB = 26, padT = 10, padR = 6;
  const max = niceMax(Math.max(...days.map((d) => Math.max(d.visits, d.purchases)), 1));
  const cw = (W - padL - padR) / days.length;
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  const ticks = [0, max / 2, max];
  return (
    <div className="mt-4 overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto min-w-[420px]" role="img" aria-label="Gráfica de visitas y compras por día">
        {ticks.map((t) => (<g key={t}><line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="#EEF0F3" /><text x={padL - 8} y={y(t) + 4} textAnchor="end" fontSize="10.5" fill="#98A2B3">{t}</text></g>))}
        {days.map((d, i) => {
          const w = cw * 0.3;
          const x1 = padL + i * cw + cw * 0.18;
          const x2 = x1 + w + 1;
          const isToday = i === days.length - 1;
          return (
            <g key={i}>
              {d.visits > 0 && <rect x={x1} y={y(d.visits)} width={w} height={H - padB - y(d.visits)} rx={2} fill="#0E1013" className="bar-grow" />}
              {d.purchases > 0 && <rect x={x2} y={y(d.purchases)} width={w} height={H - padB - y(d.purchases)} rx={2} fill="#9FD8E0" className="bar-grow" />}
              {d.visits > 0 && <text x={x1 + w / 2} y={y(d.visits) - 5} textAnchor="middle" fontSize="10" fill="#475467">{d.visits}</text>}
              {(i % 2 === 1 || isToday) && <text x={x1 + w} y={H - 8} textAnchor="middle" fontSize="10" fill={isToday ? '#0E1013' : '#98A2B3'} fontWeight={isToday ? 600 : 400}>{isToday ? 'Hoy' : d.label}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function RecurrenceChart({ buckets }: { buckets: { label: string; value: number }[] }) {
  const max = Math.max(...buckets.map((b) => b.value), 1);
  const total = buckets.reduce((a, b) => a + b.value, 0);
  return (
    <div className="mt-5 flex flex-col gap-3">
      {buckets.map((b, i) => (
        <div key={b.label} className="grid grid-cols-[104px_minmax(0,1fr)_40px] items-center gap-3 text-[12.5px]">
          <span className="text-[#475467] leading-tight">{b.label}</span>
          <div className="h-6 rounded-md bg-[#F4F5F7] overflow-hidden"><div className="h-full rounded-md transition-[width] duration-700" style={{ width: `${(b.value / max) * 100}%`, background: i >= 2 ? '#2E90A0' : '#B9C0C9', opacity: i >= 2 ? 0.7 + i * 0.1 : 1 }} /></div>
          <span className="text-right tabular-nums text-ink font-medium">{b.value}</span>
        </div>
      ))}
      <p className="text-[12px] text-slate2 pt-1">Total: {total} clientes. En azul, los que ya regresaron.</p>
    </div>
  );
}

interface CustomerRow { cardId: string; customerId: string; publicCode: string; customerName: string; balance: number; visits: number; purchases: number; redeemed: number; hasReward: boolean; contactType: string | null; marketingConsent: boolean; anonymized: boolean; lastVisitAt: string | null }

function Customers() {
  const list = usePolling(() => api<{ customers: CustomerRow[] }>('GET', '/owner/customers'), 15_000, []);
  const act = usePolling(() => api<{ items: HistoryItem[] }>('GET', '/owner/activity?limit=30'), 8000, []);
  const [toDelete, setToDelete] = useState<CustomerRow | null>(null);
  const [toVoid, setToVoid] = useState<HistoryItem | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const toast = useToast();
  const voidPurchase = async () => {
    if (!toVoid?.purchaseId) return;
    try {
      const r = await api<{ stampsRemoved: number; rewardVoided: boolean }>('POST', `/owner/purchases/${toVoid.purchaseId}/void`, { reason: voidReason });
      toast('good', `Compra anulada: se quitaron ${r.stampsRemoved} sello(s)${r.rewardVoided ? ' y la recompensa pendiente' : ''}.`);
      setToVoid(null); setVoidReason('');
      act.refresh(); list.refresh();
    } catch (e) {
      toast('bad', (e as ApiError).message);
    }
  };
  const exportData = async (c: CustomerRow) => {
    try {
      const data = await api('GET', `/owner/customers/${c.customerId}/export`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `cliente-${c.publicCode}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      toast('bad', (e as ApiError).message);
    }
  };
  const anonymize = async () => {
    if (!toDelete) return;
    try {
      await api('POST', `/owner/customers/${toDelete.customerId}/anonymize`, {});
      toast('good', 'Datos personales eliminados. Las estadísticas se conservan sin nombre.');
      setToDelete(null);
      list.refresh();
    } catch (e) {
      toast('bad', (e as ApiError).message);
    }
  };
  const rows = list.data?.customers ?? [];
  return (
    <>
      <section className="panel overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 border-b border-line flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-ink">Clientes</h2>
          <span className="text-[12.5px] text-slate2 tabular-nums">{rows.length} tarjetas</span>
        </div>
        {list.error && <div className="p-4"><ErrorBox message={list.error.message} onRetry={list.refresh} /></div>}
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[760px]">
            <thead>
              <tr className="text-left text-[11.5px] uppercase tracking-[0.08em] text-slate2 bg-[#FAFBFC]">
                <th className="font-medium px-4 sm:px-5 py-2.5">Cliente</th>
                <th className="font-medium px-3 py-2.5 text-right">Sellos</th>
                <th className="font-medium px-3 py-2.5 text-right">Visitas</th>
                <th className="font-medium px-3 py-2.5 text-right">Compras</th>
                <th className="font-medium px-3 py-2.5 text-right">Canjes</th>
                <th className="font-medium px-3 py-2.5">Contacto</th>
                <th className="font-medium px-3 py-2.5">Última visita</th>
                <th className="font-medium px-4 sm:px-5 py-2.5 text-right">Datos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((c) => (
                <tr key={c.cardId} className={cx(c.anonymized && 'opacity-50')}>
                  <td className="px-4 sm:px-5 py-2.5"><div className="font-medium text-ink whitespace-nowrap">{c.customerName}</div><div className="text-[11.5px] font-mono text-slate2">{c.publicCode}</div></td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{c.hasReward ? <Badge tone="gold">Premio listo</Badge> : c.balance}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{c.visits}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{c.purchases}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{c.redeemed}</td>
                  <td className="px-3 py-2.5 text-slate2 whitespace-nowrap">{c.contactType ? (c.contactType === 'email' ? 'Correo' : 'WhatsApp') : '–'}{c.marketingConsent && <span className="ml-1.5 text-[11px] text-[#067647]">acepta promos</span>}</td>
                  <td className="px-3 py-2.5 text-slate2 whitespace-nowrap">{c.lastVisitAt ? relativeTime(c.lastVisitAt) : 'Sin visitas'}</td>
                  <td className="px-4 sm:px-5 py-2.5 text-right whitespace-nowrap">
                    {!c.anonymized && (<>
                      <button className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-slate2 hover:bg-black/5" title="Descargar datos del cliente" aria-label={`Descargar datos de ${c.customerName}`} onClick={() => exportData(c)}><Download size={15} /></button>
                      <button className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-[#B42318] hover:bg-[#FEF3F2]" title="Eliminar datos personales" aria-label={`Eliminar datos de ${c.customerName}`} onClick={() => setToDelete(c)}><Trash2 size={15} /></button>
                    </>)}
                  </td>
                </tr>
              ))}
              {!rows.length && !list.loading && <tr><td colSpan={8} className="px-5 py-6 text-center text-slate2">Aún no hay clientes. Imprime el QR del mostrador para empezar.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <HistoryTable items={act.data?.items ?? []} title="Actividad reciente" showCustomer onVoid={(item) => { setToVoid(item); setVoidReason(''); }} />
      <Modal open={!!toVoid} onClose={() => setToVoid(null)} title="Anular compra" labelledBy="void-title">
        <p className="text-[14px] text-[#475467]">Se quitarán {toVoid?.stamps ?? 0} sello(s) de <strong>{toVoid?.customerName}</strong>. La compra queda registrada como anulada con tu nombre y el motivo. Si esos sellos ya se usaron en un canje, no se puede anular.</p>
        <div className="mt-4"><Field label="Motivo" htmlFor="void-reason"><input id="void-reason" className={inputCls} value={voidReason} maxLength={200} placeholder="Ej. se registró dos veces" onChange={(e) => setVoidReason(e.target.value)} /></Field></div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => setToVoid(null)}>Cancelar</Button>
          <Button variant="danger" onClick={voidPurchase} disabled={voidReason.trim().length < 3}><Undo2 size={15} /> Anular compra</Button>
        </div>
      </Modal>
      <Modal open={!!toDelete} onClose={() => setToDelete(null)} title="Eliminar datos personales" labelledBy="del-title">
        <p className="text-[14px] text-[#475467]">Se borran el nombre y contacto de <strong>{toDelete?.customerName}</strong>, su tarjeta deja de funcionar y su premio pendiente se anula. Las cifras del panel se conservan sin datos personales. No se puede deshacer.</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => setToDelete(null)}>Cancelar</Button>
          <Button variant="danger" onClick={anonymize}><Trash2 size={15} /> Eliminar</Button>
        </div>
      </Modal>
    </>
  );
}

const PRESETS = [
  { name: 'Espresso', primary: '#2B1B14', accent: '#C9A15B' },
  { name: 'Olivo', primary: '#26301F', accent: '#D2B26B' },
  { name: 'Grafito', primary: '#14171C', accent: '#B9C0C9' },
  { name: 'Terracota', primary: '#5A2A1C', accent: '#E8C9A0' },
  { name: 'Marino', primary: '#152238', accent: '#D9B26F' },
];

function Settings({ business: b, onSaved }: { business: FullBusiness; onSaved: () => void }) {
  const toast = useToast();
  const initial = useMemo(() => ({
    name: b.name, vertical: b.vertical, primaryColor: b.primaryColor, accentColor: b.accentColor, reviewUrl: b.reviewUrl ?? '',
    stampsRequired: b.program.stampsRequired, stampMode: b.program.stampMode, maxStampsPerPurchase: b.program.maxStampsPerPurchase,
    visitWindowMinutes: b.program.visitWindowMinutes, rewardDescription: b.program.rewardDescription,
  }), [b]);
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setForm(initial), [initial]);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => { setForm((f) => ({ ...f, [k]: v })); setError(null); };
  const dirty = (Object.keys(form) as (keyof typeof form)[]).some((k) => form[k] !== initial[k]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api('PUT', '/owner/program', {
        name: form.name, vertical: form.vertical, primaryColor: form.primaryColor, accentColor: form.accentColor, reviewUrl: form.reviewUrl.trim() || null,
        rules: { stampsRequired: Number(form.stampsRequired), stampMode: form.stampMode, maxStampsPerPurchase: form.stampMode === 'per_item' ? Number(form.maxStampsPerPurchase) : 1, visitWindowMinutes: Number(form.visitWindowMinutes), rewardDescription: form.rewardDescription },
      });
      toast('good', r.rewardsUnlocked ? `Programa actualizado. ${r.rewardsUnlocked} tarjeta(s) desbloquearon su recompensa.` : 'Programa actualizado. Las tarjetas ya muestran los cambios.');
      onSaved();
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
      <section className="panel p-4 sm:p-6 flex flex-col gap-5">
        <h2 className="text-[15px] font-semibold text-ink">Programa de recompensas</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Nombre comercial" htmlFor="set-name"><input id="set-name" className={inputCls} value={form.name} maxLength={60} onChange={(e) => set('name', e.target.value)} /></Field>
          <Field label="Giro" htmlFor="set-vertical" hint="Ajusta los textos que ve el cliente.">
            <select id="set-vertical" className={inputCls} value={form.vertical} onChange={(e) => set('vertical', e.target.value as Vertical)}>
              {(Object.keys(VERTICAL_LABEL) as Vertical[]).map((v) => <option key={v} value={v}>{VERTICAL_LABEL[v]}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Sellos necesarios" htmlFor="set-stamps" hint="Entre 3 y 15. Los premios ya ganados se respetan.">
            <div className="flex items-center gap-2">
              <button type="button" className="h-11 w-11 rounded-xl border border-line bg-white text-[18px] hover:bg-[#F6F7F9]" onClick={() => set('stampsRequired', Math.max(3, Number(form.stampsRequired) - 1))} aria-label="Menos sellos">−</button>
              <input id="set-stamps" type="number" min={3} max={15} className={cx(inputCls, 'text-center tabular-nums w-20')} value={form.stampsRequired} onChange={(e) => set('stampsRequired', Number(e.target.value))} />
              <button type="button" className="h-11 w-11 rounded-xl border border-line bg-white text-[18px] hover:bg-[#F6F7F9]" onClick={() => set('stampsRequired', Math.min(15, Number(form.stampsRequired) + 1))} aria-label="Más sellos">+</button>
            </div>
          </Field>
          <Field label="Recompensa" htmlFor="set-reward"><input id="set-reward" className={inputCls} value={form.rewardDescription} maxLength={80} onChange={(e) => set('rewardDescription', e.target.value)} /></Field>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="¿Cómo se ganan los sellos?" htmlFor="set-mode">
            <select id="set-mode" className={inputCls} value={form.stampMode} onChange={(e) => set('stampMode', e.target.value as 'per_purchase' | 'per_item')}>
              <option value="per_purchase">1 sello por compra</option>
              <option value="per_item">1 sello por artículo (con tope)</option>
            </select>
          </Field>
          {form.stampMode === 'per_item' ? (
            <Field label="Tope de sellos por compra" htmlFor="set-max"><input id="set-max" type="number" min={1} max={10} className={cx(inputCls, 'tabular-nums w-24')} value={form.maxStampsPerPurchase} onChange={(e) => set('maxStampsPerPurchase', Number(e.target.value))} /></Field>
          ) : (
            <Field label="Una visita dura hasta" htmlFor="set-window" hint="Compras dentro de este tiempo cuentan como la misma visita.">
              <select id="set-window" className={inputCls} value={form.visitWindowMinutes} onChange={(e) => set('visitWindowMinutes', Number(e.target.value))}>
                {[30, 60, 120, 240].map((m) => <option key={m} value={m}>{m < 60 ? `${m} minutos` : `${m / 60} ${m === 60 ? 'hora' : 'horas'}`}</option>)}
              </select>
            </Field>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium text-ink">Colores de la marca</span>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button type="button" key={p.name} onClick={() => setForm((f) => ({ ...f, primaryColor: p.primary, accentColor: p.accent }))} className={cx('inline-flex items-center gap-2 rounded-full border px-2.5 h-8 text-[12.5px]', form.primaryColor === p.primary && form.accentColor === p.accent ? 'border-ink text-ink' : 'border-line text-slate2 hover:border-[#C9CED6]')}>
                <span className="relative h-4 w-6"><span className="absolute left-0 h-4 w-4 rounded-full border border-black/10" style={{ background: p.primary }} /><span className="absolute left-2.5 h-4 w-4 rounded-full border border-black/10" style={{ background: p.accent }} /></span>
                {p.name}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 mt-1">
            <label htmlFor="set-primary" className="flex items-center gap-2 rounded-xl border border-line px-3 h-11 text-[13px] text-slate2 min-w-0"><input id="set-primary" type="color" value={form.primaryColor} onChange={(e) => set('primaryColor', e.target.value)} className="h-6 w-8 rounded border-0 bg-transparent p-0" /> Principal <span className="ml-auto font-mono text-[12px] text-ink">{form.primaryColor.toUpperCase()}</span></label>
            <label htmlFor="set-accent" className="flex items-center gap-2 rounded-xl border border-line px-3 h-11 text-[13px] text-slate2 min-w-0"><input id="set-accent" type="color" value={form.accentColor} onChange={(e) => set('accentColor', e.target.value)} className="h-6 w-8 rounded border-0 bg-transparent p-0" /> Acento <span className="ml-auto font-mono text-[12px] text-ink">{form.accentColor.toUpperCase()}</span></label>
          </div>
        </div>
        <Field label="Enlace para reseñas de Google (opcional)" htmlFor="set-review" hint="En Google Business Profile: “Pedir reseñas” copia el enlace directo. Si lo dejas vacío no se invita a reseñar.">
          <input id="set-review" className={cx(inputCls, 'text-[13.5px]')} value={form.reviewUrl} placeholder="https://g.page/r/..." onChange={(e) => set('reviewUrl', e.target.value)} />
        </Field>
        <div className="rounded-xl bg-[#F6F7F9] px-3.5 py-3 text-[12.5px] text-[#475467] flex gap-2 leading-snug">
          <Info size={15} className="shrink-0 mt-[1px]" />
          <span>La invitación a reseñar aparece igual para todos los clientes desde su segunda visita. No se filtran opiniones ni se premia dejar reseña, porque las políticas de Google lo prohíben.</span>
        </div>
        {error && <p className="text-[13px] text-[#B42318]" role="alert">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!dirty || busy}><Save size={16} /> {busy ? 'Guardando…' : 'Guardar cambios'}</Button>
          <Button type="button" variant="ghost" disabled={!dirty} onClick={() => setForm(initial)}><RotateCcw size={15} /> Descartar</Button>
        </div>
      </section>
      <aside className="flex flex-col gap-3 lg:sticky lg:top-[84px]" data-vertical={form.vertical}>
        <div className="text-[12px] uppercase tracking-[0.14em] text-slate2">Así lo verá el cliente</div>
        <div style={brandVars(form.primaryColor, form.accentColor, b.cardFinish)}>
          <LoyaltyCardFace logoUrl={b.logoUrl} logoFit={sanitizeFit(b.logoFit)} businessName={form.name || 'Tu negocio'} customerName="Cliente de ejemplo" cardId="XXXX-XXXX" total={Math.min(15, Math.max(3, Number(form.stampsRequired) || 8))} filled={3} compact />
        </div>
        <p className="text-[12px] text-slate2">Vista previa sin guardar. Al guardar se aplica en todas las tarjetas.</p>
      </aside>
    </form>
  );
}

function Team() {
  const { data, error, refresh } = usePolling(() => api<{ staff: { membershipId: string; role: string; active: boolean; email: string; displayName: string }[] }>('GET', '/owner/staff'), 30_000, []);
  const [form, setForm] = useState({ displayName: '', email: '', password: '' });
  const [msg, setMsg] = useState<string | null>(null);
  const [reset, setReset] = useState<{ name: string; link: string } | null>(null);
  const [mode, setMode] = useState<'link' | 'password'>('link');
  const [invite, setInvite] = useState<{ name: string; link: string } | null>(null);
  const { data: invites, refresh: refreshInvites } = usePolling(() => api<{ invitations: { id: string; email: string; displayName: string; status: string }[] }>('GET', '/owner/invitations'), 60_000, []);
  const toast = useToast();
  const inviteByLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      const r = await api<{ link: string }>('POST', '/owner/invitations', { email: form.email, displayName: form.displayName });
      setInvite({ name: form.displayName, link: r.link });
      setForm({ displayName: '', email: '', password: '' });
      refreshInvites();
    } catch (err) {
      setMsg((err as ApiError).message);
    }
  };
  const inviteAction = async (id: string, name: string, what: 'resend' | 'revoke') => {
    try {
      const r = await api<{ link?: string }>('POST', `/owner/invitations/${id}/${what}`);
      if (r.link) setInvite({ name, link: r.link }); else toast('good', 'Invitación revocada.');
      refreshInvites();
    } catch (err) {
      toast('bad', (err as ApiError).message);
    }
  };
  const issueReset = async (id: string, name: string) => {
    try {
      const r = await api<{ resetLink: string }>('POST', `/owner/staff/${id}/reset-link`);
      setReset({ name, link: r.resetLink });
    } catch (err) {
      toast('bad', (err as ApiError).message);
    }
  };
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      await api('POST', '/owner/staff', form);
      toast('good', `${form.displayName} ya puede entrar a la caja con su correo y contraseña.`);
      setForm({ displayName: '', email: '', password: '' });
      refresh();
    } catch (err) {
      setMsg((err as ApiError).message);
    }
  };
  const toggle = async (id: string, active: boolean) => {
    try {
      await api('PATCH', `/owner/staff/${id}`, { active });
      refresh();
    } catch (err) {
      toast('bad', (err as ApiError).message);
    }
  };
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
      <section className="panel overflow-hidden">
        <div className="px-4 sm:px-5 py-3.5 border-b border-line"><h2 className="text-[15px] font-semibold text-ink">Equipo</h2></div>
        {error && <div className="p-4"><ErrorBox message={error.message} onRetry={refresh} /></div>}
        <ul className="divide-y divide-line">
          {(data?.staff ?? []).map((s) => (
            <li key={s.membershipId} className="px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[14px] font-medium text-ink">{s.displayName} <span className="ml-1"><Badge tone={s.role === 'OWNER' ? 'gold' : 'neutral'}>{s.role === 'OWNER' ? 'Dueño' : 'Empleado'}</Badge></span></div>
                <div className="text-[12.5px] text-slate2 break-all">{s.email}</div>
              </div>
              {s.role !== 'OWNER' && (
                <div className="flex flex-wrap gap-2">
                  {s.active && <Button size="sm" variant="secondary" onClick={() => issueReset(s.membershipId, s.displayName)}><KeyRound size={14} /> Nueva contraseña</Button>}
                  <Button size="sm" variant={s.active ? 'secondary' : 'primary'} onClick={() => toggle(s.membershipId, !s.active)}>{s.active ? 'Desactivar' : 'Reactivar'}</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
      <div className="flex flex-col gap-5">
      <form onSubmit={mode === 'link' ? inviteByLink : add} className="panel p-4 sm:p-5 flex flex-col gap-4">
        <h2 className="text-[15px] font-semibold text-ink inline-flex items-center gap-2"><UserPlus size={16} /> Agregar empleado</h2>
        <div className="grid grid-cols-2 p-0.5 rounded-xl bg-[#F1F3F6] text-[12.5px]" role="tablist" aria-label="Forma de alta">
          <button type="button" role="tab" aria-selected={mode === 'link'} onClick={() => { setMode('link'); setMsg(null); }} className={cx('h-8 rounded-[10px] transition', mode === 'link' ? 'bg-white shadow-sm text-ink font-medium' : 'text-slate2')}>Invitar por enlace</button>
          <button type="button" role="tab" aria-selected={mode === 'password'} onClick={() => { setMode('password'); setMsg(null); }} className={cx('h-8 rounded-[10px] transition', mode === 'password' ? 'bg-white shadow-sm text-ink font-medium' : 'text-slate2')}>Contraseña temporal</button>
        </div>
        <Field label="Nombre" htmlFor="emp-name"><input id="emp-name" className={inputCls} value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></Field>
        <Field label="Correo" htmlFor="emp-email"><input id="emp-email" type="email" className={inputCls} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        {mode === 'password' && <Field label="Contraseña inicial" htmlFor="emp-pass" hint="Mínimo 10 caracteres. Es temporal: al entrar, el empleado elige la suya."><input id="emp-pass" type="password" autoComplete="new-password" className={inputCls} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>}
        {msg && <p className="text-[13px] text-[#B42318]" role="alert">{msg}</p>}
        <Button type="submit" disabled={form.displayName.trim().length < 2 || !form.email || (mode === 'password' && form.password.length < 10)}>{mode === 'link' ? 'Generar invitación' : 'Agregar'}</Button>
        <p className="text-[11.5px] text-slate2">{mode === 'link' ? 'El empleado abre el enlace, elige su contraseña y entra a la caja. Sirve una vez y vence en 72 h.' : 'Los empleados solo ven la caja: no tienen acceso a este panel ni a la configuración.'}</p>
      </form>
      {(invites?.invitations ?? []).some((i) => i.status === 'pendiente' || i.status === 'vencida') && (
        <section className="panel overflow-hidden">
          <div className="px-4 sm:px-5 py-3 border-b border-line text-[14px] font-semibold text-ink">Invitaciones pendientes</div>
          <ul className="divide-y divide-line" data-testid="owner-invitations">
            {invites!.invitations.filter((i) => i.status === 'pendiente' || i.status === 'vencida').map((i) => (
              <li key={i.id} className="px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0"><div className="text-[13.5px] text-ink">{i.displayName} <Badge tone={i.status === 'vencida' ? 'warn' : 'info'}>{i.status}</Badge></div><div className="text-[12px] text-slate2 break-all">{i.email}</div></div>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="secondary" onClick={() => inviteAction(i.id, i.displayName, 'resend')}>Nuevo enlace</Button>
                  {i.status === 'pendiente' && <Button size="sm" variant="ghost" onClick={() => inviteAction(i.id, i.displayName, 'revoke')}>Revocar</Button>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      </div>
      <Modal open={!!invite} onClose={() => setInvite(null)} title="Invitación para tu empleado" labelledBy="invite-title">
        <p className="text-[14px] text-[#475467]">Envíale este enlace a <strong>{invite?.name}</strong> (WhatsApp o en persona) o que escanee el código. VLUX no envía correos. Sirve una sola vez y vence en 72 horas.</p>
        {invite && <div className="mt-4 flex flex-col items-center gap-3"><QRCode value={invite.link} size={168} label="Código de la invitación" /><span className="text-[11px] font-mono text-slate2 break-all select-all text-center" data-testid="employee-invite-link">{invite.link}</span><CopyButton text={invite.link} /></div>}
      </Modal>
      <Modal open={!!reset} onClose={() => setReset(null)} title="Enlace para nueva contraseña" labelledBy="reset-title">
        <p className="text-[14px] text-[#475467]">Envíale este enlace a <strong>{reset?.name}</strong> o que escanee el código. Sirve una sola vez durante 60 minutos y cierra sus sesiones abiertas.</p>
        {reset && <div className="mt-4 flex flex-col items-center gap-3"><QRCode value={reset.link} size={168} label="Código del enlace para nueva contraseña" /><span className="text-[11px] font-mono text-slate2 break-all select-all text-center" data-testid="reset-link">{reset.link}</span><CopyButton text={reset.link} /></div>}
      </Modal>
    </div>
  );
}

function AccessTab({ business: b }: { business: FullBusiness }) {
  const [links, setLinks] = useState<Links | null>(null);
  useEffect(() => { api<Links>('GET', `/public/businesses/${b.slug}/access`).then(setLinks).catch(() => setLinks(null)); }, [b.slug]);
  return (
    <div className="flex flex-col gap-8">
      {links && <AccessCenter businessName={b.name} slug={b.slug} links={links} />}
      <div>
        <h2 className="text-[18px] font-semibold text-ink mb-1">Cartel para el mostrador</h2>
        <p className="text-[13.5px] text-slate2 mb-4">El QR de clientes listo para imprimir.</p>
        <CounterQr business={b} />
      </div>
    </div>
  );
}

function CounterQr({ business: b }: { business: FullBusiness }) {
  const url = businessQrValue(b.slug);
  return (
    <section className="flex flex-col items-center gap-4">
      <div className="print-area w-full max-w-[420px] rounded-[28px] p-8 text-center text-[color:var(--cream)] shadow-xl" data-vertical={b.vertical} style={{ ...brandVars(b.primaryColor, b.accentColor, b.cardFinish), background: 'var(--brand)' }}>
        <div className="flex justify-center"><BusinessLogo name={b.name} size={56} src={b.logoUrl} /></div>
        <div className="mt-3 font-display text-[24px] leading-tight">{b.name}</div>
        <div className="mt-1 text-[14px] opacity-80">Escanea y obtén tu tarjeta de recompensas</div>
        <div className="mt-5 mx-auto w-[240px] max-w-full rounded-2xl bg-white p-3"><QRCode value={url} size={216} label={`QR de registro de ${b.name}`} /></div>
        <div className="mt-4 text-[13px] opacity-80">{b.program.stampsRequired} sellos = {b.program.rewardDescription.toLowerCase()}</div>
        <div className="mt-1 text-[11px] opacity-60">Sin app · Sin contraseña</div>
        <div className="mt-5 flex justify-center"><VluxMark tone="chip" className="text-[color:var(--cream)] opacity-90" /></div>
      </div>
      <p className="text-[12.5px] text-slate2 font-mono break-all text-center">{url}</p>
      <Button variant="secondary" onClick={() => window.print()}><Printer size={16} /> Imprimir</Button>
    </section>
  );
}
