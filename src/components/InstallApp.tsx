// V0.4 · "Agregar a mi teléfono" para el dueño (Panel) y la caja. Misma lógica honesta que la tarjeta del
// cliente: Android/Chrome muestra el aviso nativo si el navegador lo permite; en iPhone solo se puede
// desde Safari con "Compartir → Agregar a pantalla de inicio". Nada de esto es Apple Wallet ni Google Wallet.
import React, { useEffect, useState } from 'react';
import { Smartphone, Share, PlusSquare, MoreVertical, Check, Download } from 'lucide-react';
import { detectPlatform, useInstallState } from '../lib/pwa';
import { Button, Modal, useToast } from './ui';

export function staffManifestHref(slug: string, app: 'panel' | 'caja') {
  return `/api/pwa/${slug}/staff/${app}/manifest.webmanifest`;
}

/** Pone el manifiesto del Panel o la Caja mientras esa vista está abierta. */
export function useStaffAppHead(slug: string | undefined, app: 'panel' | 'caja', name: string | undefined) {
  useEffect(() => {
    if (!slug) return;
    const prev = document.head.querySelector('link[rel="manifest"]')?.getAttribute('href');
    let el = document.head.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
    if (!el) { el = document.createElement('link'); el.rel = 'manifest'; document.head.appendChild(el); }
    el.href = staffManifestHref(slug, app);
    const apple = document.head.querySelector('meta[name="apple-mobile-web-app-title"]') as HTMLMetaElement | null;
    const t = document.title;
    document.title = `${app === 'panel' ? 'Panel' : 'Caja'}${name ? ` · ${name}` : ''}`;
    let m = apple;
    if (!m) { m = document.createElement('meta'); m.name = 'apple-mobile-web-app-title'; document.head.appendChild(m); }
    m.content = app === 'panel' ? 'Panel' : 'Caja';
    return () => { if (prev && el) el.href = prev; document.title = t; };
  }, [slug, app, name]);
}

const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
  <li className="flex items-start gap-3">
    <span className="h-6 w-6 shrink-0 rounded-full bg-ink text-white text-[12px] font-semibold inline-flex items-center justify-center">{n}</span>
    <span className="text-[13.5px] text-[#475467] leading-snug pt-0.5">{children}</span>
  </li>
);

export function InstallAppButton({ app, label }: { app: 'panel' | 'caja'; label?: string }) {
  const platform = detectPlatform();
  const st = useInstallState();
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const noun = app === 'panel' ? 'panel' : 'caja';
  if (st.installed) return <span className="inline-flex items-center gap-1.5 text-[12.5px] text-[#067647]"><Check size={14} /> Ya está en tu pantalla de inicio</span>;
  const go = async () => {
    if (st.canPrompt) {
      const r = await st.prompt();
      if (r === 'accepted') { toast('good', `Listo: tu ${noun} quedó en la pantalla de inicio.`); return; }
      if (r === 'dismissed') return;
    }
    setOpen(true);
  };
  return (
    <>
      <Button variant="secondary" size="sm" onClick={go} data-testid={`install-${app}`}>
        {st.canPrompt ? <Download size={15} /> : <Smartphone size={15} />} {label ?? `Agregar ${noun} a mi teléfono`}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Agregar ${noun} a tu teléfono`} labelledBy="install-staff-title">
        {platform === 'ios-safari' ? (
          <ol className="flex flex-col gap-3.5">
            <Step n={1}>Toca el botón <Share size={14} className="inline -mt-0.5" /> <strong>Compartir</strong>, abajo en Safari.</Step>
            <Step n={2}>Desliza y elige <PlusSquare size={14} className="inline -mt-0.5" /> <strong>Agregar a pantalla de inicio</strong>.</Step>
            <Step n={3}>Toca <strong>Agregar</strong>. Verás el ícono de tu {noun} junto a tus apps.</Step>
          </ol>
        ) : platform === 'ios-other' ? (
          <p className="text-[14px] text-[#475467]">En iPhone solo <strong>Safari</strong> puede agregar apps a la pantalla de inicio. Abre esta misma dirección en Safari y repite el paso. Otros navegadores del iPhone no lo permiten.</p>
        ) : platform === 'android' ? (
          <ol className="flex flex-col gap-3.5">
            <Step n={1}>Abre el menú <MoreVertical size={14} className="inline -mt-0.5" /> de Chrome (arriba a la derecha).</Step>
            <Step n={2}>Elige <strong>Instalar app</strong> o <strong>Agregar a pantalla principal</strong>.</Step>
            <Step n={3}>Confirma. Tu {noun} abrirá a pantalla completa, como una app.</Step>
          </ol>
        ) : (
          <p className="text-[14px] text-[#475467]">Abre esta dirección desde el teléfono o la tablet de tu negocio y vuelve a tocar este botón. En computadora, Chrome y Edge ofrecen instalar desde la barra de direcciones.</p>
        )}
        <p className="mt-4 text-[12px] text-slate2 leading-snug">Es un acceso directo a tu {noun}. Sigues entrando con tu correo y contraseña, y no sustituye a Apple Wallet ni a Google Wallet.</p>
        <Button variant="secondary" className="w-full mt-4" onClick={() => setOpen(false)}>Entendido</Button>
      </Modal>
    </>
  );
}
