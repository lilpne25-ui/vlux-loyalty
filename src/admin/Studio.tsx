// V0.4 · Estudio de marca y presentación comercial (solo equipo VLUX, dentro del Control Center).
// Pensado para una reunión: subes el logo del prospecto, se detectan sus colores y en segundos ves
//   su tarjeta, su portal de cliente, su ícono en el teléfono y el QR. Todo ocurre en el navegador:
// el logo no se sube a ningún servicio y nada se guarda hasta que se use en un negocio real.
import { createPortal } from 'react-dom';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Upload, Wand2, Presentation as PresentationIcon, X, ChevronLeft, ChevronRight, Store, Scissors, Coffee, ScanLine, Sparkles, ArrowRight, Check, Share } from 'lucide-react';
import { navigate } from '../lib/router';
import { CButton, CField, PageHeader, cx } from './kit';
import { prepareLogo } from './logo';
import { paletteFromImage, Palette } from '../lib/palette';
import { LoyaltyCardFace } from '../components/LoyaltyCard';
import { QRCode, BusinessLogo } from '../components/ui';
import { brandVars } from '../components/Brand';
import { FINISHES, type CardFinish } from '../lib/finish';

type Brand = { name: string; city: string; logo: string | null; primary: string; accent: string; reward: string; stamps: number; filled: number; finish?: CardFinish };

const PRESETS: { id: string; label: string; icon: React.ReactNode; brand: Brand }[] = [
  { id: 'vlux', label: 'VLUX Demo', icon: <Sparkles size={14} />, brand: { name: 'VLUX Demo', city: '', logo: null, primary: '#14171C', accent: '#67C7D3', reward: 'Un beneficio de cortesía', stamps: 6, filled: 4, finish: 'silver' } },
  { id: 'cafe', label: 'Ejemplo: cafetería', icon: <Coffee size={14} />, brand: { name: 'Cafetería de ejemplo', city: '', logo: null, primary: '#2B1B14', accent: '#C9A15B', reward: 'Una bebida de cortesía', stamps: 8, filled: 5 } },
  { id: 'barberia', label: 'Ejemplo: barbería', icon: <Scissors size={14} />, brand: { name: 'Barbería de ejemplo', city: '', logo: null, primary: '#14181F', accent: '#B9C0C9', reward: 'Un corte de cortesía', stamps: 6, filled: 4, finish: 'black' } },
  { id: 'nuevo', label: 'Mi negocio', icon: <Store size={14} />, brand: { name: '', city: '', logo: null, primary: '#0E1013', accent: '#B9C0C9', reward: 'Un producto de cortesía', stamps: 8, filled: 3 } },
];

const SAMPLE_URL = 'https://tu-negocio.vlux.mx/n/tu-tarjeta';
const shown = (b: Brand) => b.name.trim() || 'Tu negocio';

/** Marco de teléfono para las vistas previas (solo decoración). */
function PhoneFrame({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <figure className="flex flex-col items-center gap-2.5 m-0">
      <div className="studio-phone"><div className="studio-phone-screen">{children}</div></div>
      <figcaption className="text-[12px] cc-muted">{label}</figcaption>
    </figure>
  );
}

function PortalPreview({ b }: { b: Brand }) {
  return (
    <div className="cafe-bg h-full flex flex-col gap-3 p-4 pt-9" style={brandVars(b.primary, b.accent, b.finish)}>
      <div className="flex items-center gap-2"><BusinessLogo name={shown(b)} size={28} src={b.logo} /><div className="font-display text-[12.5px] text-cafe-ink leading-tight line-clamp-2">{shown(b)}</div></div>
      <div className="rounded-2xl p-4 relative overflow-hidden flex-1 min-h-[96px] flex items-end" style={{ background: 'var(--brand)' }}>
        <div className="absolute inset-0 hero-glow" />
        <div className="relative text-[color:var(--cream)] font-display text-[14px] leading-snug">Junta {b.stamps} sellos y gana: {b.reward.toLowerCase()}.</div>
      </div>
      <div className="h-10 rounded-xl text-[12.5px] font-medium inline-flex items-center justify-center gap-1.5" style={{ background: 'var(--brand)', color: 'var(--on-brand)' }}>Obtener mi tarjeta <ArrowRight size={14} /></div>
      <div className="text-center text-[9px] text-cafe-muted">Sin app · Sin contraseña</div>
    </div>
  );
}

function HomeScreenPreview({ b }: { b: Brand }) {
  const apps = ['Mensajes', 'Fotos', 'Mapas', 'Notas', 'Reloj', 'Correo', 'Música', 'Tienda'];
  return (
    <div className="h-full p-4 pt-8 flex flex-col gap-4" style={{ background: 'linear-gradient(160deg,#2d3b57,#111827 60%,#1f2937)' }}>
      <div className="grid grid-cols-4 gap-x-3 gap-y-4">
        {apps.map((a) => (<div key={a} className="flex flex-col items-center gap-1"><span className="h-9 w-9 rounded-[10px] bg-white/15" /><span className="text-[7.5px] text-white/70">{a}</span></div>))}
        <div className="flex flex-col items-center gap-1 studio-appin" style={brandVars(b.primary, b.accent, b.finish)}>
          <span className="h-9 w-9 rounded-[10px] overflow-hidden flex items-center justify-center" style={{ background: 'var(--brand)', boxShadow: '0 4px 10px rgba(0,0,0,.45), 0 0 0 1px rgba(255,255,255,.18) inset' }}>
            {b.logo ? <img src={b.logo} alt="" className="h-full w-full object-contain p-1 bg-white" /> : <span className="font-display text-[15px]" style={{ color: 'var(--accent)' }}>{shown(b).replace(/caf[eé]|barber[ií]a/i, '').trim().slice(0, 1).toUpperCase() || shown(b).slice(0, 1).toUpperCase()}</span>}
          </span>
          <span className="text-[7.5px] text-white font-medium truncate max-w-[40px]">{shown(b).split(' ')[0]}</span>
        </div>
      </div>
    </div>
  );
}

function Swatch({ hex, active, onPick }: { hex: string; active?: boolean; onPick: () => void }) {
  return <button type="button" onClick={onPick} aria-label={`Usar ${hex}`} title={hex} className={cx('h-7 w-7 rounded-full border transition hover:scale-110', active ? 'border-white ring-2 ring-[#67C7D3]' : 'border-white/20')} style={{ background: hex }} />;
}

/** publicMode: versión comercial abierta (datos temporales en el navegador: nada se sube ni se crea). */
export function Studio({ publicMode = false }: { publicMode?: boolean } = {}) {
  const [preset, setPreset] = useState('vlux');
  const [b, setB] = useState<Brand>(PRESETS[0].brand);
  const [swatches, setSwatches] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [present, setPresent] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof Brand>(k: K, v: Brand[K]) => setB((x) => ({ ...x, [k]: v }));

  const choose = (id: string) => { setPreset(id); setB(PRESETS.find((p) => p.id === id)!.brand); setSwatches([]); setMsg(null); setErr(null); };

  const onFile = async (file: File) => {
    setErr(null); setMsg(null);
    try {
      const logo = await prepareLogo(file);
      const p: Palette = await paletteFromImage(logo);
      setSwatches(p.swatches);
      setB((x) => ({ ...x, logo, primary: p.primary, accent: p.accent }));
      setMsg('Logo cargado. Detectamos sus colores y ya se aplican a la tarjeta.');
    } catch (e) { setErr((e as Error).message); }
  };

  const useInWizard = () => {
    try { sessionStorage.setItem('vlux:studio', JSON.stringify({ name: b.name, logoDataUrl: b.logo, primaryColor: b.primary, accentColor: b.accent, cardFinish: b.finish ?? 'signature', rewardDescription: b.reward, stampsRequired: b.stamps })); } catch { /* sin almacenamiento */ }
    navigate('/vlux-admin/negocios/nuevo');
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Estudio de marca"
        sub={publicMode ? 'Sube tu logo y mira al instante cómo quedaría tu tarjeta. Todo ocurre en tu navegador: no se sube ni se guarda nada, y no se crea ningún negocio.' : 'Sube el logo de un prospecto y mira al instante cómo quedaría su tarjeta. Todo se calcula en este navegador; nada se guarda.'}
        actions={<>{publicMode ? <CButton onClick={() => navigate('/#solicitar')} data-testid="studio-request">Quiero esto con mi marca</CButton> : <CButton onClick={useInWizard} data-testid="studio-use">Crear negocio con esta marca</CButton>}<CButton variant="primary" onClick={() => setPresent(true)} data-testid="studio-present"><PresentationIcon size={15} /> Presentar</CButton></>}
      />

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Casos de demostración">
        {PRESETS.map((p) => (
          <button key={p.id} role="tab" aria-selected={preset === p.id} onClick={() => choose(p.id)} className={cx('cc-chip', preset === p.id && 'cc-chip-on')}>{p.icon} {p.label}</button>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)] items-start">
        <section className="cc-panel p-5 flex flex-col gap-4" aria-label="Marca del cliente">
          <CField label="Nombre del negocio" htmlFor="st-name"><input id="st-name" className="cc-input" value={b.name} maxLength={60} placeholder="Ej. Barbería Don Beto" onChange={(e) => set('name', e.target.value)} /></CField>
          <div
            className={cx('studio-drop', b.logo && 'has-logo')}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
          >
            <input ref={fileRef} id="st-logo" data-testid="studio-logo" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
            {b.logo ? <img src={b.logo} alt="Logo cargado" className="h-16 w-16 object-contain rounded-lg bg-white p-1 studio-pop" /> : <Upload size={22} className="cc-muted" />}
            <div className="text-[13px]">{b.logo ? 'Logo listo' : 'Arrastra el logo aquí'}</div>
            <CButton type="button" small onClick={() => fileRef.current?.click()}>{b.logo ? 'Cambiar logo' : 'Elegir archivo'}</CButton>
            {b.logo && <CButton type="button" small variant="ghost" onClick={() => { set('logo', null); setSwatches([]); }}>Quitar</CButton>}
          </div>
          {msg && <p className="text-[12.5px] text-[#6CE9A6] inline-flex items-start gap-1.5" role="status"><Wand2 size={14} className="mt-0.5 shrink-0" /> {msg}</p>}
          {err && <p className="text-[12.5px] text-[#FDA29B]" role="alert">{err}</p>}

          {swatches.length > 0 && (
            <div>
              <div className="text-[12px] cc-muted mb-2">Colores detectados (toca uno para usarlo)</div>
              <div className="flex flex-wrap gap-2">{swatches.map((h) => <Swatch key={h} hex={h} active={h === b.primary || h === b.accent} onPick={() => set('primary', h)} />)}</div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label htmlFor="st-primary" className="cc-colorbox"><input id="st-primary" data-testid="studio-primary" type="color" value={b.primary} onChange={(e) => set('primary', e.target.value.toUpperCase())} /> Principal <span className="font-mono text-[11.5px] ml-auto">{b.primary.toUpperCase()}</span></label>
            <label htmlFor="st-accent" className="cc-colorbox"><input id="st-accent" data-testid="studio-accent" type="color" value={b.accent} onChange={(e) => set('accent', e.target.value.toUpperCase())} /> Acento <span className="font-mono text-[11.5px] ml-auto">{b.accent.toUpperCase()}</span></label>
          </div>
          <div role="radiogroup" aria-label="Acabado de la tarjeta" data-testid="studio-finish" className="grid grid-cols-3 gap-2">
            {FINISHES.map((f) => (
              <button key={f.id} type="button" role="radio" aria-checked={(b.finish ?? 'signature') === f.id} data-testid={`finish-${f.id}`} title={f.hint}
                className={cx('studio-chip text-[12px] px-2 py-2 rounded-xl border', (b.finish ?? 'signature') === f.id ? 'border-[var(--cc-cyan)] bg-white/10' : 'border-white/10')}
                onClick={() => set('finish', f.id)}>{f.label}</button>
            ))}
          </div>
          <CField label="Premio" htmlFor="st-reward"><input id="st-reward" className="cc-input" value={b.reward} maxLength={80} onChange={(e) => set('reward', e.target.value)} /></CField>
          <div className="grid grid-cols-2 gap-3">
            <CField label={`Sellos para el premio: ${b.stamps}`} htmlFor="st-stamps"><input id="st-stamps" type="range" min={3} max={12} value={b.stamps} onChange={(e) => { const n = Number(e.target.value); setB((x) => ({ ...x, stamps: n, filled: Math.min(x.filled, n) })); }} /></CField>
            <CField label={`Sellos de ejemplo: ${b.filled}`} htmlFor="st-filled"><input id="st-filled" type="range" min={0} max={b.stamps} value={b.filled} onChange={(e) => set('filled', Number(e.target.value))} /></CField>
          </div>
        </section>

        <section className="flex flex-col gap-8 min-w-0" aria-label="Vista previa">
          <div className="cc-panel studio-stage p-6 sm:p-8 flex items-center justify-center" style={brandVars(b.primary, b.accent, b.finish)} data-testid="studio-card">
            <div className="w-full max-w-[420px]">
              <LoyaltyCardFace businessName={shown(b)} customerName="Mariana López" cardId="VX-4F7K-92" total={b.stamps} filled={b.filled} rewardReady={b.filled >= b.stamps} logoUrl={b.logo} footer={<span className="opacity-70">Ejemplo</span>} />
              <div className="mt-4 flex items-center justify-center gap-3">
                {b.filled >= b.stamps
                  ? <CButton variant="primary" onClick={() => set('filled', 0)} data-testid="studio-redeem"><Check size={15} /> Canjear: {b.reward.toLowerCase()}</CButton>
                  : <CButton variant="primary" onClick={() => set('filled', Math.min(b.stamps, b.filled + 1))} data-testid="studio-stamp"><Sparkles size={15} /> Registrar compra (+1 sello)</CButton>}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-8">
            <PhoneFrame label="Portal del cliente"><PortalPreview b={b} /></PhoneFrame>
            <PhoneFrame label="En su pantalla de inicio"><HomeScreenPreview b={b} /></PhoneFrame>
            <figure className="flex flex-col items-center gap-2.5 m-0 self-center">
              <div className="rounded-2xl bg-white p-3 studio-pop"><QRCode value={SAMPLE_URL} size={150} label="QR de ejemplo" /></div>
              <figcaption className="text-[12px] cc-muted text-center max-w-[180px]">QR del mostrador (ejemplo). El real se genera al crear el negocio.</figcaption>
            </figure>
          </div>
        </section>
      </div>
      {present && <Presentation3 brand={b} onClose={() => setPresent(false)} />}
    </div>
  );
}

// ---------- Presentación comercial a pantalla completa ----------
function SlideCard({ b, big }: { b: Brand; big?: boolean }) {
  return (
    <div style={brandVars(b.primary, b.accent, b.finish)} className={cx('w-full', big ? 'max-w-[460px]' : 'max-w-[360px]')}>
      <LoyaltyCardFace businessName={shown(b)} customerName="Mariana López" cardId="VX-4F7K-92" total={b.stamps} filled={b.filled} rewardReady={b.filled >= b.stamps} logoUrl={b.logo} footer={<span className="opacity-70">Ejemplo</span>} />
    </div>
  );
}

function Presentation3({ brand: b, onClose }: { brand: Brand; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [stamped, setStamped] = useState(false);
  const slides = useMemo(() => [
    {
      kicker: shown(b), title: 'Tu tarjeta de recompensas', body: `Cada cliente tiene su tarjeta con tu marca. Junta ${b.stamps} sellos y gana: ${b.reward.toLowerCase()}.`,
      art: <SlideCard b={b} big />,
    },
    {
      kicker: 'Para tus clientes', title: 'Un ícono en su teléfono', body: 'Escanean tu QR, crean su tarjeta en menos de un minuto y la agregan a su pantalla de inicio. Sin descargar nada de la tienda.',
      art: <div className="flex flex-wrap items-center justify-center gap-6"><PhoneFrame label="Portal"><PortalPreview b={b} /></PhoneFrame><PhoneFrame label="Pantalla de inicio"><HomeScreenPreview b={b} /></PhoneFrame></div>,
      note: 'En iPhone se agrega desde Safari (Compartir → Agregar a pantalla de inicio). Es una app web, no Apple Wallet.',
    },
    {
      kicker: 'En caja', title: 'Un escaneo, un sello', body: 'Tu equipo escanea la tarjeta y registra la compra. El cliente ve su sello al instante.',
      art: (
        <div className="flex flex-wrap items-center justify-center gap-8">
          <div className="studio-scan"><ScanLine size={34} /><span>Escaneando tarjeta…</span></div>
          <button className="studio-stampbtn" onClick={() => setStamped(true)} style={brandVars(b.primary, b.accent, b.finish)}>{stamped ? <><Check size={18} /> +1 sello registrado</> : 'Registrar compra'}</button>
          <div style={brandVars(b.primary, b.accent, b.finish)} className="w-[300px] max-w-full"><LoyaltyCardFace businessName={shown(b)} customerName="Mariana López" cardId="VX-4F7K-92" total={b.stamps} filled={Math.min(b.stamps, b.filled + (stamped ? 1 : 0))} animateFrom={stamped ? b.filled : null} logoUrl={b.logo} compact footer={<span className="opacity-70">En vivo</span>} /></div>
        </div>
      ),
    },
    {
      kicker: 'Para el dueño', title: 'Ves quién regresa', body: 'Clientes, visitas, recurrentes y premios canjeados en un panel claro. Tú decides el programa y el premio.',
      art: (
        <div className="grid grid-cols-2 gap-3 w-full max-w-[460px]">
          {[['Clientes', '128'], ['Visitas', '412'], ['Recurrentes', '37%'], ['Premios', '24']].map(([k, v], n) => (
            <div key={k} className="studio-kpi" style={{ animationDelay: `${n * 90}ms` }}><div className="text-[12px] opacity-70">{k}</div><div className="font-display text-[30px]">{v}</div></div>
          ))}
          <div className="col-span-2 text-[11px] opacity-60">Cifras de ejemplo con datos de muestra.</div>
        </div>
      ),
    },
    {
      kicker: 'Por qué VLUX Loyalty', title: 'Hecha para negocios locales', body: '',
      art: (
        <ul className="studio-points">
          {['Tu marca en la tarjeta desde el primer día: subes el logo y listo.', 'Sin app de tienda: se instala desde el navegador en segundos.', 'Panel simple: caja para tu equipo, panel para ti.', 'Te acompañamos en el arranque, en Toluca y Metepec.'].map((t, n) => (<li key={t} style={{ animationDelay: `${n * 120}ms` }}><Check size={16} /> {t}</li>))}
        </ul>
      ),
      note: 'Siguiente fase: Google Wallet y Apple Wallet. Hoy la tarjeta vive en el teléfono como app web.',
    },
    {
      kicker: 'Cómo empezamos', title: 'Piloto con acompañamiento', body: 'Configuramos tu marca, imprimimos tu QR y capacitamos a tu equipo. Medimos juntos cuántos clientes regresan.',
      art: <div className="flex flex-col items-center gap-4"><SlideCard b={b} /><span className="rounded-2xl bg-[#0E1013] p-3 inline-flex"><img src="/brand/vlux-logo-full.png" alt="VLUX" width="1060" height="300" className="w-[220px] h-auto" /></span><div className="inline-flex items-center gap-2 text-[14px] opacity-90"><Sparkles size={16} /> Empezamos esta semana</div></div>,
    },
  ], [b, stamped]);

  const go = useCallback((d: number) => { setI((n) => Math.max(0, Math.min(slides.length - 1, n + d))); }, [slides.length]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); else if (e.key === 'ArrowRight' || e.key === ' ') go(1); else if (e.key === 'ArrowLeft') go(-1); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [go, onClose]);
  const s = slides[i];
  return createPortal(
    <div className="cc studio-deck" role="dialog" aria-modal="true" aria-label="Presentación comercial" data-testid="deck" style={{ ['--deck-a' as string]: b.accent, ['--deck-p' as string]: b.primary } as React.CSSProperties}>
      <button className="studio-deck-x" onClick={onClose} aria-label="Cerrar presentación"><X size={20} /></button>
      <div key={i} className="studio-slide">
        <div className="studio-slide-text">
          <div className="text-[12px] uppercase tracking-[0.2em] opacity-60">{s.kicker}</div>
          <h2 className="font-display text-[34px] sm:text-[44px] leading-[1.05] mt-3 text-balance" data-testid="deck-title">{s.title}</h2>
          {s.body && <p className="mt-4 text-[16px] sm:text-[18px] opacity-80 leading-relaxed max-w-[460px]">{s.body}</p>}
          {s.note && <p className="mt-5 text-[12.5px] opacity-60 max-w-[460px] inline-flex gap-2"><Share size={14} className="shrink-0 mt-0.5" /> {s.note}</p>}
        </div>
        <div className="studio-slide-art">{s.art}</div>
      </div>
      <div className="studio-deck-nav">
        <button onClick={() => go(-1)} disabled={i === 0} aria-label="Anterior"><ChevronLeft size={20} /></button>
        <div className="flex gap-2" aria-hidden="true">{slides.map((_, n) => <span key={n} className={cx('studio-dot', n === i && 'on')} />)}</div>
        <button onClick={() => go(1)} disabled={i === slides.length - 1} aria-label="Siguiente" data-testid="deck-next"><ChevronRight size={20} /></button>
      </div>
    </div>,
    document.body,
  );
}
