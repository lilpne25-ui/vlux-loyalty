// V0.4 · "Agregar a mi teléfono" para el dueño (Panel) y la caja. Misma lógica honesta que la tarjeta del
// cliente: Android/Chrome muestra el aviso nativo si el navegador lo permite; en iPhone se agrega desde el menú
// Compartir del navegador. Nada de esto es Apple Wallet ni Google Wallet.
// V0.4.6 · Pantalla de instalación con la identidad del negocio (logo, nombre, ícono de la app), beneficios,
// instrucciones según el dispositivo y confirmación cuando el navegador permite detectarla.
import React, { useEffect, useState } from 'react';
import { Smartphone, Share, PlusSquare, MoreVertical, Check, Download, Zap, Bell, ShieldCheck, LayoutDashboard } from 'lucide-react';
import { detectPlatform, isStandalone, useInstallState } from '../lib/pwa';
import { BusinessLogo, Button, Modal, useToast } from './ui';

export type StaffApp = 'panel' | 'caja';
export interface InstallBusiness { slug: string; name: string; logoUrl?: string | null; primaryColor?: string }

export function staffManifestHref(slug: string, app: StaffApp) {
  return `/api/pwa/${slug}/staff/${app}/manifest.webmanifest`;
}
export const staffIconHref = (slug: string, app: StaffApp, size: 192 | 512 | 180 = 192) => `/api/pwa/${slug}/icon/${app}-${size}.png`;

function setHead(sel: string, make: () => HTMLElement, attr: string, value: string) {
  let el = document.head.querySelector(sel) as HTMLElement | null;
  if (!el) { el = make(); document.head.appendChild(el); }
  const prev = el.getAttribute(attr);
  el.setAttribute(attr, value);
  return () => { if (prev !== null) el!.setAttribute(attr, prev); };
}

/** Pone el manifiesto, el ícono de iPhone, el color y el título del Panel o la Caja de ESE negocio mientras la vista está abierta. */
export function useStaffAppHead(slug: string | undefined, app: StaffApp, name: string | undefined, color?: string) {
  useEffect(() => {
    if (!slug) return;
    const undo = [
      setHead('link[rel="manifest"]', () => Object.assign(document.createElement('link'), { rel: 'manifest' }), 'href', staffManifestHref(slug, app)),
      setHead('link[rel="apple-touch-icon"]', () => Object.assign(document.createElement('link'), { rel: 'apple-touch-icon' }), 'href', staffIconHref(slug, app, 180)),
      setHead('meta[name="apple-mobile-web-app-title"]', () => Object.assign(document.createElement('meta'), { name: 'apple-mobile-web-app-title' }), 'content', app === 'panel' ? 'Panel' : 'Caja'),
      setHead('meta[name="apple-mobile-web-app-capable"]', () => Object.assign(document.createElement('meta'), { name: 'apple-mobile-web-app-capable' }), 'content', 'yes'),
      ...(color ? [setHead('meta[name="theme-color"]', () => Object.assign(document.createElement('meta'), { name: 'theme-color' }), 'content', color)] : []),
    ];
    const t = document.title;
    document.title = `${app === 'panel' ? 'Panel' : 'Caja'}${name ? ` · ${name}` : ''}`;
    return () => { undo.forEach((u) => u()); document.title = t; };
  }, [slug, app, name, color]);
}

const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
  <li className="flex items-start gap-3">
    <span className="h-6 w-6 shrink-0 rounded-full bg-ink text-white text-[12px] font-semibold inline-flex items-center justify-center">{n}</span>
    <span className="text-[13.5px] text-[#475467] leading-snug pt-0.5">{children}</span>
  </li>
);

/** Instrucciones según dispositivo. No promete instalación automática en iPhone: allí siempre es manual. */
export function InstallSteps({ noun }: { noun: string }) {
  const platform = detectPlatform();
  if (platform === 'ios-safari') return (
    <ol className="flex flex-col gap-3.5" data-testid="install-steps-ios">
      <Step n={1}>Toca el botón <Share size={14} className="inline -mt-0.5" /> <strong>Compartir</strong> de Safari (abajo o arriba, según tu iPhone).</Step>
      <Step n={2}>Desliza y elige <PlusSquare size={14} className="inline -mt-0.5" /> <strong>Agregar a pantalla de inicio</strong>.</Step>
      <Step n={3}>Toca <strong>Agregar</strong>. Abre tu {noun} desde el ícono nuevo y entra con tu correo y contraseña una vez.</Step>
    </ol>
  );
  if (platform === 'ios-other') return (
    <div className="flex flex-col gap-3" data-testid="install-steps-ios-other">
      <p className="text-[14px] text-[#475467]">En iPhone con iOS 16.4 o posterior, algunos navegadores (como Chrome o Edge) también ofrecen <strong>Compartir → Agregar a pantalla de inicio</strong>. Si no aparece esa opción, abre esta misma dirección en <strong>Safari</strong> y repite el paso.</p>
    </div>
  );
  if (platform === 'android') return (
    <ol className="flex flex-col gap-3.5" data-testid="install-steps-android">
      <Step n={1}>Abre el menú <MoreVertical size={14} className="inline -mt-0.5" /> del navegador (arriba a la derecha en Chrome).</Step>
      <Step n={2}>Elige <strong>Instalar app</strong> o <strong>Agregar a pantalla principal</strong>.</Step>
      <Step n={3}>Confirma. Tu {noun} abrirá a pantalla completa, como una app.</Step>
    </ol>
  );
  return <p className="text-[14px] text-[#475467]" data-testid="install-steps-desktop">Abre esta dirección desde tu teléfono para agregarla a la pantalla de inicio. En computadora, Chrome y Edge ofrecen instalar desde el ícono de la barra de direcciones.</p>;
}

/** Pantalla de instalación con la identidad del negocio. */
export function InstallScreen({ app, business, open, onClose }: { app: StaffApp; business: InstallBusiness; open: boolean; onClose: () => void }) {
  const st = useInstallState();
  const toast = useToast();
  const noun = app === 'panel' ? 'panel' : 'caja';
  const [justInstalled, setJustInstalled] = useState(false);
  const installed = st.installed || justInstalled;
  const benefits = app === 'panel'
    ? [[<Zap size={15} key="a" />, 'Abre tu panel con un toque, a pantalla completa.'], [<LayoutDashboard size={15} key="b" />, `Entra directo a ${business.name}, aunque administres varios negocios.`], [<ShieldCheck size={15} key="c" />, 'Tu contraseña no se guarda en la app: la sesión es segura y vence sola.']]
    : [[<Zap size={15} key="a" />, 'La caja abre a pantalla completa, lista para escanear.'], [<ShieldCheck size={15} key="c" />, 'Cada empleado entra con su propia cuenta.'], [<Bell size={15} key="b" />, 'Sin descargar nada de la tienda de apps.']];
  const install = async () => {
    const r = await st.prompt();
    if (r === 'accepted') { setJustInstalled(true); toast('good', `Listo: tu ${noun} quedó en la pantalla de inicio.`); }
  };
  return (
    <Modal open={open} onClose={onClose} title={`Instalar ${noun} en este teléfono`} labelledBy="install-screen-title">
      <div className="flex flex-col gap-4" data-testid={`install-screen-${app}`}>
        <div className="flex items-center gap-3">
          <img src={staffIconHref(business.slug, app)} alt={`Ícono de ${noun} de ${business.name}`} width={56} height={56} className="h-14 w-14 rounded-[14px] shadow-md" data-testid="install-icon" />
          <div className="min-w-0">
            <div className="flex items-center gap-2"><BusinessLogo name={business.name} size={22} src={business.logoUrl} ring={false} /><span className="text-[15px] font-semibold text-ink truncate">{business.name}</span></div>
            <div className="text-[12.5px] text-slate2">{app === 'panel' ? 'Panel del dueño' : 'Caja'} · VLUX Loyalty</div>
          </div>
        </div>
        <ul className="flex flex-col gap-2">
          {benefits.map(([icon, text], i) => <li key={i} className="flex items-start gap-2.5 text-[13.5px] text-[#475467]"><span className="mt-0.5 text-[#0E6874]">{icon}</span><span>{text}</span></li>)}
        </ul>
        {installed ? (
          <div className="rounded-xl bg-[#ECFDF3] text-[#067647] px-3.5 py-3 text-[13.5px] flex items-center gap-2" data-testid="install-confirmed"><Check size={16} /> {isStandalone() ? `Estás usando la app instalada de ${business.name}.` : 'El navegador confirmó la instalación. Búscala en tu pantalla de inicio.'}</div>
        ) : st.canPrompt ? (
          <div className="flex flex-col gap-2">
            <Button size="lg" onClick={install} data-testid="install-now"><Download size={17} /> Instalar ahora</Button>
            <details className="text-[12.5px] text-slate2"><summary className="cursor-pointer">¿No aparece el aviso? Hazlo desde el menú</summary><div className="mt-3"><InstallSteps noun={noun} /></div></details>
          </div>
        ) : (
          <InstallSteps noun={noun} />
        )}
        <p className="text-[12px] text-slate2 leading-snug">Es opcional. La app instalada es un acceso directo a tu {noun}: entras con tu correo y contraseña{detectPlatform().startsWith('ios') ? ' (en iPhone, la app instalada pide iniciar sesión una vez, aparte de Safari)' : ''}. No sustituye a Apple Wallet ni a Google Wallet.</p>
        <Button variant="secondary" className="w-full" onClick={onClose}>{installed ? 'Listo' : 'Ahora no'}</Button>
      </div>
    </Modal>
  );
}

export function InstallAppButton({ app, label, business }: { app: StaffApp; label?: string; business?: InstallBusiness }) {
  const platform = detectPlatform();
  const st = useInstallState();
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const noun = app === 'panel' ? 'panel' : 'caja';
  if (st.installed) return <span className="inline-flex items-center gap-1.5 text-[12.5px] text-[#067647]" data-testid={`installed-${app}`}><Check size={14} /> Ya está en tu pantalla de inicio</span>;
  const go = async () => {
    if (st.canPrompt && !business) {
      const r = await st.prompt();
      if (r === 'accepted') { toast('good', `Listo: tu ${noun} quedó en la pantalla de inicio.`); return; }
      if (r === 'dismissed') return;
    }
    setOpen(true);
  };
  return (
    <>
      <Button variant="secondary" size="sm" onClick={go} data-testid={`install-${app}`}>
        {st.canPrompt ? <Download size={15} /> : <Smartphone size={15} />} {label ?? `Instalar ${noun} en este teléfono`}
      </Button>
      {business ? <InstallScreen app={app} business={business} open={open} onClose={() => setOpen(false)} /> : (
        <Modal open={open} onClose={() => setOpen(false)} title={`Agregar ${noun} a tu teléfono`} labelledBy="install-staff-title">
          <InstallSteps noun={noun} />
          {platform === 'desktop' ? null : <p className="mt-4 text-[12px] text-slate2 leading-snug">Es un acceso directo a tu {noun}. Sigues entrando con tu correo y contraseña, y no sustituye a Apple Wallet ni a Google Wallet.</p>}
          <Button variant="secondary" className="w-full mt-4" onClick={() => setOpen(false)}>Entendido</Button>
        </Modal>
      )}
    </>
  );
}
