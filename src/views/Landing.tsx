// V0.4.2 · Entrada pública de VLUX Loyalty: presentación del producto, acabados, cómo funciona, demostración
// guiada, accesos a las experiencias y solicitud de demostración. Todo con datos ficticios; sin negocios reales.
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, QrCode, Smartphone, Sparkles, Gift, BarChart3, Wand2, Users, Palette, LifeBuoy, ScanLine, Store, Settings2 } from 'lucide-react';
import { LoyaltyCardFace } from '../components/LoyaltyCard';
import { brandVars } from '../components/Brand';
import { cx } from '../components/ui';
import { FINISHES, type CardFinish } from '../lib/finish';
import { navigate } from '../lib/router';
import { CONTACT_URL, enterDemo, useDemoStatus } from '../lib/demoAccess';
import { GuidedDemo } from './landing/GuidedDemo';

/** Aparece al entrar en pantalla (respeta "reducir movimiento" desde CSS). */
function Reveal({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setOn(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={cx('lp-reveal', on && 'in', className)} style={{ transitionDelay: `${delay}ms` }}>{children}</div>;
}

const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

function Nav() {
  return (
    <header className="lp-nav">
      <div className="lp-wrap flex items-center justify-between gap-4 h-[64px]">
        <a href="/" onClick={(e) => { e.preventDefault(); navigate('/'); }} aria-label="VLUX Loyalty, inicio" className="flex items-center gap-2.5">
          <img src="/brand/vlux-isotipo.png" alt="" width="30" height="31" className="h-[30px] w-auto" />
          <span className="font-display text-[17px] tracking-wide hidden sm:inline">VLUX Loyalty</span>
        </a>
        <nav className="hidden md:flex items-center gap-7 text-[13.5px] text-white/70" aria-label="Principal">
          <button onClick={() => go('acabados')} className="hover:text-white">Tarjetas</button>
          <button onClick={() => go('como-funciona')} className="hover:text-white">Cómo funciona</button>
          <button onClick={() => go('negocio')} className="hover:text-white">Para tu negocio</button>
          <button onClick={() => go('demo')} className="hover:text-white">Demostración</button>
          <button onClick={() => go('experiencias')} className="hover:text-white">Experiencias</button>
        </nav>
        <div className="flex items-center gap-2">
          <a href="/acceso" onClick={(e) => { e.preventDefault(); navigate('/acceso'); }} className="text-[13px] text-white/70 hover:text-white px-2 hidden sm:inline" data-testid="nav-acceso">Acceso de negocios</a>
          <button className="lp-btn small primary" onClick={() => go('solicitar')} data-testid="nav-solicitar">Solicitar demostración</button>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="lp-hero">
      <div className="lp-wrap grid lg:grid-cols-[1.05fr_1fr] gap-10 lg:gap-6 items-center">
        <div>
          <img src="/brand/vlux-logo-full.png" alt="VLUX" width="212" height="60" className="lp-logo-full h-[60px] w-auto -ml-3 mb-2" data-testid="hero-logo" />
          <p className="lp-eyebrow">VLUX LOYALTY</p>
          <h1 className="font-display lp-h1 mt-3" data-testid="hero-title">Clientes que regresan.<br />Negocios que crecen.</h1>
          <p className="mt-5 text-[17px] sm:text-[18px] text-white/70 max-w-[520px] leading-relaxed">Digitaliza tus recompensas, personaliza tu tarjeta y conoce a tus clientes frecuentes. Sin aplicaciones complicadas.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button className="lp-btn primary big" onClick={() => go('demo')} data-testid="cta-demo">Explorar demostración <ArrowRight size={17} /></button>
            <button className="lp-btn ghost big" onClick={() => navigate('/personalizar')} data-testid="cta-personalizar"><Palette size={17} /> Personalizar una tarjeta</button>
          </div>
        </div>
        <div className="lp-hero-art" aria-hidden="false">
          <div className="lp-float" style={brandVars('#14171C', '#67C7D3', 'silver')} data-testid="hero-card">
            <LoyaltyCardFace businessName="Tu negocio" customerName="Mariana López" cardId="VX-4F7K-92" total={8} filled={5} rewardReady={false} rewardLabel="Un beneficio de cortesía" footer={<span className="opacity-70">Ejemplo</span>} />
          </div>
          <div className="lp-halo" />
        </div>
      </div>
    </section>
  );
}

const FINISH_COPY: Record<CardFinish, { name: string; text: string; colors: [string, string]; filled: number }> = {
  signature: { name: 'Signature Color', text: 'Tu color de marca con brillo metálico. Es tu tarjeta, reconocible a primera vista.', colors: ['#5B1F2E', '#E6B8A2'], filled: 4 },
  silver: { name: 'Metallic Silver', text: 'Metal plateado con un matiz de tu marca. Sobrio, elegante y atemporal.', colors: ['#1A2430', '#67C7D3'], filled: 6 },
  black: { name: 'Premium Black', text: 'Negro profundo con tu acento. La opción para marcas que quieren verse exclusivas.', colors: ['#0A0A0B', '#D5B36A'], filled: 3 },
};

function Finishes() {
  return (
    <section id="acabados" className="lp-section">
      <div className="lp-wrap">
        <Reveal><p className="lp-eyebrow">Tarjetas</p><h2 className="lp-h2 font-display">Tres acabados. Tu marca en cada uno.</h2><p className="lp-sub">Mueve el cursor o el dedo sobre cada tarjeta: el brillo la sigue. Los colores y el logo son los de tu negocio.</p></Reveal>
        <div className="mt-10 grid md:grid-cols-3 gap-7">
          {FINISHES.map((f, i) => {
            const c = FINISH_COPY[f.id];
            return (
              <Reveal key={f.id} delay={i * 110}>
                <div data-testid={`finish-card-${f.id}`}>
                  <div style={brandVars(c.colors[0], c.colors[1], f.id)}>
                    <LoyaltyCardFace businessName="Tu negocio" customerName="Mariana López" cardId={`VX-0${i + 1}`} total={6} filled={c.filled} rewardReady={false} rewardLabel="Un beneficio de cortesía" compact footer={<span className="opacity-70">{c.name}</span>} />
                  </div>
                  <h3 className="mt-5 font-display text-[20px]">{c.name}</h3>
                  <p className="mt-1 text-[14px] text-white/60 leading-relaxed">{c.text}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

const HOW: { icon: typeof QrCode; t: string; d: string }[] = [
  { icon: QrCode, t: 'Escanea el QR', d: 'El cliente apunta la cámara al QR de tu mostrador.' },
  { icon: Wand2, t: 'Recibe su tarjeta digital', d: 'Se crea en menos de un minuto, con tu marca.' },
  { icon: Smartphone, t: 'La guarda en su teléfono', d: 'Un ícono en su pantalla de inicio, sin tienda de apps.' },
  { icon: Sparkles, t: 'Acumula sellos', d: 'Cada compra suma. Su tarjeta se actualiza al instante.' },
  { icon: Gift, t: 'Canjea su recompensa', d: 'Al completar los sellos, tu equipo registra el premio.' },
  { icon: BarChart3, t: 'Tú ves las estadísticas', d: 'Clientes, visitas y premios en un panel claro.' },
];

function How() {
  return (
    <section id="como-funciona" className="lp-section lp-alt">
      <div className="lp-wrap">
        <Reveal><p className="lp-eyebrow">Cómo funciona</p><h2 className="lp-h2 font-display">De escanear a regresar, en seis pasos.</h2></Reveal>
        <ol className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-5 lp-how">
          {HOW.map((h, i) => (
            <li key={h.t}>
              <Reveal delay={i * 90} className="lp-card h-full">
                <div className="flex items-center gap-3"><span className="lp-ico"><h.icon size={20} /></span><span className="text-[12px] text-white/40 tabular-nums">0{i + 1}</span></div>
                <h3 className="mt-4 text-[17px] font-medium">{h.t}</h3>
                <p className="mt-1.5 text-[14px] text-white/60 leading-relaxed">{h.d}</p>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const BIZ: { icon: typeof QrCode; t: string; d: string }[] = [
  { icon: Settings2, t: 'Configuración sencilla', d: 'Nombre, premio y número de sellos. Lo dejamos listo contigo.' },
  { icon: Palette, t: 'Tu marca en la tarjeta', d: 'Logo, colores y acabado. Se ve como tuyo, no como una plantilla.' },
  { icon: ScanLine, t: 'Registro de visitas', d: 'Tu equipo escanea la tarjeta y registra la compra en segundos.' },
  { icon: Gift, t: 'Recompensas claras', d: 'Defines cuántos sellos y qué premio. El sistema controla el canje.' },
  { icon: BarChart3, t: 'Estadísticas', d: 'Quiénes regresan, cuántas visitas y cuántos premios se canjearon.' },
  { icon: Users, t: 'Acceso para empleados', d: 'Cada persona con su acceso: caja para el equipo, panel para ti.' },
  { icon: LifeBuoy, t: 'Acompañamiento', d: 'Te ayudamos en el arranque y resolvemos dudas durante el piloto.' },
];

function Business() {
  return (
    <section id="negocio" className="lp-section">
      <div className="lp-wrap">
        <Reveal><p className="lp-eyebrow">Para tu negocio</p><h2 className="lp-h2 font-display">Lo que necesitas para empezar, nada más.</h2><p className="lp-sub">VLUX Loyalty te da las herramientas para fidelizar y medir. Los resultados dependen de tu negocio y de cómo lo comuniques a tus clientes; no prometemos cifras.</p></Reveal>
        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {BIZ.map((b, i) => (
            <Reveal key={b.t} delay={(i % 4) * 80} className="lp-card"><span className="lp-ico"><b.icon size={20} /></span><h3 className="mt-4 text-[16px] font-medium">{b.t}</h3><p className="mt-1.5 text-[13.5px] text-white/60 leading-relaxed">{b.d}</p></Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Experiences() {
  const demo = useDemoStatus();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const open = async (role: 'OWNER' | 'EMPLOYEE') => {
    setBusy(role); setErr(null);
    const m = await enterDemo(role);
    if (m) { setErr(m); setBusy(null); }
  };
  const enabled = !!demo?.enabled;
  const slug = demo?.slug || 'vlux-demo';
  const cards: { id: string; icon: typeof QrCode; t: string; d: string; act: () => void; label: string; needsDemo?: boolean }[] = [
    { id: 'cliente', icon: Smartphone, t: 'Experiencia del cliente', d: 'Crea una tarjeta de demostración como si escanearas el QR de un mostrador.', act: () => navigate(`/n/${slug}`), label: 'Abrir como cliente', needsDemo: true },
    { id: 'caja', icon: ScanLine, t: 'Experiencia de caja', d: 'Busca una tarjeta y registra compras y premios, como lo haría tu equipo.', act: () => open('EMPLOYEE'), label: 'Entrar como caja', needsDemo: true },
    { id: 'dueno', icon: Store, t: 'Experiencia del dueño', d: 'Panel con clientes, visitas y premios del negocio de demostración.', act: () => open('OWNER'), label: 'Entrar como dueño', needsDemo: true },
    { id: 'studio', icon: Palette, t: 'Estudio de marca', d: 'Sube un logo, detecta sus colores y mira la tarjeta al instante.', act: () => navigate('/personalizar'), label: 'Personalizar una tarjeta' },
  ];
  return (
    <section id="experiencias" className="lp-section lp-alt">
      <div className="lp-wrap">
        <Reveal><p className="lp-eyebrow">Experiencias</p><h2 className="lp-h2 font-display">Pruébalo desde cada lado del mostrador.</h2><p className="lp-sub">Entras al negocio ficticio “VLUX Demo”, sin contraseñas ni datos reales. Las sesiones de demostración duran pocas horas y no pueden cambiar ajustes del negocio.</p></Reveal>
        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-5" data-testid="experiences">
          {cards.map((c, i) => {
            const off = !!c.needsDemo && demo !== null && !enabled;
            return (
              <Reveal key={c.id} delay={i * 80} className="lp-card flex flex-col">
                <span className="lp-ico"><c.icon size={20} /></span>
                <h3 className="mt-4 text-[16.5px] font-medium">{c.t}</h3>
                <p className="mt-1.5 text-[13.5px] text-white/60 leading-relaxed flex-1">{c.d}</p>
                <button className="lp-btn mt-5 self-start" onClick={c.act} disabled={off || busy !== null} data-testid={`exp-${c.id}`}>{busy && c.id !== 'cliente' && c.id !== 'studio' && ((c.id === 'caja' && busy === 'EMPLOYEE') || (c.id === 'dueno' && busy === 'OWNER')) ? 'Abriendo…' : c.label} <ArrowRight size={15} /></button>
                {off && <p className="mt-2 text-[11.5px] text-white/40">No disponible en este entorno.</p>}
              </Reveal>
            );
          })}
        </div>
        {err && <p className="mt-4 text-[13px] text-[#FDA29B]" role="alert">{err}</p>}
      </div>
    </section>
  );
}

const FAQ: [string, string][] = [
  ['¿Mis clientes necesitan descargar una app?', 'No. Escanean el QR, crean su tarjeta en el navegador y la guardan en su pantalla de inicio como una app web (PWA).'],
  ['¿Funciona en iPhone y Android?', 'Sí. En iPhone se agrega desde Safari (Compartir → Agregar a pantalla de inicio). En Android el navegador ofrece instalarla o agregarla al inicio.'],
  ['¿Es lo mismo que Apple Wallet o Google Wallet?', 'No. Hoy la tarjeta es una app web instalable. Apple Wallet y Google Wallet son una fase futura; no las prometemos todavía.'],
  ['¿Dónde se guardan los datos de mis clientes?', 'En una base de datos con aislamiento por negocio. Solo el personal autorizado de tu negocio ve a tus clientes.'],
];

function Request() {
  return (
    <section id="solicitar" className="lp-section">
      <div className="lp-wrap grid lg:grid-cols-[1fr_1fr] gap-12 items-start">
        <Reveal>
          <p className="lp-eyebrow">Solicitar demostración</p>
          <h2 className="lp-h2 font-display">Veamos tu tarjeta con tu marca.</h2>
          <p className="lp-sub">Te la mostramos con tu logo y tus colores, y platicamos cómo arrancar un piloto en tu negocio.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            {CONTACT_URL
              ? <a className="lp-btn primary big" href={CONTACT_URL} data-testid="contact-cta">Escríbenos <ArrowRight size={17} /></a>
              : <button className="lp-btn primary big" onClick={() => navigate('/personalizar')} data-testid="contact-cta">Ver mi tarjeta en el estudio <ArrowRight size={17} /></button>}
            <button className="lp-btn ghost big" onClick={() => go('demo')}>Repetir la demostración</button>
          </div>
          {!CONTACT_URL && <p className="mt-3 text-[12px] text-white/40">Medio de contacto por confirmar por el equipo de VLUX.</p>}
        </Reveal>
        <Reveal delay={120}>
          <h3 className="font-display text-[20px] mb-3">Preguntas frecuentes</h3>
          <div className="flex flex-col gap-2.5">
            {FAQ.map(([q, a]) => (
              <details key={q} className="lp-faq"><summary>{q}</summary><p>{a}</p></details>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export function LandingView() {
  return (
    <div className="lp" data-testid="landing">
      <Nav />
      <main>
        <Hero />
        <Finishes />
        <How />
        <Business />
        <section id="demo" className="lp-section lp-alt">
          <div className="lp-wrap">
            <Reveal><p className="lp-eyebrow">Demostración guiada</p><h2 className="lp-h2 font-display">Míralo funcionar en dos minutos.</h2><p className="lp-sub">Sigue la historia de un cliente, de la marca al panel del dueño. Todo con datos ficticios, en tu navegador.</p></Reveal>
            <div className="mt-8"><GuidedDemo /></div>
          </div>
        </section>
        <Experiences />
        <Request />
      </main>
      <footer className="lp-footer">
        <div className="lp-wrap flex flex-col sm:flex-row items-center justify-between gap-5">
          <div className="flex items-center gap-3 text-white/60 text-[13px]"><span>Powered by</span><img src="/brand/vlux-wordmark.png" alt="VLUX" width="125" height="40" className="h-[40px] w-auto" /></div>
          <p className="text-[12px] text-white/40 text-center sm:text-right max-w-[420px]">Las experiencias de esta página usan datos ficticios. VLUX Loyalty no es Apple Wallet ni Google Wallet.</p>
        </div>
      </footer>
    </div>
  );
}
