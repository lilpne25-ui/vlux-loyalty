// Resumen de la plataforma: métricas reales y de demostración por separado, actividad e infraestructura.
import React, { useState } from 'react';
import { ArrowUpRight, Database, Mail, Server, Wallet } from 'lucide-react';
import { api } from '../lib/api';
import { navigate } from '../lib/router';
import { usePolling } from '../lib/usePolling';
import { relativeTime } from '../lib/format';
import { ErrorLine, PageHeader, Pill, Skeleton, actionLabel, cx, num } from './kit';

type Bucket = { businesses: number; active: number; pilot: number; suspended: number; customers: number; cards: number; purchases: number; stamps: number; rewardsRedeemed: number };
export type Overview = {
  real: Bucket; demo: Bucket;
  activity: { businessId: string; businessName: string; isDemo: boolean; action: string; actorType: string; at: string }[];
  platformActivity: { action: string; at: string; businessId: string | null; businessName: string | null; adminName: string | null }[];
  infrastructure: { environment: string; region: string; node: string; database: { ok: boolean; latencyMs: number; schema: string }; emailProvider: string; wallet: { google: string; apple: string } };
};

export function Dashboard() {
  const { data, error, refresh } = usePolling(() => api<Overview>('GET', '/admin/overview'), 30_000, []);
  const [scope, setScope] = useState<'real' | 'demo'>('real');
  const b = data?.[scope];
  return (
    <>
      <PageHeader
        title="Resumen"
        sub="Estado de la plataforma VLUX Loyalty. Se actualiza cada 30 s."
        actions={
          <div className="inline-flex p-0.5 rounded-[10px] border border-[color:var(--cc-line-strong)]" role="tablist" aria-label="Tipo de datos">
            {(['real', 'demo'] as const).map((k) => (
              <button key={k} role="tab" aria-selected={scope === k} onClick={() => setScope(k)} className={cx('h-8 px-3 rounded-lg text-[12.5px] transition', scope === k ? 'bg-white/[.08] text-white' : 'cc-muted hover:text-white')}>
                {k === 'real' ? 'Negocios reales' : 'Demostración'}
              </button>
            ))}
          </div>
        }
      />
      {error && <div className="mb-5"><ErrorLine message={error.message} onRetry={refresh} /></div>}
      {scope === 'demo' && <p className="mb-4 text-[12.5px] cc-muted">Negocios marcados como demostración. No cuentan en las métricas comerciales.</p>}

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3" aria-label="Negocios">
        <Kpi label="Negocios" value={b?.businesses} />
        <Kpi label="Activos (pagando)" value={b?.active} tone="green" />
        <Kpi label="En piloto" value={b?.pilot} tone="cyan" />
        <Kpi label="Suspendidos" value={b?.suspended} tone={b?.suspended ? 'red' : undefined} />
      </section>
      <section className="mt-3 grid grid-cols-2 lg:grid-cols-5 gap-3" aria-label="Operación">
        <Kpi small label="Clientes" value={b?.customers} />
        <Kpi small label="Tarjetas" value={b?.cards} />
        <Kpi small label="Compras" value={b?.purchases} />
        <Kpi small label="Sellos otorgados" value={b?.stamps} />
        <Kpi small label="Premios canjeados" value={b?.rewardsRedeemed} />
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
        <section className="cc-panel overflow-hidden">
          <div className="px-5 py-3.5 flex items-center justify-between border-b border-[color:var(--cc-line)]">
            <h2 className="text-[14px] font-medium">Actividad reciente en los negocios</h2>
            <span className="cc-label">Últimos 15</span>
          </div>
          {!data ? <div className="p-5 flex flex-col gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-5" />)}</div> : data.activity.length === 0 ? (
            <p className="px-5 py-8 text-[13px] cc-muted">Todavía no hay operaciones.</p>
          ) : (
            <ul>
              {data.activity.map((a, i) => (
                <li key={i} className="px-5 py-2.5 flex items-center gap-3 text-[13px] border-b border-[color:var(--cc-line)] last:border-0 hover:bg-white/[.02] cursor-pointer" onClick={() => navigate(`/vlux-admin/negocios/${a.businessId}`)}>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#67C7D3]/70 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{actionLabel(a.action)} <span className="cc-muted">· {a.businessName}</span></span>
                  {a.isDemo && <Pill dot={false}>Demo</Pill>}
                  <span className="cc-faint text-[12px] shrink-0 tabular-nums">{relativeTime(a.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex flex-col gap-4">
          <section className="cc-panel p-5">
            <h2 className="text-[14px] font-medium">Infraestructura</h2>
            {!data ? <Skeleton className="mt-4 h-24" /> : (
              <ul className="mt-4 flex flex-col gap-3 text-[13px]">
                <Infra icon={<Server size={14} />} label="Entorno" value={`${data.infrastructure.environment} · ${data.infrastructure.region}`} ok />
                <Infra icon={<Database size={14} />} label="Base de datos" value={`${data.infrastructure.database.latencyMs} ms`} ok={data.infrastructure.database.ok} />
                <Infra icon={<Mail size={14} />} label="Correo" value={data.infrastructure.emailProvider} warn />
                <Infra icon={<Wallet size={14} />} label="Google Wallet" value={data.infrastructure.wallet.google} warn />
                <Infra icon={<Wallet size={14} />} label="Apple Wallet" value={data.infrastructure.wallet.apple} warn />
              </ul>
            )}
          </section>
          <section className="cc-panel p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[14px] font-medium">Acciones del equipo VLUX</h2>
              <button className="text-[12px] cc-muted hover:text-white inline-flex items-center gap-1" onClick={() => navigate('/vlux-admin/bitacora')}>Bitácora <ArrowUpRight size={12} /></button>
            </div>
            <ul className="mt-3 flex flex-col gap-2.5 text-[12.5px]">
              {(data?.platformActivity ?? []).slice(0, 6).map((a, i) => (
                <li key={i} className="flex gap-2">
                  <span className="cc-faint tabular-nums shrink-0 w-[74px]">{relativeTime(a.at)}</span>
                  <span className="min-w-0 truncate">{actionLabel(a.action)}{a.businessName ? <span className="cc-muted"> · {a.businessName}</span> : null}</span>
                </li>
              ))}
              {data && data.platformActivity.length === 0 && <li className="cc-muted">Sin acciones todavía.</li>}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}

function Kpi({ label, value, tone, small }: { label: string; value: number | undefined; tone?: 'green' | 'cyan' | 'red'; small?: boolean }) {
  const color = tone === 'green' ? 'text-[#47CD89]' : tone === 'cyan' ? 'text-[#67C7D3]' : tone === 'red' ? 'text-[#F97066]' : '';
  return (
    <div className={cx('cc-panel cc-sheen', small ? 'p-4' : 'p-5')}>
      <div className="cc-label">{label}</div>
      {value === undefined ? <Skeleton className="mt-3 h-7 w-16" /> : <div className={cx('cc-kpi mt-3', small && 'text-[22px]', color)} data-testid={`kpi-${label}`}>{num(value)}</div>}
    </div>
  );
}

function Infra({ icon, label, value, ok, warn }: { icon: React.ReactNode; label: string; value: string; ok?: boolean; warn?: boolean }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className={cx('mt-0.5', ok ? 'text-[#47CD89]' : warn ? 'text-[#FDB022]' : 'cc-muted')}>{icon}</span>
      <span className="min-w-0"><span className="cc-muted">{label}</span><span className="block text-[12.5px] break-words">{value}</span></span>
    </li>
  );
}
