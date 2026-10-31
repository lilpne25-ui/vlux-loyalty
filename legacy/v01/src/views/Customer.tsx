// Vista del cliente: bienvenida (tras escanear el QR del mostrador), registro, tarjeta, premio y reseña.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Gift, ShieldCheck, Star, Wallet, ChevronDown, Repeat, Coffee, Clock, ExternalLink, Info, Plus, Check } from 'lucide-react';
import { State, Command, Result, Card, progressOf, customerOf, redeemedRewardsOf, opsOf, formatDateTime, QR_PREFIX, validateContact } from '../domain/model';
import { Button, Modal, QRCode, CopyButton, Field, inputCls, BusinessLogo, CupIllustration, PoweredByVlux, useToast, cx, Badge, SampleBadge } from '../components/ui';
import { LoyaltyCardFace } from '../components/LoyaltyCard';
import { getSeen, setSeen } from '../lib/store';

type Props = { state: State; run: (c: Command) => Result };
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function CustomerView({ state, run }: Props) {
  const [screen, setScreen] = useState<'welcome' | 'register'>('welcome');
  const card = state.myCardId ? state.cards.find((c) => c.id === state.myCardId) : null;

  return (
    <div className="cafe-bg min-h-full">
      <div className="mx-auto w-full max-w-[460px] gutter pb-10">
        {card ? (
          <CardScreen state={state} run={run} card={card} />
        ) : screen === 'welcome' ? (
          <Welcome state={state} onStart={() => setScreen('register')} run={run} />
        ) : (
          <Register state={state} run={run} onBack={() => setScreen('welcome')} />
        )}
      </div>
    </div>
  );
}

function Welcome({ state, onStart, run }: { state: State; onStart: () => void; run: Props['run'] }) {
  const b = state.business;
  const [pick, setPick] = useState(false);
  return (
    <div className="screen-in pt-6 sm:pt-10 flex flex-col">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <BusinessLogo name={b.name} size={38} />
          <div>
            <div className="font-display text-[16px] text-cafe-ink leading-tight">{b.name}</div>
            <div className="text-[11.5px] text-cafe-muted">{b.city.split(',')[0]}</div>
          </div>
        </div>
        <span className="text-[11px] text-cafe-muted inline-flex items-center gap-1.5 rounded-full border border-cafe-line px-2.5 py-1 bg-white/60">
          <span className="h-1.5 w-1.5 rounded-full bg-[#12B76A]" /> QR del mostrador
        </span>
      </div>

      <div className="relative mt-6 rounded-[28px] overflow-hidden hero-panel" style={{ background: 'var(--brand)' }}>
        <div className="absolute inset-0 hero-glow" />
        <CupIllustration className="relative w-full h-auto px-6 pt-6 -mb-2" />
        <div className="relative px-6 pb-6 text-[color:var(--cream)]">
          <div className="text-[11px] uppercase tracking-[0.18em] opacity-60">{b.category}</div>
        </div>
      </div>

      <h1 className="mt-7 font-display text-[30px] sm:text-[34px] leading-[1.08] text-cafe-ink text-balance">Tu café favorito ahora tiene recompensas.</h1>
      <p className="mt-3 text-[16px] text-cafe-body leading-relaxed">
        Acumula {b.stampsRequired} sellos y recibe {lowerFirst(b.rewardDescription)}.
      </p>

      <div className="mt-6 grid grid-cols-3 gap-2 text-center">
        {[
          { icon: <Coffee size={17} />, t: '1 compra', s: '= 1 sello' },
          { icon: <Gift size={17} />, t: `${b.stampsRequired} sellos`, s: '= premio' },
          { icon: <ShieldCheck size={17} />, t: 'Sin app', s: 'ni contraseña' },
        ].map((x) => (
          <div key={x.t} className="rounded-2xl bg-white/70 border border-cafe-line px-2 py-3">
            <div className="mx-auto h-8 w-8 rounded-full inline-flex items-center justify-center text-cafe-ink bg-cafe-cream">{x.icon}</div>
            <div className="mt-1.5 text-[13px] font-medium text-cafe-ink">{x.t}</div>
            <div className="text-[11.5px] text-cafe-muted">{x.s}</div>
          </div>
        ))}
      </div>

      <Button variant="brand" size="lg" className="mt-7 w-full" onClick={onStart}>
        Obtener mi tarjeta gratis <ArrowRight size={18} />
      </Button>
      <button className="mt-3 text-[13px] text-cafe-muted underline underline-offset-4 decoration-cafe-line hover:text-cafe-ink self-center" onClick={() => setPick(true)}>
        Ya tengo tarjeta en este dispositivo (demo)
      </button>
      <div className="mt-10">
        <PoweredByVlux />
      </div>
      <CardPicker open={pick} onClose={() => setPick(false)} state={state} run={run} />
    </div>
  );
}

function Register({ state, run, onBack }: { state: State; run: Props['run']; onBack: () => void }) {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [consent, setConsent] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const contactError = contact ? validateContact(contact) : null;
  const b = state.business;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const r = run({ type: 'createCustomer', name, contact, marketingConsent: consent, setAsMine: true });
    if (!r.ok) {
      setError(r.message || 'Revisa los datos.');
      setBusy(false);
      return;
    }
    toast('good', `Tarjeta creada: ${r.data!.cardId}`);
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
        <Field label="¿Cómo te llamas?" htmlFor="reg-name" error={error && name.trim().length < 2 ? error : null} hint="Así aparecerá en tu tarjeta. Puede ser solo tu nombre.">
          <input id="reg-name" className={inputCls} autoComplete="off" placeholder="Ej. Mariana" value={name} maxLength={40} onChange={(e) => { setName(e.target.value); setError(null); }} />
        </Field>
        <Field label={<span>WhatsApp o correo <span className="font-normal text-slate2">(opcional)</span></span>} htmlFor="reg-contact" error={contactError} hint="Sirve para recuperar tu tarjeta si cambias de teléfono.">
          <input id="reg-contact" className={inputCls} autoComplete="off" inputMode="email" placeholder="722 123 4567 o tu@correo.com" value={contact} onChange={(e) => { setContact(e.target.value); setError(null); }} />
        </Field>
        <label htmlFor="reg-consent" className={cx('flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition', contact ? 'border-cafe-line' : 'border-cafe-line opacity-55 pointer-events-none')}>
          <input id="reg-consent" type="checkbox" className="mt-0.5 h-[18px] w-[18px] accent-[#2B1B14]" checked={consent && !!contact} disabled={!contact} onChange={(e) => setConsent(e.target.checked)} />
          <span className="text-[13px] leading-snug text-cafe-body">
            Quiero recibir promociones de {b.name}. <span className="text-cafe-muted">Opcional. Puedes cancelarlo cuando quieras. No afecta tus sellos.</span>
          </span>
        </label>
      </div>

      <div className="rounded-2xl border border-dashed border-cafe-line bg-white/50 px-4 py-3">
        <button type="button" className="w-full flex items-center justify-between text-left text-[13px] font-medium text-cafe-ink" onClick={() => setShowPrivacy((v) => !v)} aria-expanded={showPrivacy}>
          <span className="inline-flex items-center gap-2"><ShieldCheck size={16} /> Aviso de privacidad (demostración)</span>
          <ChevronDown size={16} className={cx('transition', showPrivacy && 'rotate-180')} />
        </button>
        {showPrivacy && (
          <div className="mt-2 text-[12.5px] leading-relaxed text-cafe-body flex flex-col gap-2">
            <p>{b.name} usará tu nombre para identificar tu tarjeta de sellos y, si lo das, tu contacto para recuperarla. Solo enviará promociones si marcas la casilla de arriba.</p>
            <p>Tus datos no se venden ni se comparten con terceros. Puedes pedir su corrección o eliminación en el establecimiento.</p>
            <p className="text-cafe-muted">Texto de ejemplo. Antes de operar con clientes reales se requiere el aviso de privacidad del negocio conforme a la ley mexicana de protección de datos personales.</p>
          </div>
        )}
      </div>

      <p className="text-[12px] text-cafe-muted flex gap-2 leading-snug"><Info size={14} className="shrink-0 mt-[1px]" /> Esta es una demostración: no escribas datos personales reales. Todo se guarda solo en este navegador.</p>

      <Button variant="brand" size="lg" type="submit" disabled={busy || name.trim().length < 2 || !!contactError}>
        Crear mi tarjeta
      </Button>
      {error && name.trim().length >= 2 && <p className="text-[13px] text-[#B42318] -mt-2">{error}</p>}
    </form>
  );
}

function CardPicker({ open, onClose, state, run }: { open: boolean; onClose: () => void; state: State; run: Props['run'] }) {
  const sorted = useMemo(() => [...state.cards].sort((a, b) => Number(a.isSample) - Number(b.isSample) || Date.parse(b.createdAt) - Date.parse(a.createdAt)), [state.cards]);
  return (
    <Modal open={open} onClose={onClose} title="Ver otra tarjeta (demostración)" labelledBy="picker-title">
      <p className="text-[13px] text-slate2 mb-3">En un teléfono real cada cliente ve solo su tarjeta. Aquí puedes cambiar para enseñar distintos casos.</p>
      <div className="flex flex-col divide-y divide-line border border-line rounded-xl overflow-hidden">
        {sorted.map((c) => {
          const cu = customerOf(state, c);
          const p = progressOf(state, c);
          return (
            <button key={c.id} className={cx('flex items-center justify-between gap-3 px-3.5 py-3 text-left hover:bg-[#F8F9FB]', c.id === state.myCardId && 'bg-[#F3FAFB]')} onClick={() => { run({ type: 'setMyCard', cardId: c.id }); onClose(); }}>
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-[14px] font-medium text-ink truncate">{cu.name} {c.isSample ? <SampleBadge /> : <Badge tone="info">En vivo</Badge>}</span>
                <span className="text-[12px] font-mono text-slate2">{c.id}</span>
              </span>
              <span className="shrink-0 text-[12.5px] text-slate2 tabular-nums">{p.reward ? <Badge tone="gold">Premio listo</Badge> : `${p.shown}/${p.required}`}</span>
            </button>
          );
        })}
      </div>
      <Button variant="secondary" className="w-full mt-4" onClick={() => { run({ type: 'setMyCard', cardId: null }); onClose(); }}>
        <Plus size={16} /> Crear una tarjeta nueva
      </Button>
    </Modal>
  );
}

function CardScreen({ state, run, card }: Props & { card: Card }) {
  const b = state.business;
  const customer = customerOf(state, card);
  const p = progressOf(state, card);
  const toast = useToast();
  const [walletOpen, setWalletOpen] = useState<null | 'apple' | 'google'>(null);
  const [rewardOpen, setRewardOpen] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const redeemed = redeemedRewardsOf(state, card.id);

  // Animar solo los sellos nuevos desde la última vez que el cliente vio su tarjeta.
  const [animateFrom, setAnimateFrom] = useState<number | null>(null);
  const prevKey = useRef<string>('');
  useEffect(() => {
    const key = `${card.id}:${card.cycle}`;
    const seen = getSeen(key);
    if (seen !== null && p.shown > seen) {
      setAnimateFrom(seen);
      if (card.id === state.myCardId && !card.isSample) run({ type: 'demoFlag', flag: 'sawNewStamp' });
      toast('good', p.shown - seen === 1 ? '¡Nuevo sello en tu tarjeta!' : `¡${p.shown - seen} sellos nuevos en tu tarjeta!`);
    } else if (prevKey.current !== key) {
      setAnimateFrom(null);
    }
    prevKey.current = key;
    setSeen(key, p.shown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id, card.cycle, p.shown]);

  const celebrate = p.reward && card.celebratedRewardId !== p.reward.id;
  const showReview = card.totalVisits >= 2 && !card.reviewPromptDismissed;
  useEffect(() => {
    if (showReview && !card.reviewPromptShownAt) run({ type: 'markReviewPrompt', cardId: card.id });
  }, [showReview, card.reviewPromptShownAt, card.id, run]);

  const message = p.reward
    ? 'Tu recompensa está lista. Muéstrala en caja cuando quieras usarla.'
    : card.stamps === 0
      ? card.cycle > 1
        ? 'Nuevo ciclo. Tu siguiente compra suma el primer sello.'
        : 'Tu primera compra suma tu primer sello.'
      : p.remaining === 1
        ? '¡Te falta 1 visita para tu recompensa!'
        : `¡Solo te faltan ${p.remaining} visitas para tu recompensa!`;

  const history = opsOf(state, card.id)
    .filter((o) => ['stamp', 'reward_redeemed', 'reward_unlocked', 'card_created'].includes(o.type))
    .slice(-6)
    .reverse();

  return (
    <div className="screen-in pt-5 flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] text-cafe-muted">Hola,</div>
          <div className="font-display text-[22px] text-cafe-ink leading-tight truncate">{customer.name}</div>
        </div>
        <button onClick={() => setPickOpen(true)} className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-cafe-line bg-white/70 px-3 h-8 text-[12px] text-cafe-body hover:bg-white">
          <Repeat size={13} /> Cambiar tarjeta
        </button>
      </div>

      <LoyaltyCardFace
        businessName={b.name}
        customerName={customer.name}
        cardId={card.id}
        total={p.required}
        filled={p.shown}
        rewardReady={!!p.reward}
        animateFrom={animateFrom}
        footer={<span className="opacity-70">Ciclo {card.cycle}</span>}
      />

      <div className="flex flex-col gap-2 -mt-1">
        <div className="flex items-baseline justify-between">
          <p className="text-[15px] font-medium text-cafe-ink">{message}</p>
        </div>
        <div className="h-1.5 rounded-full bg-cafe-line/70 overflow-hidden" aria-hidden="true">
          <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${(p.shown / p.required) * 100}%`, background: 'var(--accent)' }} />
        </div>
        <div className="flex justify-between text-[12px] text-cafe-muted tabular-nums">
          <span>{p.shown} de {p.required} sellos</span>
          <span>Recompensa: {b.rewardDescription}</span>
        </div>
        {p.extra > 0 && <p className="text-[12.5px] text-cafe-muted">Además llevas +{p.extra} {p.extra === 1 ? 'sello' : 'sellos'} para tu siguiente ciclo.</p>}
      </div>

      {p.reward && (
        <div className="reward-panel rounded-2xl p-4 flex items-center gap-4">
          <div className="h-12 w-12 shrink-0 rounded-full inline-flex items-center justify-center" style={{ background: 'var(--accent)', color: 'var(--brand)' }}>
            <Gift size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] uppercase tracking-[0.12em] text-cafe-muted">Recompensa disponible</div>
            <div className="text-[15px] font-medium text-cafe-ink">{p.reward.description}</div>
          </div>
          <Button variant="brand" size="sm" onClick={() => setRewardOpen(true)}>Ver</Button>
        </div>
      )}

      <section className="rounded-2xl bg-white border border-cafe-line p-5 flex flex-col items-center text-center gap-3">
        <div className="text-[13px] font-medium text-cafe-ink">Muestra este código en caja para recibir tu sello</div>
        <div className="rounded-2xl border border-cafe-line p-2 bg-white">
          <QRCode value={QR_PREFIX + card.id} size={176} fg="#1E140F" label={`Código QR de la tarjeta ${card.id}`} />
        </div>
        <div className="flex items-center gap-1">
          <span className="font-mono text-[15px] tracking-[0.12em] text-cafe-ink select-all">{card.id}</span>
          <CopyButton text={card.id} />
        </div>
        <p className="text-[12px] text-cafe-muted max-w-[300px]">Si no se puede escanear, el personal puede escribir este identificador.</p>
      </section>

      <div className="grid grid-cols-2 gap-2.5">
        <button onClick={() => setWalletOpen('apple')} className="wallet-btn">
          <Wallet size={17} /> <span className="leading-tight text-left"><span className="block text-[10.5px] opacity-70">Agregar a</span>Apple Wallet</span>
        </button>
        <button onClick={() => setWalletOpen('google')} className="wallet-btn">
          <Wallet size={17} /> <span className="leading-tight text-left"><span className="block text-[10.5px] opacity-70">Agregar a</span>Google Wallet</span>
        </button>
      </div>

      {showReview && (
        <section className="rounded-2xl bg-white border border-cafe-line p-5">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 shrink-0 rounded-full bg-cafe-cream inline-flex items-center justify-center text-cafe-ink"><Star size={18} /></div>
            <div className="min-w-0">
              <h3 className="text-[15px] font-medium text-cafe-ink">Gracias por visitarnos nuevamente.</h3>
              <p className="text-[13.5px] text-cafe-body mt-0.5">Tu opinión nos ayuda a mejorar.</p>
            </div>
          </div>
          <div className="mt-4 flex flex-col sm:flex-row gap-2">
            <a
              href={b.reviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => run({ type: 'reviewLinkOpened', cardId: card.id })}
              className="inline-flex flex-1 items-center justify-center gap-2 h-11 px-4 rounded-xl border border-cafe-line text-[14px] font-medium text-cafe-ink hover:bg-cafe-cream/60"
            >
              Compartir mi experiencia en Google <ExternalLink size={15} />
            </a>
            <button onClick={() => run({ type: 'dismissReviewPrompt', cardId: card.id })} className="h-11 px-4 text-[13px] text-cafe-muted hover:text-cafe-ink">Ahora no</button>
          </div>
          <p className="mt-3 text-[11.5px] text-cafe-muted leading-snug">
            Es voluntario y no da sellos ni premios.{b.reviewUrlIsExample && ' Enlace de ejemplo: el dueño lo cambia por el de su ficha de Google.'}
          </p>
        </section>
      )}

      <section className="rounded-2xl bg-white/70 border border-cafe-line">
        <div className="px-5 pt-4 pb-2 text-[13px] font-medium text-cafe-ink">Mis movimientos</div>
        <ul className="divide-y divide-cafe-line/70">
          {history.map((o) => (
            <li key={o.id} className="px-5 py-2.5 flex items-center justify-between gap-3 text-[13px]">
              <span className="inline-flex items-center gap-2 text-cafe-body">
                {o.type === 'stamp' ? <Coffee size={14} /> : o.type === 'card_created' ? <Plus size={14} /> : o.type === 'reward_redeemed' ? <Check size={14} /> : <Gift size={14} />}
                {o.type === 'stamp' ? 'Sello por visita' : o.type === 'card_created' ? 'Tarjeta creada' : o.type === 'reward_redeemed' ? 'Recompensa canjeada' : 'Recompensa desbloqueada'}
              </span>
              <span className="text-cafe-muted tabular-nums text-[12px] inline-flex items-center gap-1"><Clock size={12} /> {formatDateTime(o.at)}</span>
            </li>
          ))}
        </ul>
        {redeemed.length > 0 && <div className="px-5 py-3 text-[12px] text-cafe-muted border-t border-cafe-line/70">Recompensas canjeadas: {redeemed.length}</div>}
      </section>

      <details className="rounded-2xl border border-cafe-line bg-white/50 px-5 py-3 group">
        <summary className="cursor-pointer list-none flex items-center justify-between text-[13px] font-medium text-cafe-ink">
          Reglas del programa <ChevronDown size={16} className="transition group-open:rotate-180" />
        </summary>
        <ul className="mt-2 mb-1 flex flex-col gap-1.5 text-[12.5px] text-cafe-body list-disc pl-4">
          <li>Una compra válida equivale a un sello, autorizado por el personal.</li>
          <li>Al juntar {b.stampsRequired} sellos recibes: {lowerFirst(b.rewardDescription)}.</li>
          <li>La recompensa se canjea en {b.name}. Después inicia un nuevo ciclo.</li>
          <li>Los sellos son personales y no se otorgan por reseñas.</li>
        </ul>
      </details>

      <PoweredByVlux />

      {celebrate && (
        <Celebration
          message="¡Felicidades! Tu próxima bebida va por nuestra cuenta."
          sub={p.reward!.description}
          onView={() => {
            run({ type: 'celebrate', cardId: card.id, rewardId: p.reward!.id });
            setRewardOpen(true);
          }}
        />
      )}

      <Modal open={rewardOpen && !!p.reward} onClose={() => setRewardOpen(false)} title="Tu recompensa" labelledBy="reward-title">
        {p.reward && (
          <div className="flex flex-col items-center text-center gap-3" style={{ ['--brand' as any]: b.primary }}>
            <Badge tone="good">Disponible</Badge>
            <div className="font-display text-[22px] text-ink">{p.reward.description}</div>
            <p className="text-[13.5px] text-slate2 max-w-[320px]">Muestra este código al personal. Seguirá disponible hasta que lo confirmen en caja.</p>
            <div className="rounded-2xl border border-line p-2"><QRCode value={`VLUXLOYALTY:REWARD:${p.reward.code}`} size={150} label={`Código de canje ${p.reward.code}`} /></div>
            <div className="font-mono text-[22px] tracking-[0.18em] text-ink select-all">{p.reward.code}</div>
            <div className="text-[12px] text-slate2">Desbloqueada {formatDateTime(p.reward.unlockedAt)}</div>
          </div>
        )}
      </Modal>

      <WalletPreview kind={walletOpen} onClose={() => setWalletOpen(null)} state={state} card={card} />
      <CardPicker open={pickOpen} onClose={() => setPickOpen(false)} state={state} run={run} />
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
          {Array.from({ length: 10 }).map((_, i) => (
            <span key={i} className="spark" style={{ ['--a' as any]: `${i * 36}deg`, animationDelay: `${700 + i * 25}ms` }} />
          ))}
          <div className="absolute inset-0 flex items-center justify-center pop-in">
            <div className="h-16 w-16 rounded-full inline-flex items-center justify-center" style={{ background: 'var(--accent)', color: 'var(--brand)' }}>
              <Gift size={28} />
            </div>
          </div>
        </div>
        <h2 className="mt-6 font-display text-[24px] leading-tight text-balance fade-up" style={{ animationDelay: '500ms' }}>{message}</h2>
        <p className="mt-2 text-[14px] opacity-70 fade-up" style={{ animationDelay: '650ms' }}>{sub}</p>
        <button onClick={onView} className="mt-6 w-full h-12 rounded-xl font-medium text-[15px] fade-up hover:brightness-105" style={{ background: 'var(--accent)', color: 'var(--brand)', animationDelay: '800ms' }}>
          Ver mi recompensa
        </button>
      </div>
    </div>
  );
}

export function WalletPreview({ kind, onClose, state, card }: { kind: null | 'apple' | 'google'; onClose: () => void; state: State; card: Card }) {
  const [tab, setTab] = useState<'apple' | 'google'>('apple');
  useEffect(() => {
    if (kind) setTab(kind);
  }, [kind]);
  const b = state.business;
  const cu = customerOf(state, card);
  const p = progressOf(state, card);
  return (
    <Modal open={!!kind} onClose={onClose} title="Vista previa del pase digital" labelledBy="wallet-title">
      <div className="rounded-xl bg-[#FFFAEB] border border-[#FEDF89] px-3.5 py-2.5 text-[12.5px] text-[#93370D] leading-snug flex gap-2">
        <Info size={15} className="shrink-0 mt-[1px]" />
        <span>Esto es solo una vista previa. <strong>El pase no se agregó a tu teléfono.</strong> La emisión real llegará cuando VLUX conecte las credenciales oficiales.</span>
      </div>
      <div className="mt-4 inline-flex rounded-xl bg-[#F1F3F6] p-1 w-full">
        {(['apple', 'google'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cx('flex-1 h-9 rounded-lg text-[13px] font-medium transition', tab === t ? 'bg-white shadow-sm text-ink' : 'text-slate2')}>
            {t === 'apple' ? 'Apple Wallet' : 'Google Wallet'}
          </button>
        ))}
      </div>

      <div className="mt-4 flex justify-center">
        {tab === 'apple' ? (
          <div className="w-[300px] max-w-full rounded-[18px] overflow-hidden shadow-xl text-[color:var(--cream)]" style={{ background: 'var(--brand)' }}>
            <div className="flex items-center justify-between px-4 pt-3.5">
              <div className="flex items-center gap-2"><BusinessLogo name={b.name} size={26} ring={false} /><span className="text-[13px] font-medium">{b.name}</span></div>
              <div className="text-right"><div className="text-[9px] uppercase opacity-60 tracking-wider">Sellos</div><div className="text-[16px] tabular-nums">{p.shown}/{p.required}</div></div>
            </div>
            <div className="mx-4 mt-3 rounded-lg h-[86px] flex items-center justify-center gap-1.5 flex-wrap px-3" style={{ background: 'color-mix(in srgb, var(--brand) 70%, #000)' }}>
              {Array.from({ length: p.required }).map((_, i) => (
                <span key={i} className="h-[18px] w-[18px] rounded-full" style={i < p.shown ? { background: 'var(--accent)' } : { border: '1.5px dashed color-mix(in srgb, var(--cream) 40%, transparent)' }} />
              ))}
            </div>
            <div className="px-4 mt-3 grid grid-cols-2 gap-2 text-[11px]">
              <div><div className="uppercase opacity-60 tracking-wider text-[9px]">Cliente</div>{cu.name}</div>
              <div className="text-right"><div className="uppercase opacity-60 tracking-wider text-[9px]">Recompensa</div>{p.reward ? 'Lista para canjear' : `Faltan ${p.remaining}`}</div>
            </div>
            <div className="mt-4 mb-4 mx-auto w-[132px] rounded-lg bg-white p-2"><QRCode value={QR_PREFIX + card.id} size={116} /></div>
            <div className="text-center text-[10px] font-mono opacity-60 pb-3">{card.id}</div>
          </div>
        ) : (
          <div className="w-[300px] max-w-full rounded-[22px] overflow-hidden shadow-xl bg-white border border-line">
            <div className="px-4 pt-4 pb-5 text-[color:var(--cream)]" style={{ background: 'var(--brand)' }}>
              <div className="flex items-center gap-2"><BusinessLogo name={b.name} size={28} ring={false} /><span className="text-[13px]">{b.name}</span></div>
              <div className="mt-4 text-[20px] font-display">{cu.name}</div>
              <div className="mt-3 grid grid-cols-2 text-[11px]">
                <div><div className="opacity-60">Sellos</div><div className="text-[15px] tabular-nums">{p.shown} de {p.required}</div></div>
                <div><div className="opacity-60">Recompensa</div><div className="text-[13px]">{p.reward ? 'Disponible' : b.rewardDescription}</div></div>
              </div>
            </div>
            <div className="p-4 flex flex-col items-center gap-2">
              <QRCode value={QR_PREFIX + card.id} size={130} />
              <div className="text-[10.5px] font-mono text-slate2">{card.id}</div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-5 text-[13px] text-ink font-medium">Qué hará la versión productiva</div>
      <ul className="mt-2 text-[12.5px] text-slate2 flex flex-col gap-1.5 list-disc pl-4 leading-snug">
        {tab === 'apple' ? (
          <>
            <li>Generar un archivo .pkpass firmado con el certificado del Pass Type ID de VLUX.</li>
            <li>Actualizar los sellos en el pase con un servicio web propio y notificaciones push de Apple.</li>
          </>
        ) : (
          <>
            <li>Crear una clase y un objeto de lealtad con la API de Google Wallet y abrir el enlace “Guardar en Google Wallet”.</li>
            <li>Actualizar los sellos del objeto desde el servidor cuando el empleado registre la visita.</li>
          </>
        )}
        <li>El QR del pase sería un token firmado por el servidor, no el identificador visible.</li>
      </ul>
      <Button variant="secondary" className="w-full mt-5" onClick={onClose}>Entendido</Button>
    </Modal>
  );
}
