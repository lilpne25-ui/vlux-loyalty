// V0.4.4 · Activación de un diseño. Dos piezas que comparten el mismo "Brand Activation Draft":
//   ActivatePanel  → parte PÚBLICA (Estudio): prepara el borrador en el servidor. No crea negocios ni da permisos.
//   FromDesign     → Control Center: recupera el borrador (solo con sesión + 2FA), muestra la vista previa y entrega los datos al
//                    asistente de alta existente (Wizard). La creación real sigue siendo POST /api/admin/businesses.
import { useEffect, useState } from 'react';
import { ArrowRight, Check, Copy, ExternalLink, Loader2, ShieldCheck } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { navigate, useLocation } from '../lib/router';
import { CONTACT_URL } from '../lib/demoAccess';
import { LoyaltyCardFace } from '../components/LoyaltyCard';
import { brandVars } from '../components/Brand';
import { FINISHES, type CardFinish } from '../lib/finish';
import { sanitizeFit, type LogoFit } from '../lib/logoFit';
import { CButton, PageHeader, cx } from './kit';

export interface DesignDraft {
  name: string; logoDataUrl: string | null; logoOriginalDataUrl: string | null; logoFit: LogoFit | null;
  primaryColor: string; accentColor: string; cardFinish: CardFinish; stampsRequired: number; rewardDescription: string; vertical?: string;
}
const REF_RE = /^[A-Za-z0-9_-]{43}$/;
export const DRAFT_REF_KEY = 'vlux:draft-ref';
const LAST_KEY = 'vlux:last-draft';

export const safeRef = (v: unknown): string | null => (typeof v === 'string' && REF_RE.test(v) ? v : null);
export function rememberRef(ref: string) { try { sessionStorage.setItem(DRAFT_REF_KEY, ref); } catch { /* sin almacenamiento */ } }
export function pendingRef(): string | null { try { return safeRef(sessionStorage.getItem(DRAFT_REF_KEY)); } catch { return null; } }
export function forgetRef() { try { sessionStorage.removeItem(DRAFT_REF_KEY); } catch { /* */ } }

/** Entrega los datos del borrador al asistente de alta (mismo origen: sessionStorage solo dentro del Control Center). */
export function handToWizard(d: DesignDraft, ref: string | null) {
  try { sessionStorage.setItem('vlux:studio', JSON.stringify({ ...d, draftRef: ref })); } catch { /* */ }
  navigate('/vlux-admin/negocios/nuevo');
}

// ---------------------------------------------------------------- Parte pública
type Prepared = { ref: string; expiresAt: string; ttlHours: number; controlCenterUrl: string; controlCenterConfigured: boolean };

export function ActivatePanel({ design, onClose }: { design: DesignDraft; onClose: () => void }) {
  const [state, setState] = useState<{ kind: 'idle' } | { kind: 'busy' } | { kind: 'ok'; r: Prepared } | { kind: 'err'; msg: string }>(() => {
    try { const s = JSON.parse(sessionStorage.getItem(LAST_KEY) || 'null'); if (s && safeRef(s.ref) && new Date(s.expiresAt) > new Date()) return { kind: 'ok', r: s }; } catch { /* */ }
    return { kind: 'idle' };
  });
  const [copied, setCopied] = useState(false);
  const prepare = async () => {
    setState({ kind: 'busy' });
    try {
      const r = await api<Prepared>('POST', '/public/activation-drafts', design);
      try { sessionStorage.setItem(LAST_KEY, JSON.stringify(r)); } catch { /* */ }
      setState({ kind: 'ok', r });
    } catch (e) {
      const ae = e as ApiError;
      setState({ kind: 'err', msg: ae.status === 429 ? 'Ya preparaste varios diseños en poco tiempo. Espera un rato e inténtalo de nuevo.' : ae.status === 422 ? 'Revisa el nombre de tu negocio y la recompensa; faltan datos válidos.' : ae.message });
    }
  };
  return (
    <section className="cc-panel p-5 sm:p-6 flex flex-col gap-4" data-testid="activate-panel" aria-label="Activar mi tarjeta">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-medium">Solicitar activar mi tarjeta</h2>
          <p className="mt-1 text-[13px] cc-muted max-w-[58ch]">Activar una tarjeta crea tu negocio, tu acceso y tu QR, y lo hace el equipo de VLUX. Aquí solo preparamos tu diseño para que no tengas que repetirlo: nada se activa por sí solo.</p>
        </div>
        <CButton small variant="ghost" onClick={onClose} aria-label="Cerrar">Cerrar</CButton>
      </div>

      {state.kind !== 'ok' && (
        <div className="flex flex-col gap-2 items-start">
          <p className="text-[12.5px] cc-muted">Al preparar el diseño se guarda en nuestro servidor <strong className="text-white">por {24} horas</strong>: nombre, logo, colores, acabado, sellos y recompensa. Nada más.</p>
          <CButton variant="primary" onClick={prepare} disabled={state.kind === 'busy'} data-testid="activate-prepare">{state.kind === 'busy' ? <><Loader2 size={15} className="animate-spin" /> Preparando…</> : 'Preparar mi diseño'}</CButton>
          {state.kind === 'err' && <p className="text-[12.5px] text-[#FDA29B]" role="alert" data-testid="activate-error">{state.msg}</p>}
        </div>
      )}

      {state.kind === 'ok' && (
        <div className="flex flex-col gap-4" data-testid="activate-ready">
          <div className="inline-flex items-center gap-2 text-[13px] text-[#47CD89]"><Check size={15} /> Diseño preparado. Aún no se ha activado ningún negocio.</div>
          <div>
            <div className="cc-label">Tu código de diseño · vence {new Date(state.r.expiresAt).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}</div>
            <div className="mt-1.5 flex items-center gap-2"><code className="cc-code select-all break-all flex-1" data-testid="activate-ref">{state.r.ref}</code>
              <CButton small onClick={async () => { try { await navigator.clipboard.writeText(state.r.ref); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* */ } }}><Copy size={13} /> {copied ? 'Copiado' : 'Copiar'}</CButton></div>
            <p className="mt-1.5 text-[12px] cc-faint">El código no da ningún acceso: solo identifica este diseño. Compártelo únicamente con el equipo de VLUX.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="cc-raised p-4 flex flex-col gap-2">
              <div className="text-[13.5px] font-medium">Soy del equipo VLUX</div>
              <p className="text-[12.5px] cc-muted">Continúa en Control Center: pedirá tu sesión y segundo factor, y recuperará este diseño.</p>
              {state.r.controlCenterConfigured
                ? <a className="cc-btn cc-btn-primary self-start" href={state.r.controlCenterUrl} target="_blank" rel="noopener noreferrer" data-testid="activate-continue">Continuar en Control Center <ExternalLink size={14} /></a>
                : <p className="text-[12px] text-[#F7C97B]" data-testid="activate-no-cc">La dirección del Control Center no está configurada en este sitio. Abre Control Center y pega el código en “Crear negocio desde un diseño”.</p>}
            </div>
            <div className="cc-raised p-4 flex flex-col gap-2">
              <div className="text-[13.5px] font-medium">Quiero que VLUX lo active</div>
              {CONTACT_URL
                ? <a className="cc-btn cc-btn-primary self-start" href={CONTACT_URL} target="_blank" rel="noopener noreferrer" data-testid="activate-contact">Contactar a VLUX <ArrowRight size={14} /></a>
                : <p className="text-[12.5px] cc-muted" data-testid="activate-no-contact">Todavía no hay un canal de contacto configurado en este sitio, así que no se envió ninguna solicitud. Comparte tu código con tu contacto de VLUX.</p>}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- Control Center
type Loaded = { draft: DesignDraft; expiresAt: string };

export function FromDesign() {
  const { search } = useLocation();
  const urlRef = safeRef(search.get('activar'));
  const [ref, setRef] = useState<string | null>(() => urlRef ?? pendingRef());
  const [input, setInput] = useState('');
  const [st, setSt] = useState<{ kind: 'idle' } | { kind: 'loading' } | { kind: 'ok'; d: Loaded } | { kind: 'err'; status: number; msg: string }>({ kind: 'idle' });

  // La referencia viene en la URL solo para llegar aquí; se guarda en la sesión del navegador y se quita de la barra de direcciones.
  useEffect(() => { if (urlRef) { rememberRef(urlRef); setRef(urlRef); history.replaceState(null, '', location.pathname); } }, [urlRef]);
  useEffect(() => {
    if (!ref) { setSt({ kind: 'idle' }); return; }
    let live = true;
    setSt({ kind: 'loading' });
    api<{ draft: DesignDraft; expiresAt: string }>('GET', `/admin/activation-drafts/${ref}`)
      .then((r) => { if (live) setSt({ kind: 'ok', d: { draft: { ...r.draft, logoFit: sanitizeFit(r.draft.logoFit) }, expiresAt: r.expiresAt } }); })
      .catch((e: ApiError) => { if (live) setSt({ kind: 'err', status: e.status, msg: e.message }); });
    return () => { live = false; };
  }, [ref]);

  const d = st.kind === 'ok' ? st.d.draft : null;
  return (
    <div className="max-w-[880px]" data-testid="from-design">
      <PageHeader title="Crear negocio desde un diseño" sub="Recupera el diseño que se preparó en la página pública o en el Estudio; después completas los datos del negocio." />
      {st.kind === 'loading' && <p className="cc-muted text-[13px]" role="status">Recuperando el diseño…</p>}
      {st.kind === 'idle' && (
        <form className="cc-panel p-5 flex flex-col gap-3 max-w-[560px]" onSubmit={(e) => { e.preventDefault(); const r = safeRef(input.trim()); if (r) { rememberRef(r); setRef(r); } }}>
          <label htmlFor="draft-code" className="text-[13px]">Pega el código de diseño</label>
          <input id="draft-code" data-testid="draft-code" className="cc-input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Código de 43 caracteres" autoComplete="off" spellCheck={false} />
          {input.trim() && !safeRef(input.trim()) && <p className="text-[12px] text-[#FDA29B]">El código no tiene el formato esperado.</p>}
          <div className="flex gap-2"><CButton type="submit" variant="primary" disabled={!safeRef(input.trim())} data-testid="draft-open">Recuperar diseño</CButton><CButton type="button" onClick={() => navigate('/vlux-admin/estudio')}>Abrir el Estudio</CButton></div>
        </form>
      )}
      {st.kind === 'err' && (
        <div className="cc-panel p-5 flex flex-col gap-3 max-w-[620px]" role="alert" data-testid="draft-error">
          <div className="text-[14.5px] font-medium">{st.status === 410 ? 'Este diseño ya no se puede usar' : st.status === 404 ? 'No encontramos ese diseño' : 'No se pudo recuperar el diseño'}</div>
          <p className="text-[13px] cc-muted">{st.status === 410 ? `${st.msg} Los diseños duran 24 horas y se usan una sola vez.` : st.msg} No se creó ningún negocio.</p>
          <div className="flex flex-wrap gap-2">
            <CButton variant="primary" onClick={() => { forgetRef(); setRef(null); setSt({ kind: 'idle' }); }}>Probar con otro código</CButton>
            <CButton onClick={() => navigate('/personalizar')}>Preparar el diseño de nuevo</CButton>
            <CButton variant="ghost" onClick={() => { forgetRef(); navigate('/vlux-admin/negocios/nuevo'); }}>Crear sin diseño</CButton>
          </div>
        </div>
      )}
      {d && st.kind === 'ok' && (
        <div className="grid gap-6 md:grid-cols-[minmax(0,420px)_1fr] items-start">
          <div style={brandVars(d.primaryColor, d.accentColor, d.cardFinish)} data-testid="draft-card">
            <LoyaltyCardFace businessName={d.name} customerName="Mariana López" cardId="VX-4F7K-92" total={d.stampsRequired} filled={3} logoUrl={d.logoDataUrl} logoFit={d.logoFit} footer={<span className="opacity-70">Vista previa</span>} interactive={false} />
          </div>
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[13px]" data-testid="draft-summary">
              {([['Negocio', d.name], ['Acabado', FINISHES.find((f) => f.id === d.cardFinish)?.label ?? d.cardFinish], ['Sellos', String(d.stampsRequired)], ['Recompensa', d.rewardDescription], ['Colores', `${d.primaryColor} · ${d.accentColor}`], ['Logotipo', d.logoDataUrl ? 'Incluido' : 'Sin logotipo']] as const).map(([k, v]) => (
                <div key={k}><dt className="cc-faint text-[12px]">{k}</dt><dd className="mt-0.5 break-words">{v}</dd></div>
              ))}
            </dl>
            <p className="text-[12.5px] cc-muted inline-flex items-start gap-2"><ShieldCheck size={15} className="mt-0.5 shrink-0" /> Recuperar el diseño no crea nada. Después revisas y confirmas el alta en el asistente; vence {new Date(st.d.expiresAt).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}</p>
            <div className="flex flex-wrap gap-2">
              <CButton variant="primary" onClick={() => handToWizard(d, ref)} data-testid="draft-use">Usar este diseño <ArrowRight size={15} /></CButton>
              <CButton variant="ghost" onClick={() => { forgetRef(); setRef(null); }}>Descartar</CButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export { cx };
