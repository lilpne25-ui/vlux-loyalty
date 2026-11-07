// V0.4.6 · "Mis notificaciones" en la tarjeta del cliente. La tarjeta sigue siendo lo principal: esto es una sección
// discreta, cerrada por omisión, que explica primero y solo pide permiso cuando el cliente toca "Activar avisos".
import React, { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff, ChevronDown, Gift, CalendarClock, Megaphone, Smartphone } from 'lucide-react';
import { api } from '../lib/api';
import { currentSubscription, permissionState, platformTag, pushSupport, requestSubscription, subscriptionBody, type PermissionState } from '../lib/push';
import { Button, useToast, cx } from './ui';

type Cats = { rewards: boolean; reminders: boolean; promotions: boolean };
const CAT_INFO: { key: keyof Cats; label: string; help: string; icon: React.ReactNode }[] = [
  { key: 'rewards', label: 'Recompensas', help: 'Cuando tu recompensa esté lista.', icon: <Gift size={15} /> },
  { key: 'reminders', label: 'Recordatorios', help: 'Cuando te falte poco, si llevas tiempo sin venir o un día antes de una cita confirmada.', icon: <CalendarClock size={15} /> },
  { key: 'promotions', label: 'Promociones', help: 'Ofertas del negocio. Máximo 2 al mes.', icon: <Megaphone size={15} /> },
];

const permLabel: Record<PermissionState, string> = { granted: 'Permitidas en este teléfono', denied: 'Bloqueadas en este teléfono', default: 'Sin decidir en este teléfono', unsupported: 'No disponibles en este navegador' };

export function CustomerNotifications({ slug, businessName }: { slug: string; businessName: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<{ enabled: boolean; publicKey: string | null } | null>(null);
  const [perm, setPerm] = useState<PermissionState>(() => permissionState());
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [cats, setCats] = useState<Cats>({ rewards: true, reminders: false, promotions: false });
  const [busy, setBusy] = useState(false);
  const support = pushSupport();

  const load = useCallback(async () => {
    const cfg = await api<{ enabled: boolean; publicKey: string | null }>('GET', '/public/push-config').catch(() => ({ enabled: false, publicKey: null }));
    setConfig(cfg);
    setPerm(permissionState());
    if (!cfg.enabled || !support.ok) return;
    const sub = await currentSubscription().catch(() => null);
    if (!sub) { setSubscribed(false); setEndpoint(null); return; }
    setEndpoint(sub.endpoint);
    const st = await api<{ subscribed: boolean; categories: Cats | null }>('POST', `/me/${slug}/push/status`, { endpoint: sub.endpoint }).catch(() => null);
    setSubscribed(!!st?.subscribed);
    if (st?.categories) setCats(st.categories);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);
  useEffect(() => { if (open && !config) load(); }, [open, config, load]);

  const activate = async () => {
    if (!config?.publicKey) return;
    setBusy(true);
    try {
      const r = await requestSubscription(config.publicKey);
      setPerm(permissionState());
      if ('error' in r) {
        if (r.error === 'denied') toast('bad', 'Bloqueaste los avisos en este teléfono. No volveremos a preguntar.');
        else if (r.error === 'dismissed') toast('bad', 'No se activaron los avisos.');
        else toast('bad', 'Este navegador no pudo activar los avisos. Intenta desde la app instalada.');
        return;
      }
      await api('POST', `/me/${slug}/push/subscribe`, { ...subscriptionBody(r.sub), categories: cats, platform: platformTag() });
      setEndpoint(r.sub.endpoint);
      setSubscribed(true);
      toast('good', 'Avisos activados. Puedes cambiarlos cuando quieras.');
    } catch (e) {
      toast('bad', (e as Error).message);
    } finally { setBusy(false); }
  };

  const save = async (next: Cats) => {
    if (!endpoint) return;
    setBusy(true);
    try {
      if (!next.rewards && !next.reminders && !next.promotions) return await disableAll();
      await api('POST', `/me/${slug}/push/preferences`, { endpoint, categories: next });
      setCats(next);
    } catch (e) { toast('bad', (e as Error).message); } finally { setBusy(false); }
  };

  const disableAll = async () => {
    setBusy(true);
    try {
      await api('POST', `/me/${slug}/push/unsubscribe`, {});
      const sub = await currentSubscription().catch(() => null);
      await sub?.unsubscribe().catch(() => undefined);
      setSubscribed(false);
      setEndpoint(null);
      toast('good', 'Desactivaste todos los avisos de este negocio.');
    } catch (e) { toast('bad', (e as Error).message); } finally { setBusy(false); }
  };

  const body = () => {
    if (!config) return <p className="text-[13px] text-cafe-muted">Revisando…</p>;
    if (!config.enabled) return <p className="text-[13px] text-cafe-body" data-testid="push-unavailable">Los avisos todavía no están disponibles para {businessName}. Tu tarjeta funciona igual sin ellos.</p>;
    if (!support.ok) {
      if (support.reason === 'ios-install-first') return (
        <div className="flex flex-col gap-2" data-testid="push-ios-install-first">
          <p className="text-[13px] text-cafe-body">En iPhone, los avisos solo funcionan desde la app de tu tarjeta en la pantalla de inicio (iOS 16.4 o posterior).</p>
          <p className="text-[12.5px] text-cafe-muted inline-flex items-start gap-1.5"><Smartphone size={14} className="mt-0.5 shrink-0" /> Primero usa “Guardar en mi teléfono” arriba, abre la tarjeta desde el ícono nuevo y vuelve a esta sección.</p>
        </div>
      );
      return <p className="text-[13px] text-cafe-body" data-testid="push-unsupported">{support.reason === 'ios-old' ? 'Tu iPhone necesita iOS 16.4 o posterior para recibir avisos.' : 'Este navegador no permite recibir avisos. Tu tarjeta funciona igual.'}</p>;
    }
    if (perm === 'denied') return (
      <div className="flex flex-col gap-1.5" data-testid="push-denied">
        <p className="text-[13px] text-cafe-body">Los avisos están bloqueados para este sitio en tu teléfono. Por respeto a tu decisión no volvemos a preguntar.</p>
        <p className="text-[12.5px] text-cafe-muted">Si cambias de opinión, actívalos en los ajustes del navegador o de la app (Notificaciones) y regresa aquí.</p>
      </div>
    );
    if (subscribed) return (
      <div className="flex flex-col gap-3" data-testid="push-active">
        <ul className="flex flex-col gap-2">
          {CAT_INFO.map((c) => (
            <li key={c.key}>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--brand)]" checked={cats[c.key]} disabled={busy} onChange={(e) => save({ ...cats, [c.key]: e.target.checked })} data-testid={`push-cat-${c.key}`} />
                <span className="min-w-0"><span className="text-[13.5px] font-medium text-cafe-ink inline-flex items-center gap-1.5">{c.icon} {c.label}</span><span className="block text-[12px] text-cafe-muted">{c.help}</span></span>
              </label>
            </li>
          ))}
        </ul>
        <Button variant="secondary" size="sm" onClick={disableAll} disabled={busy} data-testid="push-disable-all"><BellOff size={15} /> Desactivar todas</Button>
      </div>
    );
    return (
      <div className="flex flex-col gap-3" data-testid="push-offer">
        <p className="text-[13px] text-cafe-body">{businessName} puede avisarte en este teléfono. Tú eliges qué avisos recibir y puedes desactivarlos cuando quieras. No compartimos tu información con otros negocios.</p>
        <ul className="flex flex-col gap-2">
          {CAT_INFO.map((c) => (
            <li key={c.key}>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--brand)]" checked={cats[c.key]} onChange={(e) => setCats({ ...cats, [c.key]: e.target.checked })} data-testid={`push-choose-${c.key}`} />
                <span className="min-w-0"><span className="text-[13.5px] font-medium text-cafe-ink inline-flex items-center gap-1.5">{c.icon} {c.label}</span><span className="block text-[12px] text-cafe-muted">{c.help}</span></span>
              </label>
            </li>
          ))}
        </ul>
        <Button variant="brand" onClick={activate} disabled={busy || (!cats.rewards && !cats.reminders && !cats.promotions)} data-testid="push-activate"><Bell size={16} /> Activar avisos</Button>
        <p className="text-[11.5px] text-cafe-muted leading-snug">Al tocar, tu teléfono te preguntará si permites notificaciones. Respetamos horas de descanso por la noche y un máximo de recordatorios por semana.</p>
      </div>
    );
  };

  return (
    <section className="rounded-2xl border border-cafe-line bg-white/70" data-testid="my-notifications">
      <button className="w-full px-5 py-3.5 flex items-center justify-between gap-3 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="inline-flex items-center gap-2 text-[13.5px] font-medium text-cafe-ink"><Bell size={16} /> Mis notificaciones</span>
        <span className="inline-flex items-center gap-2">
          <span className={cx('text-[11px] rounded-full px-2 py-0.5', subscribed ? 'bg-[#ECFDF3] text-[#067647]' : perm === 'denied' ? 'bg-[#FEF3F2] text-[#B42318]' : 'bg-cafe-cream text-cafe-muted')} data-testid="push-permission">{subscribed ? 'Activadas' : permLabel[perm]}</span>
          <ChevronDown size={16} className={cx('text-cafe-muted transition', open && 'rotate-180')} />
        </span>
      </button>
      {open && <div className="px-5 pb-4">{body()}</div>}
    </section>
  );
}
