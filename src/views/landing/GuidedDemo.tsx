// Demostración guiada: una historia en cinco pasos (marca → cliente → compra → premio → dueño), con datos ficticios
// que viven solo en este navegador. Cada acción cambia la tarjeta y los números del panel del dueño.
import { useRef, useState } from 'react';
import { Check, QrCode, Store, Gift, BarChart3, Sparkles, ArrowRight, RotateCcw } from 'lucide-react';
import { LoyaltyCardFace } from '../../components/LoyaltyCard';
import { QRCode, cx } from '../../components/ui';
import { brandVars } from '../../components/Brand';
import { FINISHES, type CardFinish } from '../../lib/finish';
import { navigate } from '../../lib/router';
import { analyzeLogo } from '../../admin/logoEngine';
import { prepareLogo } from '../../admin/logo';
import { describeAnalysis } from '../../admin/LogoControls';
import { paletteFromImage } from '../../lib/palette';
import type { LogoAnalysis, LogoFit } from '../../lib/logoFit';

// Logotipos FICTICIOS de ejemplo (formas y colores inventados; no son marcas reales). Se rasterizan en el navegador.
const SAMPLES = [
  { id: 'horizontal', label: 'Cafetería (horizontal)', name: 'Café Aurora', w: 320, h: 90, svg: '<rect x="8" y="22" width="46" height="46" rx="23" fill="#1F6F4A"/><path d="M22 52c4-14 12-18 24-18-2 14-10 20-24 18z" fill="#F3E3B8"/><text x="66" y="58" font-family="Georgia,serif" font-size="38" fill="#1F6F4A">Aurora</text>', primary: '#1F6F4A', accent: '#E8B04B' },
  { id: 'cuadrado', label: 'Barbería (cuadrado)', name: 'Barbería Norte', w: 160, h: 160, svg: '<circle cx="80" cy="80" r="64" fill="#1D3F8F"/><path d="M52 112 80 40l28 72" stroke="#fff" stroke-width="12" fill="none" stroke-linejoin="round"/><rect x="62" y="86" width="36" height="9" fill="#fff"/>', primary: '#1D3F8F', accent: '#8FB2FF' },
  { id: 'vertical', label: 'Panadería (vertical)', name: 'Panadería Sol', w: 100, h: 220, svg: '<circle cx="50" cy="44" r="34" fill="#C77B1A"/><path d="M50 18v52M30 44h40" stroke="#FFF4DA" stroke-width="7"/><text x="50" y="140" text-anchor="middle" font-family="Georgia,serif" font-size="30" fill="#7A4A10">SOL</text><rect x="22" y="160" width="56" height="8" fill="#C77B1A"/>', primary: '#C77B1A', accent: '#7A4A10' },
] as const;
async function svgToPng(svg: string, w: number, h: number): Promise<string> {
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${svg}</svg>`);
  const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('ejemplo')); i.src = url; });
  const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2; c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

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
  const [logo, setLogo] = useState<string | null>(null);
  const [fit, setFit] = useState<LogoFit | null>(null);
  const [analysis, setAnalysis] = useState<LogoAnalysis | null>(null);
  const [colors, setColors] = useState({ primary: '#14171C', accent: '#67C7D3' });
  const [swatches, setSwatches] = useState<string[]>([]);
  const [logoErr, setLogoErr] = useState<string | null>(null);
  const [compare, setCompare] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const take = async (png: string, hint?: { primary: string; accent: string }) => {
    setLogoErr(null);
    try {
      const [a, pal] = await Promise.all([analyzeLogo(png), paletteFromImage(png).catch(() => null)]);
      setLogo(png); setFit(a.fit); setAnalysis(a.analysis);
      const p = pal ?? hint; if (p) setColors({ primary: p.primary, accent: p.accent });
      setSwatches(pal?.swatches ?? []);
    } catch (e) { setLogoErr((e as Error).message); }
  };
  const clearLogo = () => { setLogo(null); setFit(null); setAnalysis(null); setSwatches([]); setColors({ primary: '#14171C', accent: '#67C7D3' }); };
  const [filled, setFilled] = useState(0);
  const [visits, setVisits] = useState(0);
  const [rewards, setRewards] = useState(0);
  const ready = filled >= TOTAL;
  const shown = name.trim() || 'Tu negocio';
  const reset = () => { setStep(0); setHasCard(false); setFilled(0); setVisits(0); setRewards(0); };
  const stamp = () => { if (!hasCard || ready) return; setFilled((n) => n + 1); setVisits((n) => n + 1); };
  const redeem = () => { if (!ready) return; setRewards((n) => n + 1); setFilled(0); };
  const S = STEPS[step];

  const card = compare && step === 0 ? (
    <div className="w-full max-w-[400px] mx-auto flex flex-col gap-4" data-testid="gd-compare">
      {FINISHES.map((f) => (
        <div key={f.id} style={brandVars(colors.primary, colors.accent, f.id)}>
          <LoyaltyCardFace compact interactive={false} businessName={shown} customerName="Cliente de ejemplo" cardId="VX-DEMO-01" total={TOTAL} filled={2} logoUrl={logo} logoFit={fit} rewardLabel="Un beneficio de cortesía" footer={<span className="opacity-70">{f.label}</span>} />
        </div>
      ))}
    </div>
  ) : (
    <div style={brandVars(colors.primary, colors.accent, finish)} className="w-full max-w-[400px] mx-auto" data-testid="gd-card">
      {hasCard || step === 0 ? (
        <LoyaltyCardFace businessName={shown} customerName="Cliente de ejemplo" cardId="VX-DEMO-01" total={TOTAL} filled={hasCard ? filled : 2} rewardReady={hasCard && ready} logoUrl={logo} logoFit={fit} rewardLabel="Un beneficio de cortesía" footer={<span className="opacity-70">Demostración</span>} />
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
              <div className="flex flex-col gap-2" data-testid="gd-logo">
                <div className="text-[13px] text-white/70">Tu logo</div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="lp-chip" data-testid="gd-upload" onClick={() => fileRef.current?.click()}>Subir mi logo</button>
                  {SAMPLES.map((x) => <button key={x.id} type="button" className="lp-chip" data-testid={`gd-sample-${x.id}`} onClick={async () => { setName(x.name); await take(await svgToPng(x.svg, x.w, x.h), { primary: x.primary, accent: x.accent }); }}>{x.label}</button>)}
                  {logo && <button type="button" className="lp-chip" data-testid="gd-clear-logo" onClick={clearLogo}>Quitar</button>}
                </div>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" data-testid="gd-file" aria-label="Subir logo" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; try { await take(await prepareLogo(f)); } catch (x) { setLogoErr((x as Error).message); } }} />
                {logoErr && <p className="text-[12.5px] text-[#FDA29B]" role="alert">{logoErr}</p>}
                {analysis && <p className="text-[12px] text-white/60" data-testid="gd-analysis">Autoajuste: {describeAnalysis(analysis)}. Tu logo no se sube a ningún servidor.</p>}
                {swatches.length > 0 && <div className="flex items-center gap-1.5" data-testid="gd-swatches" aria-label="Colores detectados">{swatches.slice(0, 5).map((c) => <span key={c} title={c} className="h-5 w-5 rounded-full border border-white/20" style={{ background: c }} />)}<span className="text-[12px] text-white/50 ml-1">colores detectados</span></div>}
              </div>
              <div role="radiogroup" aria-label="Acabado de la tarjeta" className="grid grid-cols-3 gap-2">
                {FINISHES.map((f) => (
                  <button key={f.id} type="button" role="radio" aria-checked={finish === f.id} data-testid={`gd-finish-${f.id}`} onClick={() => setFinish(f.id)} className={cx('lp-chip', finish === f.id && 'on')}>{f.label}</button>
                ))}
              </div>
              <button type="button" className="lp-link" data-testid="gd-compare-toggle" aria-pressed={compare} onClick={() => setCompare((v) => !v)}>{compare ? 'Ver una sola tarjeta' : 'Comparar los tres acabados con tu logo'}</button>
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
