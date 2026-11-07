// V0.4.6 · COMUNICACIÓN CON CLIENTES (panel del dueño). Muestra quién aceptó avisos, qué avisos automáticos están
// activos, resultados agregados (sin datos personales de entrega) y permite UNA promoción limitada a quien la aceptó.
// No hay envíos ilimitados: máximo 2 promociones cada 30 días, horas de silencio y máximo semanal por cliente.
import React, { useEffect, useState } from 'react';
import { Bell, Gift, CalendarClock, Megaphone, Moon, Send, Users, Info, CalendarPlus, X } from 'lucide-react';
import { api, ApiError, BusinessInfo } from '../lib/api';
import { usePolling } from '../lib/usePolling';
import { Badge, Button, Field, inputCls, useToast, cx } from '../components/ui';

interface Settings { rewardsEnabled: boolean; progressEnabled: boolean; progressRemaining: number; returnEnabled: boolean; returnAfterDays: number; appointmentsEnabled: boolean; quietStartHour: number; quietEndHour: number; maxPerWeek: number }
interface Overview {
  pushConfigured: boolean; settings: Settings; activeCards: number;
  subscribers: { cards: number; devices: number; rewards: number; reminders: number; promotions: number; optOutsLast30Days: number };
  last30Days: Record<string, { total: number; delivered: number; devices: number }>;
  promotions: { id: string; title: string; body: string; status: string; devicesSent: number; devicesFailed: number; createdAt: string; sentAt: string | null }[];
  promotionsLimit: { used: number; max: number };
  appointments: { id: string; startsAt: string; reminderSent: boolean; cardCode: string; customerName: string }[];
}

const TEMPLATE_LABEL: Record<string, string> = { reward_ready: 'Recompensa lista', progress: 'Casi lo logras', return: 'Te extrañamos', promotion: 'Promoción', appointment: 'Cita confirmada' };
const STATUS_LABEL: Record<string, string> = { queued: 'En cola', sending: 'Enviando', sent: 'Entregada al servicio push', partial: 'Entregada en parte', failed: 'Falló', skipped: 'Omitida', expired: 'Caducó' };
const hour = (h: number) => `${((h + 11) % 12) + 1}:00 ${h < 12 ? 'a. m.' : 'p. m.'}`;

function Toggle({ checked, onChange, label, help, testid }: { checked: boolean; onChange: (v: boolean) => void; label: string; help: string; testid: string }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer py-1.5">
      <input type="checkbox" className="mt-1 h-4 w-4 accent-[#0E6874]" checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid={testid} />
      <span className="min-w-0"><span className="block text-[14px] font-medium text-ink">{label}</span><span className="block text-[12.5px] text-slate2">{help}</span></span>
    </label>
  );
}

export function CommunicationTab({ business: b }: { business: BusinessInfo & { isDemo: boolean } }) {
  const toast = useToast();
  const ov = usePolling(() => api<Overview>('GET', '/owner/communication'), 30_000, []);
  const [s, setS] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [promo, setPromo] = useState({ title: '', body: '' });
  const [appt, setAppt] = useState({ cardCode: '', date: '', time: '' });
  useEffect(() => { if (ov.data && !s) setS(ov.data.settings); }, [ov.data, s]);
  if (ov.error && !ov.data) return <p className="text-[14px] text-[#B42318]" role="alert">{ov.error.message}</p>;
  if (!ov.data || !s) return <p className="text-[14px] text-slate2">Cargando…</p>;
  const o = ov.data;
  const dirty = JSON.stringify(s) !== JSON.stringify(o.settings);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS({ ...s, [k]: v });

  const saveSettings = async () => {
    setBusy(true);
    try { await api('PUT', '/owner/communication/settings', s); toast('good', 'Ajustes de avisos guardados.'); ov.refresh(); }
    catch (e) { toast('bad', (e as ApiError).message); } finally { setBusy(false); }
  };
  const sendPromo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.confirm(`Se enviará a ${o.subscribers.promotions} cliente(s) que aceptaron promociones. ¿Continuar?`)) return;
    setBusy(true);
    try {
      const r = await api<{ audience: number }>('POST', '/owner/communication/promotions', promo);
      toast('good', `Promoción en camino a ${r.audience} cliente(s).`);
      setPromo({ title: '', body: '' });
      ov.refresh();
    } catch (x) { toast('bad', (x as ApiError).message); } finally { setBusy(false); }
  };
  const addAppt = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const startsAt = new Date(`${appt.date}T${appt.time}:00`).toISOString();
      await api('POST', '/owner/appointments', { cardCode: appt.cardCode.trim().toUpperCase(), startsAt });
      toast('good', 'Cita registrada. Si el cliente aceptó recordatorios, recibirá un aviso un día antes.');
      setAppt({ cardCode: '', date: '', time: '' });
      ov.refresh();
    } catch (x) { toast('bad', (x as ApiError).message); } finally { setBusy(false); }
  };
  const cancelAppt = async (id: string) => {
    try { await api('POST', `/owner/appointments/${id}/cancel`, {}); ov.refresh(); } catch (x) { toast('bad', (x as ApiError).message); }
  };
  const pct = o.activeCards ? Math.round((o.subscribers.cards / o.activeCards) * 100) : 0;
  const promoLeft = Math.max(0, o.promotionsLimit.max - o.promotionsLimit.used);

  return (
    <div className="flex flex-col gap-5" data-testid="communication">
      {!o.pushConfigured && (
        <div className="panel p-4 flex items-start gap-3 border-[#FEDF89] bg-[#FFFAEB]" data-testid="push-not-configured">
          <Info size={18} className="text-[#B54708] mt-0.5 shrink-0" />
          <p className="text-[13.5px] text-[#7A2E0E]">Los avisos al teléfono de tus clientes aún no están activados en este servicio. Puedes dejar tus preferencias listas; VLUX te avisará cuando estén disponibles.</p>
        </div>
      )}

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { id: 'subs', icon: <Users size={16} />, label: 'Clientes con avisos', value: o.subscribers.cards, sub: `${pct}% de ${o.activeCards} tarjetas` },
          { id: 'rewards', icon: <Gift size={16} />, label: 'Aceptan recompensas', value: o.subscribers.rewards, sub: 'Aviso cuando ganan' },
          { id: 'reminders', icon: <CalendarClock size={16} />, label: 'Aceptan recordatorios', value: o.subscribers.reminders, sub: 'Progreso, regreso y citas' },
          { id: 'promotions', icon: <Megaphone size={16} />, label: 'Aceptan promociones', value: o.subscribers.promotions, sub: `${o.subscribers.optOutsLast30Days} se dieron de baja (30 días)` },
        ].map((k) => (
          <div key={k.id} className="panel p-4 flex flex-col gap-1 min-w-0" data-testid={`comm-kpi-${k.id}`}>
            <span className="inline-flex items-center gap-1.5 text-[12.5px] text-slate2">{k.icon} {k.label}</span>
            <span className="text-[26px] font-semibold text-ink tabular-nums">{k.value}</span>
            <span className="text-[12px] text-slate2 truncate">{k.sub}</span>
          </div>
        ))}
      </section>

      <section className="panel p-4 sm:p-5 flex flex-col gap-2" data-testid="comm-settings">
        <h2 className="text-[16px] font-semibold text-ink inline-flex items-center gap-2"><Bell size={17} /> Avisos automáticos</h2>
        <p className="text-[13px] text-slate2">Solo llegan a clientes que los aceptaron en su tarjeta. Cada cliente puede desactivarlos cuando quiera.</p>
        <Toggle checked={s.rewardsEnabled} onChange={(v) => set('rewardsEnabled', v)} label="Recompensa lista" help={`“${b.name}: recompensa lista”. Se envía al completar la meta.`} testid="set-rewards" />
        <div className="flex flex-wrap items-center gap-3">
          <Toggle checked={s.progressEnabled} onChange={(v) => set('progressEnabled', v)} label="Casi lo logras" help="Cuando al cliente le falta poco para su recompensa." testid="set-progress" />
          <select className={cx(inputCls, 'w-auto')} value={s.progressRemaining} onChange={(e) => set('progressRemaining', Number(e.target.value))} aria-label="Cuántas visitas faltan" disabled={!s.progressEnabled} data-testid="set-progress-remaining">
            {[1, 2, 3].map((n) => <option key={n} value={n}>Cuando falte{n > 1 ? 'n' : ''} {n}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Toggle checked={s.returnEnabled} onChange={(v) => set('returnEnabled', v)} label="Te extrañamos" help="Una sola vez por ausencia, nunca diario." testid="set-return" />
          <select className={cx(inputCls, 'w-auto')} value={s.returnAfterDays} onChange={(e) => set('returnAfterDays', Number(e.target.value))} aria-label="Días sin visita" disabled={!s.returnEnabled} data-testid="set-return-days">
            {[14, 21, 30, 45, 60, 90].map((n) => <option key={n} value={n}>Tras {n} días sin venir</option>)}
          </select>
        </div>
        <Toggle checked={s.appointmentsEnabled} onChange={(v) => set('appointmentsEnabled', v)} label="Recordatorio de cita" help="Solo para citas confirmadas que registres aquí. Un día antes, con la hora y nada más." testid="set-appointments" />
        <div className="grid sm:grid-cols-3 gap-3 mt-2">
          <Field label="Silencio desde" htmlFor="q-start"><select id="q-start" className={inputCls} value={s.quietStartHour} onChange={(e) => set('quietStartHour', Number(e.target.value))}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hour(h)}</option>)}</select></Field>
          <Field label="Silencio hasta" htmlFor="q-end"><select id="q-end" className={inputCls} value={s.quietEndHour} onChange={(e) => set('quietEndHour', Number(e.target.value))}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hour(h)}</option>)}</select></Field>
          <Field label="Máximo de recordatorios por semana" htmlFor="q-max"><select id="q-max" className={inputCls} value={s.maxPerWeek} onChange={(e) => set('maxPerWeek', Number(e.target.value))}>{[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}</select></Field>
        </div>
        <p className="text-[12px] text-slate2 inline-flex items-center gap-1.5"><Moon size={13} /> En horas de silencio los avisos esperan a la mañana (hora del centro de México).</p>
        <div className="flex justify-end"><Button onClick={saveSettings} disabled={!dirty || busy || b.isDemo} data-testid="save-comm-settings">Guardar ajustes</Button></div>
      </section>

      <section className="panel p-4 sm:p-5 flex flex-col gap-3" data-testid="comm-promotion">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[16px] font-semibold text-ink inline-flex items-center gap-2"><Megaphone size={17} /> Promoción</h2>
          <Badge tone={promoLeft ? 'info' : 'warn'}>{promoLeft} de {o.promotionsLimit.max} disponibles este mes</Badge>
        </div>
        <p className="text-[13px] text-slate2">Llega solo a quienes eligieron “Promociones” ({o.subscribers.promotions}). Sin datos de salud ni información sensible.</p>
        <form onSubmit={sendPromo} className="flex flex-col gap-3">
          <Field label="Título (máx. 40)" htmlFor="promo-title"><input id="promo-title" maxLength={40} className={inputCls} value={promo.title} onChange={(e) => setPromo({ ...promo, title: e.target.value })} placeholder="2x1 en café este jueves" data-testid="promo-title" /></Field>
          <Field label="Mensaje (máx. 160)" htmlFor="promo-body"><textarea id="promo-body" maxLength={160} rows={2} className={inputCls} value={promo.body} onChange={(e) => setPromo({ ...promo, body: e.target.value })} placeholder="Muestra tu tarjeta en caja." data-testid="promo-body" /></Field>
          <div className="rounded-xl border border-line bg-[#fafbfc] p-3 text-[13px]" aria-label="Vista previa">
            <div className="font-semibold text-ink truncate">{b.name}: {promo.title || 'Título'}</div>
            <div className="text-slate2">{promo.body || 'Mensaje'}</div>
          </div>
          <div className="flex justify-end"><Button type="submit" disabled={busy || b.isDemo || !o.pushConfigured || !promoLeft || promo.title.trim().length < 3 || promo.body.trim().length < 5 || !o.subscribers.promotions} data-testid="promo-send"><Send size={15} /> Enviar promoción</Button></div>
        </form>
        {o.promotions.length > 0 && (
          <ul className="divide-y divide-line text-[13px]" data-testid="promo-history">
            {o.promotions.map((p) => (
              <li key={p.id} className="py-2 flex items-center justify-between gap-3">
                <span className="truncate">{p.title}</span>
                <span className="shrink-0 text-slate2">{STATUS_LABEL[p.status] ?? p.status} · {p.devicesSent} disp.</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel p-4 sm:p-5 flex flex-col gap-3" data-testid="comm-results">
        <h2 className="text-[16px] font-semibold text-ink">Resultados (30 días)</h2>
        {Object.keys(o.last30Days).length === 0 ? <p className="text-[13px] text-slate2">Aún no hay avisos enviados.</p> : (
          <table className="w-full text-[13px]">
            <thead><tr className="text-left text-slate2"><th className="py-1 font-medium">Aviso</th><th className="py-1 font-medium text-right">Generados</th><th className="py-1 font-medium text-right">Aceptados por el servicio push</th></tr></thead>
            <tbody>{Object.entries(o.last30Days).map(([k, v]) => <tr key={k} className="border-t border-line"><td className="py-1.5">{TEMPLATE_LABEL[k] ?? k}</td><td className="py-1.5 text-right tabular-nums">{v.total}</td><td className="py-1.5 text-right tabular-nums">{v.delivered}</td></tr>)}</tbody>
          </table>
        )}
        <p className="text-[12px] text-slate2">“Aceptado” significa que el servicio de notificaciones del teléfono (Google, Apple, Mozilla o Microsoft) lo recibió. No podemos confirmar si el cliente lo vio.</p>
      </section>

      {s.appointmentsEnabled && (
        <section className="panel p-4 sm:p-5 flex flex-col gap-3" data-testid="comm-appointments">
          <h2 className="text-[16px] font-semibold text-ink inline-flex items-center gap-2"><CalendarPlus size={17} /> Citas confirmadas</h2>
          <p className="text-[13px] text-slate2">No es una agenda ni un expediente: solo fecha y hora para el recordatorio. No escribas motivos, servicios ni datos de salud.</p>
          <form onSubmit={addAppt} className="grid sm:grid-cols-4 gap-3 items-end">
            <Field label="Código de tarjeta" htmlFor="ap-code"><input id="ap-code" className={inputCls} value={appt.cardCode} onChange={(e) => setAppt({ ...appt, cardCode: e.target.value })} placeholder="ABCD-2345" /></Field>
            <Field label="Fecha" htmlFor="ap-date"><input id="ap-date" type="date" className={inputCls} value={appt.date} onChange={(e) => setAppt({ ...appt, date: e.target.value })} /></Field>
            <Field label="Hora" htmlFor="ap-time"><input id="ap-time" type="time" className={inputCls} value={appt.time} onChange={(e) => setAppt({ ...appt, time: e.target.value })} /></Field>
            <Button type="submit" disabled={busy || b.isDemo || !appt.cardCode || !appt.date || !appt.time}>Registrar cita</Button>
          </form>
          {o.appointments.length > 0 && (
            <ul className="divide-y divide-line text-[13px]">
              {o.appointments.map((a) => (
                <li key={a.id} className="py-2 flex items-center justify-between gap-3">
                  <span className="truncate">{new Date(a.startsAt).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })} · {a.customerName} ({a.cardCode})</span>
                  <span className="shrink-0 inline-flex items-center gap-2 text-slate2">{a.reminderSent ? 'Recordatorio listo' : 'Pendiente'}<button onClick={() => cancelAppt(a.id)} aria-label="Cancelar cita" className="hover:text-ink"><X size={15} /></button></span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
