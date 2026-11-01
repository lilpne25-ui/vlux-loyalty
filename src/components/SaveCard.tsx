// V0.2.2 · "Guarda tu tarjeta": agregar la tarjeta a la pantalla de inicio (PWA) y vincular la app
// instalada con la tarjeta mediante un código de un solo uso. No es Apple Wallet ni Google Wallet.
import React, { useCallback, useEffect, useState } from 'react';
import { Smartphone, Share, PlusSquare, Check, MoreVertical, KeyRound, Link2, WifiOff, RefreshCw, Download } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { detectPlatform, InstallPlatform, useInstallState } from '../lib/pwa';
import { Button, Modal, Field, inputCls, CopyButton, useToast } from './ui';

type PairCode = { code: string; expiresAt: string; expiresInMinutes: number };
const fmtCode = (c: string) => `${c.slice(0, 4)} ${c.slice(4)}`;

// Reutiliza el código vigente (en memoria de la página, nunca en almacenamiento) para no gastar el
// cupo de códigos cada vez que se abre la guía. "Otro" fuerza uno nuevo.
const openCodes = new Map<string, PairCode>();
const stillValid = (c?: PairCode) => !!c && new Date(c.expiresAt).getTime() - Date.now() > 60_000;

function usePairCode(slug: string) {
  const [code, setCode] = useState<PairCode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback((fresh = false) => {
    setError(null);
    const cached = openCodes.get(slug);
    if (!fresh && stillValid(cached)) { setCode(cached!); return; }
    api<PairCode>('POST', `/me/${slug}/pair-code`)
      .then((c) => { openCodes.set(slug, c); setCode(c); })
      .catch((e: ApiError) => setError(e.message));
  }, [slug]);
  return { code, error, load };
}

function PairCodeBox({ slug, autoload }: { slug: string; autoload: boolean }) {
  const { code, error, load } = usePairCode(slug);
  useEffect(() => { if (autoload) load(); }, [autoload, load]);
  return (
    <div className="rounded-xl border border-cafe-line bg-cafe-cream/40 p-3.5">
      <div className="flex items-center gap-2 text-[13px] font-medium text-cafe-ink"><KeyRound size={15} /> Código para abrir tu tarjeta en la app</div>
      <p className="mt-1 text-[12px] text-cafe-muted leading-snug">Si al abrir el ícono te pide un código, escribe este. Sirve una sola vez y vence en 15 minutos. No lo compartas.</p>
      {code ? (
        <div className="mt-2 flex items-center gap-2">
          <span className="font-mono text-[22px] tracking-[0.12em] whitespace-nowrap text-cafe-ink" data-testid="pair-code">{fmtCode(code.code)}</span>
          <CopyButton text={code.code} />
          <button onClick={() => load(true)} className="ml-auto shrink-0 whitespace-nowrap text-[12px] text-cafe-muted inline-flex items-center gap-1 hover:text-cafe-ink"><RefreshCw size={12} /> Otro</button>
        </div>
      ) : error ? (
        <p className="mt-2 text-[12.5px] text-[#B42318]">{error} <button onClick={() => load(true)} className="underline">Reintentar</button></p>
      ) : (
        <p className="mt-2 text-[12.5px] text-cafe-muted">Generando…</p>
      )}
    </div>
  );
}

const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
  <li className="flex items-start gap-3">
    <span className="h-6 w-6 shrink-0 rounded-full bg-[color:var(--brand)] text-[color:var(--cream)] text-[12px] font-semibold inline-flex items-center justify-center">{n}</span>
    <span className="text-[13.5px] text-cafe-body leading-snug pt-0.5">{children}</span>
  </li>
);

function Guide({ platform, slug, businessName, open, onClose }: { platform: InstallPlatform; slug: string; businessName: string; open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Agrega tu tarjeta a tu teléfono" labelledBy="guide-title">
      <div className="flex flex-col gap-4" data-testid={`install-guide-${platform}`}>
        {platform === 'ios-safari' && (
          <ol className="flex flex-col gap-3">
            <Step n={1}>Abajo en Safari, toca <strong>Compartir</strong> <Share size={14} className="inline -mt-0.5" aria-label="ícono Compartir" />. En iPad está arriba a la derecha.</Step>
            <Step n={2}>Desliza y elige <strong>Agregar a pantalla de inicio</strong> <PlusSquare size={14} className="inline -mt-0.5" aria-hidden="true" />.</Step>
            <Step n={3}>Deja el nombre <strong>{businessName}</strong> y toca <strong>Agregar</strong>.</Step>
            <Step n={4}>Abre el ícono nuevo. Si te pide un código, usa el de abajo.</Step>
          </ol>
        )}
        {platform === 'ios-other' && (
          <>
            <ol className="flex flex-col gap-3">
              <Step n={1}>Toca <strong>Compartir</strong> <Share size={14} className="inline -mt-0.5" aria-hidden="true" /> en este navegador (en Chrome está en la barra de dirección).</Step>
              <Step n={2}>Elige <strong>Agregar a pantalla de inicio</strong> y confirma.</Step>
              <Step n={3}>Abre el ícono nuevo. Si te pide un código, usa el de abajo.</Step>
            </ol>
            <p className="text-[12px] text-cafe-muted">¿No aparece la opción? Copia la dirección de esta página, ábrela en <strong>Safari</strong> y sigue los mismos pasos. Necesitas iOS 16.4 o posterior para hacerlo desde Chrome, Edge o Firefox.</p>
          </>
        )}
        {platform === 'android' && (
          <>
            <ol className="flex flex-col gap-3">
              <Step n={1}>En Chrome toca el menú <MoreVertical size={14} className="inline -mt-0.5" aria-label="tres puntos" /> (arriba a la derecha).</Step>
              <Step n={2}>Elige <strong>Agregar a la pantalla principal</strong> o <strong>Instalar app</strong>.</Step>
              <Step n={3}>Confirma con <strong>Instalar</strong> o <strong>Agregar</strong>.</Step>
            </ol>
            <p className="text-[12px] text-cafe-muted">Samsung Internet: menú → <strong>Agregar página a</strong> → Pantalla de inicio. Firefox: menú → <strong>Agregar a pantalla de inicio</strong> (se abre como acceso directo del navegador).</p>
          </>
        )}
        {platform === 'desktop' && (
          <p className="text-[13.5px] text-cafe-body">Esta opción es para tu teléfono. Abre tu tarjeta en el teléfono con tu enlace personal y ahí toca <strong>Agregar a mi teléfono</strong>. En computadora, Chrome y Edge muestran un ícono de instalar en la barra de dirección.</p>
        )}
        {platform !== 'desktop' && <PairCodeBox slug={slug} autoload={open} />}
        <p className="text-[11.5px] text-cafe-muted leading-snug">Esto agrega un acceso directo a tu tarjeta web. No es Apple Wallet ni Google Wallet, y no descarga nada de la tienda de aplicaciones.</p>
        <Button variant="brand" onClick={onClose}>Entendido</Button>
      </div>
    </Modal>
  );
}

/** Ilustración: un teléfono donde el ícono de la tarjeta "cae" en la pantalla de inicio (CSS, sin imágenes). */
function PhoneArt() {
  return (
    <span className="phone-art shrink-0" aria-hidden="true">
      <span className="phone-art-screen">
        {[0, 1, 2, 3, 4, 5].map((i) => <i key={i} />)}
        <b className="phone-art-icon" />
      </span>
    </span>
  );
}

/** Sección de la tarjeta: invita a guardarla en la pantalla de inicio. Se oculta dentro de la app instalada. */
export function SaveCardPanel({ slug, businessName }: { slug: string; businessName: string }) {
  const install = useInstallState();
  const toast = useToast();
  const [platform] = useState<InstallPlatform>(() => detectPlatform());
  const [guide, setGuide] = useState(false);
  const [done, setDone] = useState(false);
  if (install.installed && !done) return null;

  const onAdd = async () => {
    if (install.canPrompt) {
      const r = await install.prompt();
      if (r === 'accepted') { setDone(true); toast('good', 'Listo. Tu tarjeta está en tu pantalla de inicio.'); return; }
      if (r === 'dismissed') return;
    }
    setGuide(true);
  };

  return (
    <section className="rounded-2xl bg-white border border-cafe-line p-5" aria-labelledby="save-title" data-testid="save-card">
      <div className="flex items-center gap-4">
        <PhoneArt />
        <div className="min-w-0">
          <h3 id="save-title" className="font-display text-[19px] leading-tight text-cafe-ink">Llévala en tu teléfono</h3>
          <p className="text-[13.5px] text-cafe-body mt-1 leading-snug">Un ícono en tu pantalla de inicio y tus sellos siempre a un toque.</p>
        </div>
      </div>
      {done ? (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-[13px] text-[#067647] inline-flex items-center gap-1.5"><Check size={15} /> Agregada. Ábrela desde el ícono de {businessName}.</p>
          <PairCodeBox slug={slug} autoload />
        </div>
      ) : (
        <>
          <Button variant="brand" className="mt-4 w-full" onClick={onAdd} data-testid="add-to-phone"><Download size={16} /> Agregar a mi teléfono</Button>
          <p className="mt-2 text-center text-[11.5px] text-cafe-muted" data-testid="install-hint">{platform === 'ios-safari' ? 'En iPhone: Compartir → Agregar a pantalla de inicio. Te lo explicamos paso a paso.' : platform === 'ios-other' ? 'En iPhone funciona mejor desde Safari. Te decimos cómo.' : 'Sin descargar aplicaciones de la tienda.'}</p>
        </>
      )}
      <Guide platform={platform} slug={slug} businessName={businessName} open={guide} onClose={() => setGuide(false)} />
    </section>
  );
}

/** Dentro de la app instalada, sin tarjeta en este almacenamiento: vincular con código o enlace. */
export function PairScreen({ slug, businessName, onPaired, onNew }: { slug: string; businessName: string; onPaired: () => void; onNew: () => void }) {
  const [code, setCode] = useState('');
  const [linkText, setLinkText] = useState('');
  const [mode, setMode] = useState<'code' | 'link'>('code');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      if (mode === 'code') {
        await api('POST', `/me/${slug}/pair`, { code });
      } else {
        const token = (linkText.split('#')[1] || linkText.split('/t/')[1] || linkText).trim();
        const r = await api<{ slug: string }>('POST', '/card-access', { token });
        if (r.slug !== slug) { setError('Ese enlace es de otro negocio. Ábrelo en el navegador.'); return; }
      }
      onPaired();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo vincular. Intenta de nuevo.');
    } finally { setBusy(false); }
  };

  return (
    <div className="screen-in pt-8 flex flex-col gap-5" data-testid="pair-screen">
      <div>
        <h1 className="font-display text-[26px] leading-tight text-cafe-ink">Abre tu tarjeta de {businessName}</h1>
        <p className="mt-2 text-[13.5px] text-cafe-body">Por seguridad, esta app se vincula con tu tarjeta una sola vez. En el navegador donde creaste tu tarjeta, toca <strong>Agregar a mi teléfono</strong> para ver tu código.</p>
      </div>
      <form onSubmit={submit} className="rounded-2xl bg-white border border-cafe-line p-5 flex flex-col gap-4">
        {mode === 'code' ? (
          <Field label="Código de 8 números" htmlFor="pair-code-input">
            <input id="pair-code-input" className={inputCls + ' font-mono tracking-[0.2em] text-center text-[20px]'} inputMode="numeric" autoComplete="one-time-code" maxLength={9} placeholder="0000 0000" value={code} onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ''))} />
          </Field>
        ) : (
          <Field label="Tu enlace personal" htmlFor="pair-link-input" hint="Es el enlace que guardaste al crear tu tarjeta.">
            <input id="pair-link-input" className={inputCls} autoComplete="off" placeholder="https://…/t#…" value={linkText} onChange={(e) => setLinkText(e.target.value)} />
          </Field>
        )}
        {error && <p className="text-[12.5px] text-[#B42318]" role="alert">{error}</p>}
        <Button variant="brand" type="submit" disabled={busy || (mode === 'code' ? code.replace(/\s/g, '').length !== 8 : linkText.trim().length < 20)}>
          {busy ? 'Vinculando…' : 'Abrir mi tarjeta'}
        </Button>
        <button type="button" onClick={() => { setMode(mode === 'code' ? 'link' : 'code'); setError(null); }} className="text-[12.5px] text-cafe-muted inline-flex items-center justify-center gap-1.5 hover:text-cafe-ink">
          {mode === 'code' ? <><Link2 size={13} /> Usar mi enlace personal</> : <><KeyRound size={13} /> Usar un código</>}
        </button>
      </form>
      <div className="text-center">
        <button onClick={onNew} className="text-[13px] text-cafe-muted underline">¿Aún no tienes tarjeta? Crear una</button>
        <p className="mt-1 text-[11.5px] text-cafe-muted leading-snug">Si ya tienes una, mejor usa tu código: crear otra duplicaría tus sellos.</p>
      </div>
    </div>
  );
}

/** Sin conexión: nunca inventa sellos ni simula operaciones. */
export function OfflineNotice({ hasData, onRetry }: { hasData: boolean; onRetry: () => void }) {
  return hasData ? (
    <div className="mt-3 rounded-xl border border-[#FEDF89] bg-[#FFFAEB] px-3 py-2 text-[12.5px] text-[#93370D] flex items-center gap-2" role="status" data-testid="offline-banner">
      <WifiOff size={14} className="shrink-0" /> Sin conexión. Ves la última información recibida; los sellos nuevos aparecerán al reconectar.
    </div>
  ) : (
    <div className="pt-16 flex flex-col items-center text-center gap-3" role="status" data-testid="offline-screen">
      <div className="h-12 w-12 rounded-full bg-cafe-cream inline-flex items-center justify-center text-cafe-ink"><WifiOff size={20} /></div>
      <h1 className="font-display text-[22px] text-cafe-ink">Sin conexión</h1>
      <p className="text-[13.5px] text-cafe-body max-w-[320px]">Tu tarjeta está guardada en el servidor. Conéctate a internet para verla. Los sellos y canjes solo se registran en caja con conexión.</p>
      <Button variant="secondary" onClick={onRetry}><RefreshCw size={15} /> Reintentar</Button>
    </div>
  );
}
