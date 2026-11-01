// Demostración guiada: una historia en cinco pasos (marca → cliente → compra → premio → dueño), con datos ficticios
// que viven solo en este navegador. Cada acción cambia la tarjeta y los números del panel del dueño.
import { useState } from 'react';
import { Check, QrCode, Store, Gift, BarChart3, Sparkles, ArrowRight, RotateCcw } from 'lucide-react';
import { LoyaltyCardFace } from '../../components/LoyaltyCard';
import { QRCode, cx } from '../../components/ui';
import { brandVars } from '../../components/Brand';
import { FINISHES, type CardFinish } from '../../lib/finish';
import { navigate } from '../../lib/router';

const TOTAL = 5;
const STEPS = [
  { id: 'marca', icon: Store, title: 'Tu marca', lead: 'Pon el nombre de tu negocio y elige cómo se ve tu tarjeta.' },
  { id: 'cliente', icon: QrCode, title: 'Tu cliente escanea', lead: 'Con la cámara del teléfono, sin descargar nada, y recibe su tarjeta.' },
  { id: 'compra', icon: Sparkles, title: 'Compra y sello', lead: 'En caja registras la compra. El cliente ve su sello al instante.' },
  { id: 'premio', icon: Gift, title: 'Premio', lead: 'Al completar los sellos, el premio queda listo para canjear.' },
  { id: 'panel', icon: BarChart3, title: 'Lo ves en tu panel', lead: 'Cada acción de esta demostración se refleja aquí.' },
] as const;

export function GuidedDemo() {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('Tu negocio');
  const [finish, setFinish] = useState<CardFinish>('silver');
  const [hasCard, setHasCard] = useState(false);
  const [filled, setFilled] = useState(0);
  const [visits, setVisits] = useState(0);
  const [rewards, setRewards] = useState(0);
  const ready = filled >= TOTAL;
  const shown = name.trim() || 'Tu negocio';
  const reset = () => { setStep(0); setHasCard(false); setFilled(0); setVisits(0); setRewards(0); };
  const stamp = () => { if (!hasCard || ready) return; setFilled((n) => n + 1); setVisits((n) => n + 1); };
  const redeem = () => { if (!ready) return; setRewards((n) => n + 1); setFilled(0); };
  const S = STEPS[step];

  const card = (
    <div style={brandVars('#14171C', '#67C7D3', finish)} className="w-full max-w-[400px] mx-auto">
      {hasCard || step === 0 ? (
        <LoyaltyCardFace businessName={shown} customerName="Cliente de ejemplo" cardId="VX-DEMO-01" total={TOTAL} filled={hasCard ? filled : 2} rewardReady={hasCard && ready} rewardLabel="Un beneficio de cortesía" footer={<span className="opacity-70">Demostración</span>} />
      ) : (
        <div className="lp-ghost-card" aria-hidden="true">Aún no hay tarjeta</div>
      )}
    </div>
  );

  return (
    <div className="lp-demo" data-testid="guided-demo">
      <ol className="lp-steps" aria-label="Pasos de la demostración">
        {STEPS.map((s, i) => (
          <li key={s.id}>
            <button type="button" onClick={() => setStep(i)} aria-current={i === step ? 'step' : undefined} data-testid={`gd-step-${s.id}`} className={cx('lp-step', i === step && 'on', i < step && 'done')}>
              <span className="lp-step-n">{i < step ? <Check size={14} /> : i + 1}</span>
              <span className="hidden sm:inline">{s.title}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="lp-demo-body" key={S.id}>
        <div className="lp-demo-text">
          <h3 className="font-display text-[26px] sm:text-[32px] leading-tight">{S.title}</h3>
          <p className="mt-2 text-white/70 text-[15.5px] leading-relaxed">{S.lead}</p>

          {step === 0 && (
            <div className="mt-5 flex flex-col gap-4">
              <label className="text-[13px] text-white/70" htmlFor="gd-name">Nombre de tu negocio
                <input id="gd-name" data-testid="gd-name" className="lp-input mt-1.5" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
              </label>
              <div role="radiogroup" aria-label="Acabado de la tarjeta" className="grid grid-cols-3 gap-2">
                {FINISHES.map((f) => (
                  <button key={f.id} type="button" role="radio" aria-checked={finish === f.id} data-testid={`gd-finish-${f.id}`} onClick={() => setFinish(f.id)} className={cx('lp-chip', finish === f.id && 'on')}>{f.label}</button>
                ))}
              </div>
              <button type="button" className="lp-link" onClick={() => navigate('/personalizar')}>¿Tienes logo? Pruébalo en el estudio de marca <ArrowRight size={14} /></button>
            </div>
          )}

          {step === 1 && (
            <div className="mt-5 flex flex-wrap items-center gap-5">
              <div className="rounded-2xl bg-white p-3"><QRCode value="https://vlux.example/n/tu-negocio" size={120} label="QR de ejemplo" /></div>
              <div className="flex flex-col gap-3">
                <p className="text-[13px] text-white/60 max-w-[220px]">El QR vive en tu mostrador. Al escanearlo, el cliente crea su tarjeta en menos de un minuto.</p>
                <button type="button" className="lp-btn" data-testid="gd-create-card" onClick={() => { setHasCard(true); setFilled(0); }} disabled={hasCard}>{hasCard ? <><Check size={16} /> Tarjeta creada</> : 'Escanear y crear tarjeta'}</button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="mt-5 flex flex-col gap-3 items-start">
              {!hasCard && <p className="text-[13px] text-[#F7C97B]">Primero crea la tarjeta del cliente en el paso anterior.</p>}
              <button type="button" className="lp-btn" data-testid="gd-stamp" onClick={stamp} disabled={!hasCard || ready}><Sparkles size={16} /> Registrar compra (+1 sello)</button>
              <p className="text-[13px] text-white/60" aria-live="polite">{hasCard ? `${filled} de ${TOTAL} sellos` : ''}</p>
            </div>
          )}

          {step === 3 && (
            <div className="mt-5 flex flex-col gap-3 items-start">
              {ready ? (
                <button type="button" className="lp-btn" data-testid="gd-redeem" onClick={redeem}><Gift size={16} /> Canjear premio</button>
              ) : (
                <>
                  <p className="text-[13px] text-white/60">{hasCard ? `Faltan ${TOTAL - filled} sellos.` : 'Crea la tarjeta y suma sellos para llegar al premio.'}</p>
                  <button type="button" className="lp-btn" data-testid="gd-fill" onClick={() => { if (hasCard) { setVisits((n) => n + (TOTAL - filled)); setFilled(TOTAL); } }} disabled={!hasCard}>Completar los sellos que faltan</button>
                </>
              )}
              {rewards > 0 && <p className="text-[13px] text-[#6CE9A6]" role="status">Premio canjeado. La tarjeta empezó de nuevo.</p>}
            </div>
          )}

          {step === 4 && (
            <div className="mt-5 grid grid-cols-2 gap-3 max-w-[380px]" data-testid="gd-kpis">
              {[['Clientes', hasCard ? 1 : 0, 'gd-kpi-clientes'], ['Visitas', visits, 'gd-kpi-visitas'], ['Premios canjeados', rewards, 'gd-kpi-premios'], ['Sellos activos', filled, 'gd-kpi-sellos']].map(([k, v, id]) => (
                <div key={String(id)} className="lp-kpi"><div className="text-[12px] text-white/60">{k}</div><div className="font-display text-[32px] tabular-nums" data-testid={String(id)}>{v}</div></div>
              ))}
              <p className="col-span-2 text-[11.5px] text-white/50">Datos ficticios que solo existen en tu navegador.</p>
            </div>
          )}

          <div className="mt-7 flex flex-wrap items-center gap-3">
            {step > 0 && <button type="button" className="lp-btn ghost" onClick={() => setStep(step - 1)}>Atrás</button>}
            {step < STEPS.length - 1
              ? <button type="button" className="lp-btn primary" data-testid="gd-next" onClick={() => setStep(step + 1)}>Siguiente <ArrowRight size={16} /></button>
              : <><button type="button" className="lp-btn primary" onClick={() => document.getElementById('solicitar')?.scrollIntoView({ behavior: 'smooth' })}>Quiero esto en mi negocio</button><button type="button" className="lp-btn ghost" onClick={reset}><RotateCcw size={15} /> Reiniciar</button></>}
          </div>
        </div>
        <div className="lp-demo-art">{card}</div>
      </div>
    </div>
  );
}
