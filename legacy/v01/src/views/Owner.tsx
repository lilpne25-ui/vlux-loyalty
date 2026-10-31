// Panel del dueño: métricas, gráficas, clientes, actividad y configuración del programa.
import React, { useEffect, useMemo, useState } from 'react';
import { Users, Footprints, Repeat, Gift, Stamp, Star, Settings2, LayoutGrid, ListChecks, Save, RotateCcw, Info, ShieldCheck } from 'lucide-react';
import { State, Command, Result, metrics, visitsByDay, recurrenceBuckets, customerOf, progressOf, relativeTime, Business, redeemedRewardsOf } from '../domain/model';
import { Badge, SampleBadge, Switch, Button, Field, inputCls, useToast, cx } from '../components/ui';
import { LoyaltyCardFace } from '../components/LoyaltyCard';
import { HistoryTable } from './Employee';

type Props = { state: State; run: (c: Command) => Result };

export function OwnerView({ state, run }: Props) {
  const [tab, setTab] = useState<'resumen' | 'clientes' | 'config'>('resumen');
  const [includeSample, setIncludeSample] = useState(true);

  useEffect(() => {
    const mine = state.myCardId;
    if (mine && redeemedRewardsOf(state, mine).length) run({ type: 'demoFlag', flag: 'ownerAfterRedeem' });
  }, [state, run]);

  return (
    <div className="dash-bg min-h-full">
      <div className="mx-auto w-full max-w-[1180px] gutter py-6 sm:py-8 flex flex-col gap-5">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[12px] uppercase tracking-[0.14em] text-slate2">Panel del negocio</div>
            <h1 className="text-[24px] sm:text-[28px] font-semibold tracking-tight text-ink truncate">{state.business.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-slate2">
              <Badge tone="good"><span className="h-1.5 w-1.5 rounded-full bg-[#12B76A]" /> Programa activo</Badge>
              <span>{state.business.stampsRequired} sellos = {state.business.rewardDescription.toLowerCase()}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-xl bg-white border border-line px-3 py-2">
              <Switch id="include-sample" checked={includeSample} onChange={setIncludeSample} label="Incluir datos de ejemplo" />
            </div>
          </div>
        </header>

        <nav className="flex gap-1 border-b border-line -mb-1 overflow-x-auto" role="tablist">
          {([
            ['resumen', 'Resumen', <LayoutGrid size={15} key="a" />],
            ['clientes', 'Clientes y actividad', <ListChecks size={15} key="b" />],
            ['config', 'Configuración', <Settings2 size={15} key="c" />],
          ] as const).map(([k, label, icon]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cx('h-10 px-3 -mb-px inline-flex items-center gap-1.5 text-[13.5px] font-medium border-b-2 whitespace-nowrap transition', tab === k ? 'border-ink text-ink' : 'border-transparent text-slate2 hover:text-ink')}>
              {icon} {label}
            </button>
          ))}
        </nav>

        {tab === 'resumen' && <Summary state={state} includeSample={includeSample} />}
        {tab === 'clientes' && (
          <>
            <CustomersTable state={state} includeSample={includeSample} />
            <HistoryTable state={state} limit={25} title="Actividad reciente" includeSample={includeSample} />
          </>
        )}
        {tab === 'config' && <Settings state={state} run={run} />}

        <SecurityNote />
      </div>
    </div>
  );
}

function Summary({ state, includeSample }: { state: State; includeSample: boolean }) {
  const m = metrics(state, includeSample);
  const live = metrics(state, false);
  const kpis = [
    { label: 'Clientes registrados', value: m.customers, live: live.customers, icon: <Users size={16} />, hint: `${m.newCustomers7d} nuevos en 7 días` },
    { label: 'Visitas registradas', value: m.visits, live: live.visits, icon: <Footprints size={16} />, hint: 'Cada visita autorizada por caja' },
    { label: 'Clientes recurrentes', value: m.recurring, live: live.recurring, icon: <Repeat size={16} />, hint: m.customers ? `${Math.round((m.recurring / m.customers) * 100)}% volvió 2 veces o más` : 'Volvieron 2 veces o más' },
    { label: 'Recompensas canjeadas', value: m.redeemed, live: live.redeemed, icon: <Gift size={16} />, hint: m.activeRewards === 1 ? '1 pendiente de canje' : `${m.activeRewards} pendientes de canje` },
    { label: 'Sellos entregados', value: m.stamps, live: live.stamps, icon: <Stamp size={16} />, hint: '1 compra válida = 1 sello' },
    { label: 'Invitaciones a reseña', value: m.reviewPrompts, live: live.reviewPrompts, icon: <Star size={16} />, hint: `${m.reviewClicks} abrieron el enlace` },
  ];
  const days = visitsByDay(state, 14, includeSample);
  const buckets = recurrenceBuckets(state, includeSample);
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className="panel p-4 sm:p-5 flex flex-col gap-2 min-w-0">
            <div className="flex items-center justify-between gap-2 text-[12.5px] text-slate2">
              <span className="truncate">{k.label}</span>
              <span className="h-7 w-7 shrink-0 rounded-lg bg-[#F1F3F6] inline-flex items-center justify-center text-[#475467]">{k.icon}</span>
            </div>
            <div className="text-[28px] sm:text-[32px] font-semibold tracking-tight text-ink tabular-nums leading-none kpi-num" key={k.value}>{k.value}</div>
            <div className="text-[12px] text-slate2 leading-snug">{k.hint}</div>
            {includeSample && <div className="text-[11.5px] text-[#0E6874]">{k.live} en vivo durante esta demo</div>}
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="panel p-4 sm:p-5 min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[15px] font-semibold text-ink">Visitas por día</h2>
            <div className="flex items-center gap-3 text-[12px] text-slate2">
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-ink" /> En vivo</span>
              {includeSample && <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#C9CED6]" /> Ejemplo</span>}
            </div>
          </div>
          <p className="text-[12.5px] text-slate2 mt-0.5">Últimos 14 días</p>
          <VisitsChart days={days} />
        </section>
        <section className="panel p-4 sm:p-5 min-w-0">
          <h2 className="text-[15px] font-semibold text-ink">Recurrencia</h2>
          <p className="text-[12.5px] text-slate2 mt-0.5">Clientes según cuántas veces han vuelto</p>
          <RecurrenceChart buckets={buckets} />
        </section>
      </div>

      <ProgramStatus state={state} includeSample={includeSample} />
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

function VisitsChart({ days }: { days: ReturnType<typeof visitsByDay> }) {
  const W = 640, H = 220, padL = 28, padB = 26, padT = 10, padR = 6;
  const max = niceMax(Math.max(...days.map((d) => d.live + d.sample), 1));
  const cw = (W - padL - padR) / days.length;
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  const ticks = [0, max / 2, max];
  return (
    <div className="mt-4 overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto min-w-[420px]" role="img" aria-label="Gráfica de visitas por día">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="#EEF0F3" />
            <text x={padL - 8} y={y(t) + 4} textAnchor="end" fontSize="10.5" fill="#98A2B3">{t}</text>
          </g>
        ))}
        {days.map((d, i) => {
          const x = padL + i * cw + cw * 0.2;
          const w = cw * 0.6;
          const ys = y(d.sample);
          const yl = y(d.sample + d.live);
          const isToday = i === days.length - 1;
          return (
            <g key={i}>
              {d.sample > 0 && <rect x={x} y={ys} width={w} height={H - padB - ys} rx={3} fill="#D5D9DF" />}
              {d.live > 0 && <rect x={x} y={yl} width={w} height={ys - yl} rx={3} fill="#0E1013" className="bar-grow" />}
              {d.live + d.sample > 0 && <text x={x + w / 2} y={yl - 5} textAnchor="middle" fontSize="10" fill="#475467" className="tabular-nums">{d.live + d.sample}</text>}
              {(i % 2 === 1 || isToday) && (
                <text x={x + w / 2} y={H - 8} textAnchor="middle" fontSize="10" fill={isToday ? '#0E1013' : '#98A2B3'} fontWeight={isToday ? 600 : 400}>{isToday ? 'Hoy' : d.label}</text>
              )}
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
        <div key={b.label} className="grid grid-cols-[96px_minmax(0,1fr)_40px] items-center gap-3 text-[12.5px]">
          <span className="text-[#475467] truncate">{b.label}</span>
          <div className="h-6 rounded-md bg-[#F4F5F7] overflow-hidden">
            <div className="h-full rounded-md transition-[width] duration-700" style={{ width: `${(b.value / max) * 100}%`, background: i >= 2 ? '#2E90A0' : '#B9C0C9', opacity: i >= 2 ? 0.55 + i * 0.12 : 1 }} />
          </div>
          <span className="text-right tabular-nums text-ink font-medium">{b.value}</span>
        </div>
      ))}
      <p className="text-[12px] text-slate2 pt-1">Total: {total} clientes. En azul, los que ya regresaron.</p>
    </div>
  );
}

function ProgramStatus({ state, includeSample }: { state: State; includeSample: boolean }) {
  const cards = state.cards.filter((c) => includeSample || !c.isSample);
  const near = cards.filter((c) => {
    const p = progressOf(state, c);
    return !p.reward && p.remaining <= 2 && p.shown > 0;
  });
  const pending = cards.filter((c) => progressOf(state, c).reward);
  const b = state.business;
  return (
    <section className="panel p-4 sm:p-5">
      <h2 className="text-[15px] font-semibold text-ink">Estado del programa</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl bg-[#F6F7F9] p-4">
          <div className="text-[12px] text-slate2">Regla vigente</div>
          <div className="mt-1 text-[14px] text-ink font-medium">{b.stampsRequired} sellos = {b.rewardDescription.toLowerCase()}</div>
          <div className="mt-1 text-[12px] text-slate2">Reseñas: {b.reviewUrlIsExample ? 'enlace de ejemplo' : 'enlace configurado'}</div>
        </div>
        <div className="rounded-xl bg-[#FDF8EF] p-4">
          <div className="text-[12px] text-[#7A5A1F]">Premios por entregar</div>
          <div className="mt-1 text-[22px] font-semibold text-[#5C4314] tabular-nums">{pending.length}</div>
          <div className="mt-1 text-[12px] text-[#7A5A1F] truncate">{pending.map((c) => customerOf(state, c).name).join(', ') || 'Ninguno'}</div>
        </div>
        <div className="rounded-xl bg-[#EEF8FA] p-4">
          <div className="text-[12px] text-[#0E6874]">A 1 o 2 sellos del premio</div>
          <div className="mt-1 text-[22px] font-semibold text-[#0B4F58] tabular-nums">{near.length}</div>
          <div className="mt-1 text-[12px] text-[#0E6874] truncate">{near.map((c) => customerOf(state, c).name).join(', ') || 'Ninguno'}</div>
        </div>
      </div>
    </section>
  );
}

function CustomersTable({ state, includeSample }: { state: State; includeSample: boolean }) {
  const rows = useMemo(
    () => state.cards.filter((c) => includeSample || !c.isSample).sort((a, b) => Date.parse(b.lastOperationAt || b.createdAt) - Date.parse(a.lastOperationAt || a.createdAt)),
    [state, includeSample],
  );
  return (
    <section className="panel overflow-hidden">
      <div className="px-4 sm:px-5 py-3.5 border-b border-line flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-ink">Clientes</h2>
        <span className="text-[12.5px] text-slate2 tabular-nums">{rows.length} tarjetas</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] min-w-[680px]">
          <thead>
            <tr className="text-left text-[11.5px] uppercase tracking-[0.08em] text-slate2 bg-[#FAFBFC]">
              <th className="font-medium px-4 sm:px-5 py-2.5">Cliente</th>
              <th className="font-medium px-3 py-2.5">Progreso</th>
              <th className="font-medium px-3 py-2.5 text-right">Visitas</th>
              <th className="font-medium px-3 py-2.5 text-right">Canjes</th>
              <th className="font-medium px-3 py-2.5">Contacto</th>
              <th className="font-medium px-3 py-2.5">Última visita</th>
              <th className="font-medium px-4 sm:px-5 py-2.5 text-right">Origen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((c) => {
              const cu = customerOf(state, c);
              const p = progressOf(state, c);
              return (
                <tr key={c.id}>
                  <td className="px-4 sm:px-5 py-2.5">
                    <div className="font-medium text-ink whitespace-nowrap">{cu.name}</div>
                    <div className="text-[11.5px] font-mono text-slate2">{c.id}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    {p.reward ? (
                      <Badge tone="gold">Premio listo</Badge>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 rounded-full bg-[#EEF0F3] overflow-hidden"><div className="h-full rounded-full bg-ink" style={{ width: `${(p.shown / p.required) * 100}%` }} /></div>
                        <span className="tabular-nums text-slate2 text-[12px]">{p.shown}/{p.required}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{c.totalVisits}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{redeemedRewardsOf(state, c.id).length}</td>
                  <td className="px-3 py-2.5 text-slate2 whitespace-nowrap">{cu.contactType ? (cu.contactType === 'email' ? 'Correo' : 'WhatsApp') : '–'}{cu.marketingConsent && <span className="ml-1.5 text-[11px] text-[#067647]">acepta promos</span>}</td>
                  <td className="px-3 py-2.5 text-slate2 whitespace-nowrap">{c.lastStampAt ? relativeTime(c.lastStampAt) : 'Sin visitas'}</td>
                  <td className="px-4 sm:px-5 py-2.5 text-right">{c.isSample ? <SampleBadge /> : <Badge tone="info">En vivo</Badge>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const PRESETS = [
  { name: 'Espresso', primary: '#2B1B14', accent: '#C9A15B' },
  { name: 'Olivo', primary: '#26301F', accent: '#D2B26B' },
  { name: 'Barbería', primary: '#14171C', accent: '#B9C0C9' },
  { name: 'Terracota', primary: '#5A2A1C', accent: '#E8C9A0' },
  { name: 'Marino', primary: '#152238', accent: '#D9B26F' },
];

function Settings({ state, run }: Props) {
  const b = state.business;
  const toast = useToast();
  const [form, setForm] = useState<Business>(b);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setForm(b), [b]);
  const set = <K extends keyof Business>(k: K, v: Business[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setError(null);
  };
  const dirty = (['name', 'primary', 'accent', 'stampsRequired', 'rewardDescription', 'reviewUrl'] as const).some((k) => form[k] !== b[k]);
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const r = run({ type: 'updateSettings', patch: { name: form.name, primary: form.primary, accent: form.accent, stampsRequired: Number(form.stampsRequired), rewardDescription: form.rewardDescription, reviewUrl: form.reviewUrl } });
    if (!r.ok) {
      setError(r.message!);
      return;
    }
    toast('good', 'Programa actualizado. La tarjeta del cliente ya muestra los cambios.');
  };
  const affected = state.cards.filter((c) => !progressOf(state, c).reward && c.stamps >= Number(form.stampsRequired)).length;
  const preview = { ['--brand' as any]: form.primary, ['--accent' as any]: form.accent } as React.CSSProperties;

  return (
    <form onSubmit={save} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
      <section className="panel p-4 sm:p-6 flex flex-col gap-5">
        <h2 className="text-[15px] font-semibold text-ink">Programa de recompensas</h2>
        <Field label="Nombre comercial" htmlFor="set-name">
          <input id="set-name" className={inputCls} value={form.name} maxLength={40} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Sellos necesarios" htmlFor="set-stamps" hint="Entre 3 y 15. Los premios ya ganados se respetan.">
            <div className="flex items-center gap-2">
              <button type="button" className="h-11 w-11 rounded-xl border border-line bg-white text-[18px] hover:bg-[#F6F7F9]" onClick={() => set('stampsRequired', Math.max(3, Number(form.stampsRequired) - 1))} aria-label="Menos sellos">−</button>
              <input id="set-stamps" type="number" min={3} max={15} className={cx(inputCls, 'text-center tabular-nums w-20')} value={form.stampsRequired} onChange={(e) => set('stampsRequired', Number(e.target.value) as any)} />
              <button type="button" className="h-11 w-11 rounded-xl border border-line bg-white text-[18px] hover:bg-[#F6F7F9]" onClick={() => set('stampsRequired', Math.min(15, Number(form.stampsRequired) + 1))} aria-label="Más sellos">+</button>
            </div>
          </Field>
          <Field label="Recompensa" htmlFor="set-reward">
            <input id="set-reward" className={inputCls} value={form.rewardDescription} maxLength={60} onChange={(e) => set('rewardDescription', e.target.value)} />
          </Field>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium text-ink">Colores de la marca</span>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button type="button" key={p.name} onClick={() => setForm((f) => ({ ...f, primary: p.primary, accent: p.accent }))} className={cx('inline-flex items-center gap-2 rounded-full border px-2.5 h-8 text-[12.5px]', form.primary === p.primary && form.accent === p.accent ? 'border-ink text-ink' : 'border-line text-slate2 hover:border-[#C9CED6]')}>
                <span className="relative h-4 w-6"><span className="absolute left-0 h-4 w-4 rounded-full border border-black/10" style={{ background: p.primary }} /><span className="absolute left-2.5 h-4 w-4 rounded-full border border-black/10" style={{ background: p.accent }} /></span>
                {p.name}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 mt-1">
            <label htmlFor="set-primary" className="flex items-center gap-2 rounded-xl border border-line px-3 h-11 text-[13px] text-slate2">
              <input id="set-primary" type="color" value={form.primary} onChange={(e) => set('primary', e.target.value)} className="h-6 w-8 rounded border-0 bg-transparent p-0" /> Principal <span className="ml-auto font-mono text-[12px] text-ink">{form.primary.toUpperCase()}</span>
            </label>
            <label htmlFor="set-accent" className="flex items-center gap-2 rounded-xl border border-line px-3 h-11 text-[13px] text-slate2">
              <input id="set-accent" type="color" value={form.accent} onChange={(e) => set('accent', e.target.value)} className="h-6 w-8 rounded border-0 bg-transparent p-0" /> Acento <span className="ml-auto font-mono text-[12px] text-ink">{form.accent.toUpperCase()}</span>
            </label>
          </div>
        </div>
        <Field label="Enlace para reseñas de Google" htmlFor="set-review" hint={<>En Google Business Profile: “Pedir reseñas” copia el enlace directo. {b.reviewUrlIsExample && <strong className="text-[#B54708]">Ahora usa un enlace de ejemplo.</strong>}</>}>
          <input id="set-review" className={cx(inputCls, 'text-[13.5px]')} value={form.reviewUrl} onChange={(e) => set('reviewUrl', e.target.value)} />
        </Field>
        <div className="rounded-xl bg-[#F6F7F9] px-3.5 py-3 text-[12.5px] text-[#475467] flex gap-2 leading-snug">
          <Info size={15} className="shrink-0 mt-[1px]" />
          <span>La invitación a reseñar aparece igual para todos los clientes desde su segunda visita. No se filtran opiniones ni se premia dejar reseña, porque las políticas de Google lo prohíben.</span>
        </div>
        {affected > 0 && Number(form.stampsRequired) !== b.stampsRequired && (
          <p className="text-[12.5px] text-[#B54708]">Con {form.stampsRequired} sellos, {affected} {affected === 1 ? 'tarjeta desbloquea' : 'tarjetas desbloquean'} su recompensa al guardar.</p>
        )}
        {error && <p className="text-[13px] text-[#B42318]">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!dirty}><Save size={16} /> Guardar cambios</Button>
          <Button type="button" variant="ghost" disabled={!dirty} onClick={() => setForm(b)}><RotateCcw size={15} /> Descartar</Button>
        </div>
      </section>

      <aside className="flex flex-col gap-3 lg:sticky lg:top-[84px]">
        <div className="text-[12px] uppercase tracking-[0.14em] text-slate2">Así lo verá el cliente</div>
        <div style={preview}>
          <LoyaltyCardFace businessName={form.name || 'Tu negocio'} customerName="Cliente de ejemplo" cardId="CDT-0000-0000" total={Math.min(15, Math.max(3, Number(form.stampsRequired) || 8))} filled={3} compact />
        </div>
        <p className="text-[12px] text-slate2">Vista previa sin guardar. Al guardar se aplica en todas las tarjetas.</p>
      </aside>
    </form>
  );
}

function SecurityNote() {
  return (
    <details className="panel px-4 sm:px-5 py-3.5 group">
      <summary className="cursor-pointer list-none flex items-center justify-between gap-2 text-[13.5px] font-medium text-ink">
        <span className="inline-flex items-center gap-2"><ShieldCheck size={16} /> Qué cambia en la versión productiva</span>
        <span className="text-[12px] text-slate2 group-open:hidden">Ver</span>
      </summary>
      <ul className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2 text-[12.5px] text-[#475467] list-disc pl-4">
        <li>Inicio de sesión para dueño y empleados.</li>
        <li>Permisos por negocio y por empleado.</li>
        <li>Servidor que valida cada sello y canje.</li>
        <li>QR con tokens firmados y de corta vida.</li>
        <li>Detección de fraude y límites por tarjeta.</li>
        <li>Bitácora auditable que no se puede editar.</li>
        <li>Datos aislados entre negocios.</li>
        <li>Protección de datos personales y aviso de privacidad real.</li>
      </ul>
      <p className="mt-3 text-[12px] text-slate2">En esta demo todo vive en tu navegador. Los identificadores son aleatorios pero no son tokens seguros.</p>
    </details>
  );
}
