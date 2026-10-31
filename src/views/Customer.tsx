// Vista del cliente: bienvenida (tras escanear el QR del mostrador), registro, tarjeta, premio y reseña.
// V0.2: los datos vienen del servidor; el cliente solo puede ver SU tarjeta (cookie HttpOnly).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Gift, ShieldCheck, Star, Wallet, ChevronDown, Coffee, Clock, ExternalLink, Info, Plus, Check, Scissors, Sparkles, UtensilsCrossed, Store, Link2 } from 'lucide-react';
import { api, ApiError, BusinessInfo, CustomerCardView, Program, Vertical } from '../lib/api';
import { formatDateTime, lowerFirst, cardQrValue, rewardQrValue, plural } from '../lib/format';
import { usePolling } from '../lib/usePolling';
import { getSeen, setSeen, getFlag, setFlag } from '../lib/seen';
import { rewardSentence, stampRule, welcomeHeadline } from '../lib/vertical';
import { Button, Modal, QRCode, CopyButton, Field, inputCls, BusinessLogo, CupIllustration, PoweredByVlux, useToast, cx, Badge } from '../components/ui';
import { LoyaltyCardFace } from '../components/LoyaltyCard';
import { brandVars, ErrorBox, Loading } from '../components/Brand';

const POLL_MS = 4000;

const VerticalIcon = ({ v, size = 17 }: { v: Vertical; size?: number }) =>
  v === 'cafeteria' ? <Coffee size={size} /> : v === 'barberia' ? <Scissors size={size} /> : v === 'salon' ? <Sparkles size={size} /> : v === 'restaurante' ? <UtensilsCrossed size={size} /> : <Store size={size} />;

export function CustomerApp({ slug }: { slug: string }) {
  const [pub, setPub] = useState<{ business: BusinessInfo; program: Program; privacyNoticeVersion: string } | null>(null);
  const [pubError, setPubError] = useState<string | null>(null);
  const [screen, setScreen] = useState<'welcome' | 'register'>('welcome');
  const [personalLink, setPersonalLink] = useState<string | null>(null);
  const card = usePolling(() => api<CustomerCardView | { card: null }>('GET', `/me/${slug}/card`), POLL_MS, [slug]);

  useEffect(() => {
    api('GET', `/public/businesses/${slug}`).then(setPub).catch((e: ApiError) => setPubError(e.status === 404 ? 'Este negocio no existe o ya no está activo.' : e.message));
  }, [slug]);

  if (pubError) return <div className="mx-auto max-w-[460px] gutter pt-16"><ErrorBox message={pubError} /></div>;
  if (!pub || (card.loading && !card.data)) return <Loading />;
  const b = pub.business;
  const view = card.data && card.data.card ? (card.data as CustomerCardView) : null;

  return (
    <div className="cafe-bg min-h-full" data-vertical={view?.business.vertical ?? b.vertical} style={brandVars(view?.business.primaryColor ?? b.primaryColor, view?.business.accentColor ?? b.accentColor)}>
      <div className="mx-auto w-full max-w-[460px] gutter pb-10">
        {b.isDemo && <div className="mt-3 rounded-xl bg-[#F4F3FF] border border-[#D9D6FE] px-3 py-2 text-[12px] text-[#5925DC]">Negocio de demostración: no escribas datos personales reales.</div>}
        {view ? (
          <CardScreen view={view} slug={slug} refresh={card.refresh} personalLink={personalLink} onLinkSeen={() => setPersonalLink(null)} />
        ) : screen === 'welcome' ? (
          <Welcome business={b} program={pub.program} onStart={() => setScreen('register')} />
        ) : (
          <Register business={b} slug={slug} onBack={() => setScreen('welcome')} onDone={(link) => { setPersonalLink(link); card.refresh(); }} />
        )}
      </div>
    </div>
  );
}

function Welcome({ business: b, program, onStart }: { business: BusinessInfo; program: Program; onStart: () => void }) {
  const rule = stampRule(program);
  return (
    <div className="screen-in pt-6 sm:pt-10 flex flex-col">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <BusinessLogo name={b.name} size={38} />
          <div className="min-w-0">
            <div className="font-display text-[16px] text-cafe-ink leading-tight line-clamp-2">{b.name}</div>
            <div className="text-[11.5px] text-cafe-muted">{b.city.split(',')[0]}</div>
          </div>
        </div>
        <span className="shrink-0 text-[11px] text-cafe-muted inline-flex items-center gap-1.5 rounded-full border border-cafe-line px-2.5 py-1 bg-white/60">
          <span className="h-1.5 w-1.5 rounded-full bg-[#12B76A]" /> Programa activo
        </span>
      </div>

      <div className="relative mt-6 rounded-[28px] overflow-hidden hero-panel" style={{ background: 'var(--brand)' }}>
        <div className="absolute inset-0 hero-glow" />
        {b.vertical === 'cafeteria' ? (
          <CupIllustration className="relative w-full h-auto px-6 pt-6 -mb-2" />
        ) : (
          <div className="relative flex justify-center pt-10 pb-4"><BusinessLogo name={b.name} size={132} /></div>
        )}
        <div className="relative px-6 pb-6 text-[color:var(--cream)]">
          <div className="text-[11px] uppercase tracking-[0.18em] opacity-60">{b.name}</div>
        </div>
      </div>

      <h1 className="mt-7 font-display text-[30px] sm:text-[34px] leading-[1.08] text-cafe-ink text-balance">{welcomeHeadline(b.vertical)}</h1>
      <p className="mt-3 text-[16px] text-cafe-body leading-relaxed">{rewardSentence(program)}</p>

      <div className="mt-6 grid grid-cols-3 gap-2 text-center">
        {[
          { icon: <VerticalIcon v={b.vertical} />, t: rule.title, s: rule.sub },
          { icon: <Gift size={17} />, t: `${program.stampsRequired} sellos`, s: '= premio' },
          { icon: <ShieldCheck size={17} />, t: 'Sin app', s: 'ni contraseña' },
        ].map((x) => (
          <div key={x.t} className="rounded-2xl bg-white/70 border border-cafe-line px-2 py-3">
            <div className="mx-auto h-8 w-8 rounded-full inline-flex items-center justify-center text-cafe-ink bg-cafe-cream">{x.icon}</div>
            <div className="mt-1.5 text-[13px] font-medium text-cafe-ink">{x.t}</div>
            <div className="text-[11.5px] text-cafe-muted leading-snug">{x.s}</div>
          </div>
        ))}
      </div>

      <Button variant="brand" size="lg" className="mt-7 w-full" onClick={onStart}>
        Obtener mi tarjeta gratis <ArrowRight size={18} />
      </Button>
      <p className="mt-3 text-[12.5px] text-cafe-muted text-center">¿Ya tienes tarjeta? Abre el enlace personal que guardaste al registrarte.</p>
      <div className="mt-10"><PoweredByVlux /></div>
    </div>
  );
}

function Register({ business: b, slug, onBack, onDone }: { business: BusinessInfo; slug: string; onBack: () => void; onDone: (personalLink: string) => void }) {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [consent, setConsent] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ publicCode: string; personalLink: string }>('POST', `/public/businesses/${slug}/register`, { displayName: name, contact, marketingConsent: consent, privacyAccepted: privacy });
      toast('good', `Tarjeta creada: ${r.publicCode}`);
      onDone(r.personalLink);
    } catch (err) {
      setError((err as ApiError).message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="screen-in pt-6 sm:pt-10 flex flex-col gap-5" noValidate>
      <button type="button" onClick={onBack} className="self-start text-[13px] text-cafe-muted hover:text-cafe-ink">← Regresar</button>
      <div className="flex items-center gap-3">
        <BusinessLogo name={b.name} size={44} />
        <div>
          <h1 className="font-display text-[26px] leading-tight text-cafe-ink">Crea tu tarjeta</h1>
          <p className="text-[14px] text-cafe-muted">Toma menos de un minuto. Sin contraseñas.</p>
        </div>
      </div>

      <div className="rounded-2xl bg-white border border-cafe-line p-4 sm:p-5 flex flex-col gap-4 shadow-[0_1px_0_rgba(43,27,20,.04)]">
        <Field label="¿Cómo te llamas?" htmlFor="reg-name" hint="Así aparecerá en tu tarjeta. Puede ser solo tu nombre.">
          <input id="reg-name" className={inputCls} autoComplete="given-name" placeholder="Ej. Mariana" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={<span>WhatsApp o correo <span className="font-normal text-slate2">(opcional)</span></span>} htmlFor="reg-contact" hint="Solo si quieres recibir promociones. No es necesario para usar tu tarjeta.">
          <input id="reg-contact" className={inputCls} autoComplete="off" inputMode="email" placeholder="722 123 4567 o tu@correo.com" value={contact} onChange={(e) => setContact(e.target.value)} />
        </Field>
        <label htmlFor="reg-consent" className={cx('flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition border-cafe-line', !contact && 'opacity-55 pointer-events-none')}>
          <input id="reg-consent" type="checkbox" className="mt-0.5 h-[18px] w-[18px] accent-[#2B1B14]" checked={consent && !!contact} disabled={!contact} onChange={(e) => setConsent(e.target.checked)} />
          <span className="text-[13px] leading-snug text-cafe-body">Quiero recibir promociones de {b.name}. <span className="text-cafe-muted">Opcional. No afecta tus sellos.</span></span>
        </label>
      </div>

      <div className="rounded-2xl border border-dashed border-cafe-line bg-white/50 px-4 py-3">
        <button type="button" className="w-full flex items-center justify-between text-left text-[13px] font-medium text-cafe-ink" onClick={() => setShowPrivacy((v) => !v)} aria-expanded={showPrivacy}>
          <span className="inline-flex items-center gap-2"><ShieldCheck size={16} /> Aviso de privacidad</span>
          <ChevronDown size={16} className={cx('transition', showPrivacy && 'rotate-180')} />
        </button>
        {showPrivacy && (
          <div className="mt-2 text-[12.5px] leading-relaxed text-cafe-body flex flex-col gap-2">
            <p>{b.name} es responsable de tus datos. Usa tu nombre para identificar tu tarjeta de sellos y, si lo das, tu contacto solo para enviarte promociones si lo autorizas.</p>
            <p>VLUX opera la plataforma como encargado. Tus datos no se venden. Puedes pedir acceso, corrección o eliminación en el establecimiento.</p>
            <p className="text-cafe-muted">Borrador pendiente de revisión legal. Antes de operar con clientes reales, cada negocio debe publicar su aviso de privacidad conforme a la ley mexicana.</p>
          </div>
        )}
        <label htmlFor="reg-privacy" className="mt-3 flex items-start gap-3 cursor-pointer">
          <input id="reg-privacy" type="checkbox" className="mt-0.5 h-[18px] w-[18px] accent-[#2B1B14]" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} />
          <span className="text-[13px] leading-snug text-cafe-body">Leí y acepto el aviso de privacidad.</span>
        </label>
      </div>

      {error && <p className="text-[13px] text-[#B42318]" role="alert">{error}</p>}
      <Button variant="brand" size="lg" type="submit" disabled={busy || name.trim().length < 2 || !privacy}>
        {busy ? 'Creando…' : 'Crear mi tarjeta'}
      </Button>
    </form>
  );
}

function CardScreen({ view, slug, refresh, personalLink, onLinkSeen }: { view: CustomerCardView; slug: string; refresh: () => void; personalLink: string | null; onLinkSeen: () => void }) {
  const { business: b, program, card } = view;
  const toast = useToast();
  const [walletOpen, setWalletOpen] = useState<null | 'apple' | 'google'>(null);
  const [rewardOpen, setRewardOpen] = useState(false);
  const reward = card.reward;
  const goal = reward ? reward.stampsCost : program.stampsRequired;
  const shown = Math.min(card.balance, goal);
  const remaining = Math.max(0, goal - card.balance);
  const extra = reward ? Math.max(0, card.balance - reward.stampsCost) : 0;

  // Animar solo los sellos nuevos desde la última vez que el cliente vio su tarjeta en este teléfono.
  const [animateFrom, setAnimateFrom] = useState<number | null>(null);
  const prevKey = useRef('');
  useEffect(() => {
    const key = `${card.publicCode}:${card.cycle}`;
    const seen = getSeen(key);
    if (seen !== null && shown > seen) {
      setAnimateFrom(seen);
      toast('good', shown - seen === 1 ? '¡Nuevo sello en tu tarjeta!' : `¡${shown - seen} sellos nuevos en tu tarjeta!`);
    } else if (prevKey.current !== key) {
      setAnimateFrom(null);
    }
    prevKey.current = key;
    setSeen(key, shown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.publicCode, card.cycle, shown]);

  const [celebrated, setCelebrated] = useState(() => getFlag(`celebrated:${card.publicCode}`));
  const celebrate = reward && celebrated !== reward.code;

  const reviewSent = useRef(false);
  useEffect(() => {
    if (view.review.show && !view.review.alreadyShown && !reviewSent.current) {
      reviewSent.current = true;
      api('POST', `/me/${slug}/review-events`, { kind: 'prompt_shown' }).catch(() => undefined);
    }
  }, [view.review.show, view.review.alreadyShown, slug]);

  const reviewEvent = useCallback((kind: 'link_opened' | 'dismissed') => {
    api('POST', `/me/${slug}/review-events`, { kind }).then(() => kind === 'dismissed' && refresh()).catch(() => undefined);
  }, [slug, refresh]);

  const message = reward
    ? 'Tu recompensa está lista. Muéstrala en caja cuando quieras usarla.'
    : card.balance === 0
      ? card.cycle > 1 ? 'Nuevo ciclo. Tu siguiente compra suma el primer sello.' : 'Tu primera compra suma tu primer sello.'
      : remaining === 1 ? '¡Te falta 1 sello para tu recompensa!' : `¡Solo te faltan ${remaining} sellos para tu recompensa!`;

  return (
    <div className="screen-in pt-5 flex flex-col gap-5">
      <div className="min-w-0">
        <div className="text-[12px] text-cafe-muted">Hola,</div>
        <div className="font-display text-[22px] text-cafe-ink leading-tight truncate">{card.customerName}</div>
      </div>

      {personalLink && (
        <section className="rounded-2xl border-2 border-[#BFE6EC] bg-[#EEF8FA] p-4 flex flex-col gap-2" aria-labelledby="link-title">
          <div id="link-title" className="flex items-center gap-2 text-[14px] font-semibold text-[#0B4F58]"><Link2 size={16} /> Guarda tu enlace personal</div>
          <p className="text-[12.5px] text-[#0E6874] leading-snug">Tu tarjeta quedó guardada en este teléfono. Con este enlace la abres en otro teléfono o si borras el navegador. No lo compartas: es tu llave.</p>
          <div className="flex items-center gap-1 rounded-lg bg-white border border-[#BFE6EC] px-2 py-1.5">
            <span className="text-[11.5px] font-mono text-ink truncate flex-1 select-all" data-testid="personal-link">{personalLink}</span>
            <CopyButton text={personalLink} />
          </div>
          <button className="self-end text-[12.5px] text-[#0E6874] underline underline-offset-2" onClick={onLinkSeen}>Ya lo guardé</button>
        </section>
      )}

      <LoyaltyCardFace businessName={b.name} customerName={card.customerName} cardId={card.publicCode} total={goal} filled={shown} rewardReady={!!reward} animateFrom={animateFrom} footer={<span className="opacity-70">Ciclo {card.cycle}</span>} />

      <div className="flex flex-col gap-2 -mt-1">
        <p className="text-[15px] font-medium text-cafe-ink" data-testid="progress-message">{message}</p>
        <div className="h-1.5 rounded-full bg-cafe-line/70 overflow-hidden" aria-hidden="true">
          <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${(shown / goal) * 100}%`, background: 'var(--accent)' }} />
        </div>
        <div className="flex flex-wrap justify-between gap-x-3 text-[12px] text-cafe-muted tabular-nums">
          <span data-testid="stamp-count">{shown} de {goal} sellos</span>
          <span className="min-w-0">Recompensa: {program.rewardDescription}</span>
        </div>
        {extra > 0 && <p className="text-[12.5px] text-cafe-muted">Además llevas +{plural(extra, 'sello', 'sellos')} para tu siguiente ciclo.</p>}
      </div>

      {reward && (
        <div className="reward-panel rounded-2xl p-4 flex items-center gap-4">
          <div className="h-12 w-12 shrink-0 rounded-full inline-flex items-center justify-center" style={{ background: 'var(--accent)', color: 'var(--brand)' }}><Gift size={22} /></div>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] uppercase tracking-[0.12em] text-cafe-muted">Recompensa disponible</div>
            <div className="text-[15px] font-medium text-cafe-ink">{reward.description}</div>
          </div>
          <Button variant="brand" size="sm" onClick={() => setRewardOpen(true)}>Ver</Button>
        </div>
      )}

      <section className="rounded-2xl bg-white border border-cafe-line p-5 flex flex-col items-center text-center gap-3">
        <div className="text-[13px] font-medium text-cafe-ink">Muestra este código en caja para recibir tus sellos</div>
        <div className="rounded-2xl border border-cafe-line p-2 bg-white">
          <QRCode value={cardQrValue(card.publicCode)} size={176} fg="#1E140F" label={`Código QR de la tarjeta ${card.publicCode}`} />
        </div>
        <div className="flex items-center gap-1">
          <span className="font-mono text-[15px] tracking-[0.12em] text-cafe-ink select-all" data-testid="card-code">{card.publicCode}</span>
          <CopyButton text={card.publicCode} />
        </div>
        <p className="text-[12px] text-cafe-muted max-w-[300px]">Si no se puede escanear, el personal puede escribir este código. El código solo identifica tu tarjeta: los sellos los autoriza el personal.</p>
      </section>

      <div className="grid grid-cols-2 gap-2.5">
        <button onClick={() => setWalletOpen('apple')} className="wallet-btn"><Wallet size={17} /> <span className="leading-tight text-left"><span className="block text-[10.5px] opacity-70">Vista previa</span>Apple Wallet</span></button>
        <button onClick={() => setWalletOpen('google')} className="wallet-btn"><Wallet size={17} /> <span className="leading-tight text-left"><span className="block text-[10.5px] opacity-70">Vista previa</span>Google Wallet</span></button>
      </div>

      {view.review.show && b.reviewUrl && (
        <section className="rounded-2xl bg-white border border-cafe-line p-5">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 shrink-0 rounded-full bg-cafe-cream inline-flex items-center justify-center text-cafe-ink"><Star size={18} /></div>
            <div className="min-w-0">
              <h3 className="text-[15px] font-medium text-cafe-ink">Gracias por visitarnos nuevamente.</h3>
              <p className="text-[13.5px] text-cafe-body mt-0.5">Tu opinión nos ayuda a mejorar.</p>
            </div>
          </div>
          <div className="mt-4 flex flex-col sm:flex-row gap-2">
            <a href={b.reviewUrl} target="_blank" rel="noopener noreferrer" onClick={() => reviewEvent('link_opened')} className="inline-flex flex-1 items-center justify-center gap-2 h-11 px-4 rounded-xl border border-cafe-line text-[14px] font-medium text-cafe-ink hover:bg-cafe-cream/60">
              Compartir mi experiencia en Google <ExternalLink size={15} />
            </a>
            <button onClick={() => reviewEvent('dismissed')} className="h-11 px-4 text-[13px] text-cafe-muted hover:text-cafe-ink">Ahora no</button>
          </div>
          <p className="mt-3 text-[11.5px] text-cafe-muted leading-snug">Es voluntario y no da sellos ni premios.</p>
        </section>
      )}

      <section className="rounded-2xl bg-white/70 border border-cafe-line">
        <div className="px-5 pt-4 pb-2 text-[13px] font-medium text-cafe-ink">Mis movimientos</div>
        <ul className="divide-y divide-cafe-line/70">
          {view.history.map((o, i) => (
            <li key={o.kind + o.at + i} className="px-5 py-2.5 flex items-center justify-between gap-3 text-[13px]">
              <span className="inline-flex items-center gap-2 text-cafe-body min-w-0">
                {o.kind === 'purchase' ? <VerticalIcon v={b.vertical} size={14} /> : o.kind === 'card_created' ? <Plus size={14} /> : o.kind === 'reward_redeemed' ? <Check size={14} /> : <Gift size={14} />}
                <span className="truncate">{o.kind === 'purchase' ? `Compra · +${plural(o.stamps, 'sello', 'sellos')}` : o.kind === 'card_created' ? 'Tarjeta creada' : o.kind === 'reward_redeemed' ? 'Recompensa canjeada' : 'Recompensa desbloqueada'}</span>
              </span>
              <span className="shrink-0 text-cafe-muted tabular-nums text-[12px] inline-flex items-center gap-1"><Clock size={12} /> {formatDateTime(o.at)}</span>
            </li>
          ))}
        </ul>
        <div className="px-5 py-3 text-[12px] text-cafe-muted border-t border-cafe-line/70">Visitas registradas: {card.visits} · Recompensas canjeadas: {card.redeemed}</div>
      </section>

      <details className="rounded-2xl border border-cafe-line bg-white/50 px-5 py-3 group">
        <summary className="cursor-pointer list-none flex items-center justify-between text-[13px] font-medium text-cafe-ink">Reglas del programa <ChevronDown size={16} className="transition group-open:rotate-180" /></summary>
        <ul className="mt-2 mb-1 flex flex-col gap-1.5 text-[12.5px] text-cafe-body list-disc pl-4">
          <li>{program.stampMode === 'per_item' ? `Cada artículo válido suma 1 sello, hasta ${program.maxStampsPerPurchase} por compra.` : 'Cada compra válida suma 1 sello.'} Los sellos los autoriza el personal.</li>
          <li>Al juntar {program.stampsRequired} sellos recibes: {lowerFirst(program.rewardDescription)}.</li>
          <li>La recompensa se canjea en {b.name}. Después inicia un nuevo ciclo.</li>
          <li>Los sellos son personales y no se otorgan por reseñas.</li>
        </ul>
      </details>

      <PoweredByVlux />

      {celebrate && reward && (
        <Celebration
          message={`¡Felicidades! Ganaste: ${lowerFirst(reward.description)}.`}
          sub="Muestra tu recompensa en caja cuando quieras usarla."
          onView={() => { setFlag(`celebrated:${card.publicCode}`, reward.code); setCelebrated(reward.code); setRewardOpen(true); }}
        />
      )}

      <Modal open={rewardOpen && !!reward} onClose={() => setRewardOpen(false)} title="Tu recompensa" labelledBy="reward-title">
        {reward && (
          <div className="flex flex-col items-center text-center gap-3">
            <Badge tone="good">Disponible</Badge>
            <div className="font-display text-[22px] text-ink">{reward.description}</div>
            <p className="text-[13.5px] text-slate2 max-w-[320px]">Muestra este código al personal. Seguirá disponible hasta que lo confirmen en caja.</p>
            <div className="rounded-2xl border border-line p-2"><QRCode value={rewardQrValue(reward.code)} size={150} label={`Código de canje ${reward.code}`} /></div>
            <div className="font-mono text-[22px] tracking-[0.18em] text-ink select-all">{reward.code}</div>
            <div className="text-[12px] text-slate2">Desbloqueada {formatDateTime(reward.unlockedAt)}</div>
          </div>
        )}
      </Modal>

      <WalletPreview kind={walletOpen} onClose={() => setWalletOpen(null)} view={view} />
    </div>
  );
}

function Celebration({ message, sub, onView }: { message: string; sub: string; onView: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center gutter" role="dialog" aria-modal="true" aria-label="Recompensa desbloqueada">
      <div className="absolute inset-0 bg-[#140c08]/70 backdrop-blur-sm anim-fade" />
      <div className="relative w-full max-w-[380px] rounded-[28px] p-7 text-center text-[color:var(--cream)] celebrate-card" style={{ background: 'var(--brand)' }}>
        <div className="relative mx-auto h-28 w-28">
          <svg viewBox="0 0 120 120" className="absolute inset-0" aria-hidden="true">
            <circle cx="60" cy="60" r="52" fill="none" stroke="var(--accent)" strokeOpacity=".2" strokeWidth="2" />
            <circle cx="60" cy="60" r="52" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" className="ring-draw" transform="rotate(-90 60 60)" />
          </svg>
          {Array.from({ length: 10 }).map((_, i) => (<span key={i} className="spark" style={{ ['--a' as string]: `${i * 36}deg`, animationDelay: `${700 + i * 25}ms` } as React.CSSProperties} />))}
          <div className="absolute inset-0 flex items-center justify-center pop-in">
            <div className="h-16 w-16 rounded-full inline-flex items-center justify-center" style={{ background: 'var(--accent)', color: 'var(--brand)' }}><Gift size={28} /></div>
          </div>
        </div>
        <h2 className="mt-6 font-display text-[24px] leading-tight text-balance fade-up" style={{ animationDelay: '500ms' }}>{message}</h2>
        <p className="mt-2 text-[14px] opacity-70 fade-up" style={{ animationDelay: '650ms' }}>{sub}</p>
        <button onClick={onView} className="mt-6 w-full h-12 rounded-xl font-medium text-[15px] fade-up hover:brightness-105" style={{ background: 'var(--accent)', color: 'var(--brand)', animationDelay: '800ms' }}>Ver mi recompensa</button>
      </div>
    </div>
  );
}

function WalletPreview({ kind, onClose, view }: { kind: null | 'apple' | 'google'; onClose: () => void; view: CustomerCardView }) {
  const [tab, setTab] = useState<'apple' | 'google'>('apple');
  useEffect(() => { if (kind) setTab(kind); }, [kind]);
  const { business: b, card, program } = view;
  const goal = card.reward ? card.reward.stampsCost : program.stampsRequired;
  const shown = Math.min(card.balance, goal);
  const remaining = Math.max(0, goal - card.balance);
  return (
    <Modal open={!!kind} onClose={onClose} title="Vista previa del pase digital (demostración)" labelledBy="wallet-title">
      <div className="rounded-xl bg-[#FFFAEB] border border-[#FEDF89] px-3.5 py-2.5 text-[12.5px] text-[#93370D] leading-snug flex gap-2">
        <Info size={15} className="shrink-0 mt-[1px]" />
        <span>Solo es una vista previa. <strong>El pase no se agregó a tu teléfono.</strong> La integración real con Apple Wallet y Google Wallet está planeada para la siguiente versión.</span>
      </div>
      <div className="mt-4 inline-flex rounded-xl bg-[#F1F3F6] p-1 w-full">
        {(['apple', 'google'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cx('flex-1 h-9 rounded-lg text-[13px] font-medium transition', tab === t ? 'bg-white shadow-sm text-ink' : 'text-slate2')}>{t === 'apple' ? 'Apple Wallet' : 'Google Wallet'}</button>
        ))}
      </div>
      <div className="mt-4 flex justify-center">
        {tab === 'apple' ? (
          <div className="w-[300px] max-w-full rounded-[18px] overflow-hidden shadow-xl text-[color:var(--cream)]" style={{ background: 'var(--brand)' }}>
            <div className="flex items-center justify-between px-4 pt-3.5">
              <div className="flex items-center gap-2 min-w-0"><BusinessLogo name={b.name} size={26} ring={false} /><span className="text-[13px] font-medium truncate">{b.name}</span></div>
              <div className="text-right"><div className="text-[9px] uppercase opacity-60 tracking-wider">Sellos</div><div className="text-[16px] tabular-nums">{shown}/{goal}</div></div>
            </div>
            <div className="mx-4 mt-3 rounded-lg h-[86px] flex items-center justify-center gap-1.5 flex-wrap px-3" style={{ background: 'color-mix(in srgb, var(--brand) 70%, #000)' }}>
              {Array.from({ length: goal }).map((_, i) => (<span key={i} className="h-[18px] w-[18px] rounded-full" style={i < shown ? { background: 'var(--accent)' } : { border: '1.5px dashed color-mix(in srgb, var(--cream) 40%, transparent)' }} />))}
            </div>
            <div className="px-4 mt-3 grid grid-cols-2 gap-2 text-[11px]">
              <div className="min-w-0"><div className="uppercase opacity-60 tracking-wider text-[9px]">Cliente</div><div className="truncate">{card.customerName}</div></div>
              <div className="text-right"><div className="uppercase opacity-60 tracking-wider text-[9px]">Recompensa</div>{card.reward ? 'Lista para canjear' : `Faltan ${remaining}`}</div>
            </div>
            <div className="mt-4 mb-4 mx-auto w-[132px] rounded-lg bg-white p-2"><QRCode value={cardQrValue(card.publicCode)} size={116} /></div>
            <div className="text-center text-[10px] font-mono opacity-60 pb-3">{card.publicCode}</div>
          </div>
        ) : (
          <div className="w-[300px] max-w-full rounded-[22px] overflow-hidden shadow-xl bg-white border border-line">
            <div className="px-4 pt-4 pb-5 text-[color:var(--cream)]" style={{ background: 'var(--brand)' }}>
              <div className="flex items-center gap-2 min-w-0"><BusinessLogo name={b.name} size={28} ring={false} /><span className="text-[13px] truncate">{b.name}</span></div>
              <div className="mt-4 text-[20px] font-display truncate">{card.customerName}</div>
              <div className="mt-3 grid grid-cols-2 text-[11px]">
                <div><div className="opacity-60">Sellos</div><div className="text-[15px] tabular-nums">{shown} de {goal}</div></div>
                <div><div className="opacity-60">Recompensa</div><div className="text-[13px]">{card.reward ? 'Disponible' : program.rewardDescription}</div></div>
              </div>
            </div>
            <div className="p-4 flex flex-col items-center gap-2"><QRCode value={cardQrValue(card.publicCode)} size={130} /><div className="text-[10.5px] font-mono text-slate2">{card.publicCode}</div></div>
          </div>
        )}
      </div>
      <Button variant="secondary" className="w-full mt-5" onClick={onClose}>Entendido</Button>
    </Modal>
  );
}
