// Asistente "+ Nuevo negocio": 4 pasos. El servidor crea todo en una sola transacción
// (negocio, programa, suscripción e invitación del dueño). No crea proyectos ni despliegues nuevos.
import { EmailInviteBlock } from './EmailInvite';
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Download, ExternalLink } from 'lucide-react';
import { api, ApiError, type Vertical } from '../lib/api';
import { navigate } from '../lib/router';
import { VERTICAL_LABEL, isPoints, rewardSentence, stampRule, unitTitle, units } from '../lib/vertical';
import { ProgramFields } from '../components/ProgramFields';
import { DEFAULT_PROGRAM, formFromTemplate, previewProgram, programError, rulesFromForm, type ProgramForm } from '../lib/program-form';
import { VERTICALS, VERTICAL_IDS, verticalInfo } from '../../shared/catalog';
import { CopyButton, QRCode } from '../components/ui';
import { CButton, CField, PLAN_LABEL, PageHeader, cx, money } from './kit';
import { ColorField, LogoField } from './Businesses';
import { LIMITS } from '../../shared/rules';
import { LoyaltyCardFace } from '../components/LoyaltyCard';
import { brandVars } from '../components/Brand';
import { sanitizeFit, type LogoFit } from '../lib/logoFit';
import { forgetRef, pendingRef, safeRef } from './Activation';

type Plan = { code: 'piloto' | 'inicio' | 'crecimiento'; name: string; priceCents: number; currency: string };
type Created = { businessId: string; slug: string; registrationUrl: string; access?: { customerUrl: string; cashierUrl: string; ownerUrl: string }; ownerInvitation: { invitationId?: string; link: string; expiresAt: string }; email?: { state: 'configured' | 'mock' | 'not_configured' } };

const COLORS: Record<string, { primary: string; accent: string }> = {
  cafeteria: { primary: '#2B1B14', accent: '#C9A15B' }, restaurante: { primary: '#1B1F1A', accent: '#D9A441' },
  barberia: { primary: '#14181F', accent: '#B9C0C9' }, salon: { primary: '#2A1626', accent: '#D8A7B1' }, unas: { primary: '#2B1624', accent: '#E3A7C0' },
  dentista: { primary: '#0F2230', accent: '#8FD3E8' }, consultorio: { primary: '#10232B', accent: '#7CC6C0' }, taller: { primary: '#17191C', accent: '#E0A43A' },
  autolavado: { primary: '#0E1E33', accent: '#6FB7F2' }, gimnasio: { primary: '#141414', accent: '#C6F432' }, veterinaria: { primary: '#1C2A1E', accent: '#9ED39A' },
  spa: { primary: '#22261F', accent: '#CDBA8E' }, optica: { primary: '#161B26', accent: '#B9C0C9' }, boutique: { primary: '#1D1518', accent: '#D9B26F' },
  accesorios: { primary: '#191512', accent: '#D2B26B' }, otro: { primary: '#111418', accent: '#67C7D3' },
};
const PRESETS: Record<string, { primary: string; accent: string }> = Object.fromEntries(VERTICALS.map((v) => [v.id, COLORS[v.id] ?? COLORS.otro]));
const programFor = (vertical: string, base: ProgramForm = DEFAULT_PROGRAM): ProgramForm => { const t = verticalInfo(vertical).templates[0]; return t ? formFromTemplate(t, base) : base; };

const STEPS = ['Negocio', 'Programa', 'Plan', 'Resumen'];

export function Wizard() {
  const [step, setStep] = useState(0);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [created, setCreated] = useState<Created | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({
    name: '', vertical: 'cafeteria' as Vertical, city: '', ownerName: '', ownerEmail: '', logoDataUrl: null as string | null, logoFit: null as LogoFit | null, logoOriginalDataUrl: null as string | null,
    primaryColor: PRESETS.cafeteria.primary, accentColor: PRESETS.cafeteria.accent, cardFinish: 'silver' as 'signature' | 'silver' | 'black',
    reviewUrl: '',
    plan: 'piloto' as Plan['code'], price: '', pilotDays: 30, isDemo: false,
  });
  const [prog, setProg] = useState<ProgramForm>(() => programFor('cafeteria'));
  const [progTouched, setProgTouched] = useState(false);
  // Brand Activation Draft del que viene el diseño (se consume en la creación; evita duplicados por reintento).
  const [draftRef, setDraftRef] = useState<string | null>(null);
  const [fromDesign, setFromDesign] = useState(false);
  const [draftNote, setDraftNote] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  // Marca preparada en el Estudio de marca (solo sesión del navegador; se consume una vez).
  useEffect(() => {
    let handed = false;
    try {
      const raw = sessionStorage.getItem('vlux:studio');
      if (raw) {
        handed = true;
        sessionStorage.removeItem('vlux:studio');
        const v = JSON.parse(raw);
        setDraftRef(safeRef(v.draftRef)); setFromDesign(true);
        setDraftNote({ tone: 'ok', text: 'Diseño recuperado. Revisa los datos y completa lo que falta; puedes cambiar cualquier cosa antes de crear el negocio.' });
        const hex = /^#[0-9a-f]{6}$/i;
        setF((x) => ({
          ...x,
          name: typeof v.name === 'string' ? v.name.slice(0, 60) : x.name,
          logoDataUrl: typeof v.logoDataUrl === 'string' && v.logoDataUrl.length < 90000 && /^data:image\/(png|jpeg|webp);base64,/.test(v.logoDataUrl) ? v.logoDataUrl : x.logoDataUrl,
          logoOriginalDataUrl: typeof v.logoOriginalDataUrl === 'string' && v.logoOriginalDataUrl.length < 90000 && /^data:image\/(png|jpeg|webp);base64,/.test(v.logoOriginalDataUrl) ? v.logoOriginalDataUrl : null,
          vertical: VERTICAL_IDS.includes(v.vertical) ? v.vertical : x.vertical,
          logoFit: sanitizeFit(v.logoFit) ?? x.logoFit,
          primaryColor: hex.test(v.primaryColor) ? v.primaryColor : x.primaryColor,
          accentColor: hex.test(v.accentColor) ? v.accentColor : x.accentColor,
          cardFinish: v.cardFinish === 'signature' || v.cardFinish === 'black' ? v.cardFinish : 'silver',
        }));
        const vv = VERTICAL_IDS.includes(v.vertical) ? v.vertical : 'cafeteria';
        setProg((p) => ({ ...programFor(vv, p), programType: 'stamps_purchase', stampMode: 'per_purchase', maxStampsPerPurchase: 1,
          rewardDescription: typeof v.rewardDescription === 'string' && v.rewardDescription.trim().length >= 3 ? v.rewardDescription.slice(0, 80) : p.rewardDescription,
          stampsRequired: Number.isInteger(v.stampsRequired) && v.stampsRequired >= 3 && v.stampsRequired <= 20 ? v.stampsRequired : p.stampsRequired }));
        setProgTouched(true);
      }
    } catch { /* sin almacenamiento */ }
    // Si se recargó la página en medio del alta, el diseño se recupera de nuevo desde el servidor con la misma referencia.
    const ref = pendingRef();
    if (handed || !ref) return;
    api<{ draft: any }>('GET', `/admin/activation-drafts/${ref}`).then(({ draft: v }) => {
      setDraftRef(ref); setFromDesign(true);
      setDraftNote({ tone: 'ok', text: 'Diseño recuperado. Revisa los datos y completa lo que falta; puedes cambiar cualquier cosa antes de crear el negocio.' });
      setF((x) => x.name ? x : ({ ...x, name: v.name, logoDataUrl: v.logoDataUrl, logoOriginalDataUrl: v.logoOriginalDataUrl, logoFit: sanitizeFit(v.logoFit), primaryColor: v.primaryColor, accentColor: v.accentColor, cardFinish: v.cardFinish, vertical: VERTICAL_IDS.includes(v.vertical) ? v.vertical : x.vertical }));
      setProg((p) => ({ ...p, programType: 'stamps_purchase', stampMode: 'per_purchase', maxStampsPerPurchase: 1, rewardDescription: v.rewardDescription ?? p.rewardDescription, stampsRequired: v.stampsRequired ?? p.stampsRequired }));
      setProgTouched(true);
    }).catch((x) => {
      forgetRef();
      const code = (x as ApiError).code;
      setDraftNote({ tone: 'warn', text: code === 'draft_expired' ? 'El diseño venció (dura 24 horas). Puedes dar de alta el negocio con los datos de aquí, o volver a prepararlo desde la página pública.' : code === 'draft_consumed' ? 'Ese diseño ya se usó para crear un negocio. Revisa el directorio antes de crear otro.' : 'No se pudo recuperar el diseño. Captura los datos aquí o vuelve a prepararlo desde la página pública.' });
    });
  }, []);
  useEffect(() => { api<{ plans: Plan[] }>('GET', '/admin/plans').then((r) => setPlans(r.plans)).catch(() => undefined); }, []);
  const plan = plans.find((p) => p.code === f.plan);
  const priceCents = f.price.trim() === '' ? plan?.priceCents ?? 0 : Math.round(Number(f.price) * 100);

  const setVertical = (v: Vertical) => {
    setF((x) => ({
      ...x, vertical: v,
      // Cambia los colores sugeridos solo si siguen siendo los sugeridos del giro anterior.
      primaryColor: x.primaryColor === PRESETS[x.vertical]?.primary ? PRESETS[v].primary : x.primaryColor,
      accentColor: x.accentColor === PRESETS[x.vertical]?.accent ? PRESETS[v].accent : x.accentColor,
    }));
    // La plantilla sugerida del giro reemplaza el programa solo si aún no se editó a mano.
    if (!progTouched) setProg((p) => programFor(v, p));
  };
  const progErr = programError(prog);
  const preview = previewProgram(prog);

  const stepValid = useMemo(() => [
    f.name.trim().length >= 2 && f.ownerName.trim().length >= 2 && /^\S+@\S+\.\S+$/.test(f.ownerEmail.trim()) && /^#[0-9A-F]{6}$/i.test(f.primaryColor) && /^#[0-9A-F]{6}$/i.test(f.accentColor),
    !progErr && (!f.reviewUrl.trim() || /^https:\/\/\S+$/.test(f.reviewUrl.trim())),
    !!f.plan && Number.isFinite(priceCents) && priceCents >= 0,
    true,
  ], [f, priceCents, progErr]);

  const create = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<Created>('POST', '/admin/businesses', {
        name: f.name.trim(), vertical: f.vertical, city: f.city.trim(), ownerName: f.ownerName.trim(), ownerEmail: f.ownerEmail.trim(),
        logoDataUrl: f.logoDataUrl, logoFit: f.logoFit, logoOriginalDataUrl: f.logoOriginalDataUrl, draftRef: draftRef ?? undefined, primaryColor: f.primaryColor, accentColor: f.accentColor, cardFinish: f.cardFinish,
        rules: rulesFromForm(prog),
        reviewUrl: f.reviewUrl.trim() || null, plan: f.plan, priceCents, pilotDays: f.pilotDays, isDemo: f.isDemo,
      });
      forgetRef();
      setCreated(r);
    } catch (x) {
      const e = x as ApiError;
      if (e.code === 'draft_expired') {
        // El diseño venció, pero los datos siguen en pantalla: se puede crear sin la referencia.
        setDraftRef(null); forgetRef();
        setDraftNote({ tone: 'warn', text: 'El diseño venció, pero tus datos siguen aquí. Pulsa de nuevo para crear el negocio con lo que ves en pantalla.' });
        setErr(null);
      } else if (e.code === 'draft_consumed') {
        setDraftRef(null); forgetRef();
        setErr('Este diseño ya se usó (otra solicitud lo consumió). Revisa el directorio de negocios antes de intentar otra vez para no duplicar.');
      } else setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (created) return <CreatedView c={created} f={{ ...f, stampsRequired: preview.stampsRequired, points: isPoints(preview), unit: unitTitle(preview) }} />;

  return (
    <>
      <button className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] cc-muted hover:text-white" onClick={() => navigate('/vlux-admin/negocios')}><ArrowLeft size={14} /> Negocios</button>
      <PageHeader title="Nuevo negocio" sub="Alta completa en un paso: negocio, programa, plan e invitación del dueño." />
      <ol className="flex flex-wrap gap-x-6 gap-y-3 mb-7" aria-label="Pasos">
        {STEPS.map((s, i) => (
          <li key={s} className="cc-step" data-state={i < step ? 'done' : i === step ? 'current' : 'todo'} aria-current={i === step ? 'step' : undefined}>
            <span className="cc-step-dot">{i < step ? <Check size={13} /> : i + 1}</span>{s}
          </li>
        ))}
      </ol>

      {draftNote && <div role="status" data-testid="draft-note" data-tone={draftNote.tone} className={`mb-5 rounded-lg border px-4 py-3 text-[13px] ${draftNote.tone === 'ok' ? 'border-[#47CD89]/30 text-[#9BE3BC]' : 'border-[#F5B544]/40 text-[#F5C971]'}`}>{draftNote.text}{fromDesign && draftNote.tone === 'ok' && <span className="cc-faint"> Todavía no se ha creado nada.</span>}</div>}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] items-start">
        <section className="cc-panel cc-sheen p-5 sm:p-6">
          {step === 0 && (
            <div className="grid sm:grid-cols-2 gap-4">
              <CField label="Nombre del negocio" htmlFor="wz-name"><input id="wz-name" className="cc-input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Café Ejemplo" /></CField>
              <CField label="Giro" htmlFor="wz-vertical"><select id="wz-vertical" className="cc-input" value={f.vertical} onChange={(e) => setVertical(e.target.value as Vertical)}>{Object.entries(VERTICAL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></CField>
              <CField label="Ciudad" htmlFor="wz-city"><input id="wz-city" className="cc-input" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} placeholder="Toluca" /></CField>
              <div className="hidden sm:block" />
              <CField label="Nombre del dueño" htmlFor="wz-owner"><input id="wz-owner" className="cc-input" value={f.ownerName} onChange={(e) => setF({ ...f, ownerName: e.target.value })} /></CField>
              <CField label="Correo del dueño" htmlFor="wz-email" hint="Recibirá una invitación por enlace (sin contraseña técnica)."><input id="wz-email" type="email" className="cc-input" value={f.ownerEmail} onChange={(e) => setF({ ...f, ownerEmail: e.target.value })} /></CField>
              <ColorField id="wz-primary" label="Color principal" value={f.primaryColor} onChange={(v) => setF({ ...f, primaryColor: v })} />
              <ColorField id="wz-accent" label="Color de acento" value={f.accentColor} onChange={(v) => setF({ ...f, accentColor: v })} />
              <CField label="Acabado de la tarjeta" htmlFor="wz-finish"><select id="wz-finish" className="cc-input" value={f.cardFinish} onChange={(e) => setF({ ...f, cardFinish: e.target.value as 'signature' | 'silver' | 'black' })}><option value="silver">Signature Silver</option><option value="black">Black Titanium</option><option value="signature">Signature Color</option></select></CField>
              <LogoField className="sm:col-span-2" value={f.logoDataUrl} fit={f.logoFit} original={f.logoOriginalDataUrl} onChange={(v) => setF({ ...f, logoDataUrl: v.logo, logoFit: v.fit, logoOriginalDataUrl: v.original })} />
              <label className="sm:col-span-2 flex items-center gap-2.5 text-[13px] cc-muted cursor-pointer">
                <input type="checkbox" className="accent-[#67C7D3]" checked={f.isDemo} onChange={(e) => setF({ ...f, isDemo: e.target.checked })} /> Es un negocio de demostración (no cuenta en métricas comerciales)
              </label>
            </div>
          )}
          {step === 1 && (
            <div className="flex flex-col gap-4">
              <ProgramFields theme="cc" idPrefix="wz" value={prog} vertical={f.vertical} onChange={(x) => { setProg(x); setProgTouched(true); }} />
              {progErr && <p className="text-[12px] text-[#FDA29B]" role="alert" data-testid="program-error">{progErr}</p>}
              <CField label="Enlace de reseñas de Google (opcional)" htmlFor="wz-review" hint="Se invita a reseñar después de la visita; nunca se premia la reseña (política de Google)."><input id="wz-review" className="cc-input" value={f.reviewUrl} onChange={(e) => setF({ ...f, reviewUrl: e.target.value })} placeholder="https://g.page/r/…/review" /></CField>
            </div>
          )}
          {step === 2 && (
            <div className="flex flex-col gap-4">
              <div className="grid sm:grid-cols-3 gap-2">
                {(plans.length ? plans : (['piloto', 'inicio', 'crecimiento'] as const).map((c) => ({ code: c, name: PLAN_LABEL[c], priceCents: 0, currency: 'MXN' }))).map((p) => (
                  <button key={p.code} type="button" className="cc-choice" aria-pressed={f.plan === p.code} onClick={() => setF({ ...f, plan: p.code, price: '' })}>
                    <div className="text-[13.5px] font-medium">{p.name}</div>
                    <div className="mt-1 text-[18px] tabular-nums">{money(p.priceCents, p.currency)}<span className="text-[12px] cc-muted">/mes</span></div>
                  </button>
                ))}
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <CField label="Precio para este negocio (opcional)" htmlFor="wz-price" hint={`Vacío = precio del plan (${money(plan?.priceCents ?? 0, plan?.currency)}).`}><input id="wz-price" inputMode="decimal" className="cc-input tabular-nums" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value.replace(/[^\d.]/g, '') })} /></CField>
                {f.plan === 'piloto' && <CField label="Duración del piloto (días)" htmlFor="wz-days"><input id="wz-days" type="number" min={1} max={180} className="cc-input tabular-nums" value={f.pilotDays} onChange={(e) => setF({ ...f, pilotDays: Number(e.target.value) })} /></CField>}
              </div>
              <p className="text-[12px] cc-faint">No se realizan cobros automáticos. El estado comercial se actualiza a mano en la ficha del negocio.</p>
            </div>
          )}
          {step === 3 && (
            <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-4 text-[13px]" data-testid="wizard-summary">
              <Item k="Negocio" v={`${f.name} · ${VERTICAL_LABEL[f.vertical]}${f.city ? ` · ${f.city}` : ''}`} />
              <Item k="Dueño" v={`${f.ownerName} · ${f.ownerEmail}`} />
              <Item k="Programa" v={`${preview.stampsRequired} ${units(preview, preview.stampsRequired)} → ${preview.rewardDescription}`} />
              <Item k="Regla" v={`${stampRule(preview).title} ${stampRule(preview).sub}`} />
              <Item k="Plan" v={`${PLAN_LABEL[f.plan]} · ${money(priceCents, plan?.currency)}/mes${f.plan === 'piloto' ? ` · ${f.pilotDays} días` : ''}`} />
              <Item k="Reseñas" v={f.reviewUrl.trim() || 'Sin enlace'} />
              <Item k="Tipo" v={f.isDemo ? 'Demostración' : 'Negocio real'} />
              <Item k="Al crear" v="Se genera un enlace de invitación para el dueño (entrega manual)." />
            </dl>
          )}
          {err && <p className="mt-5 text-[12.5px] text-[#FDA29B]" role="alert">{err}</p>}
          <div className="mt-7 flex justify-between gap-2">
            <CButton type="button" variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}><ArrowLeft size={14} /> Atrás</CButton>
            {step < 3
              ? <CButton type="button" variant="primary" disabled={!stepValid[step]} onClick={() => setStep(step + 1)}>Siguiente <ArrowRight size={14} /></CButton>
              : <CButton type="button" variant="primary" disabled={busy || !stepValid.slice(0, 3).every(Boolean)} onClick={create}>{busy ? 'Creando…' : 'Crear negocio'}</CButton>}
          </div>
        </section>

        <aside className="hidden lg:block">
          <div className="cc-label mb-2">Vista previa de la tarjeta</div>
          <div style={brandVars(f.primaryColor, f.accentColor, f.cardFinish)} data-testid="wizard-card"><LoyaltyCardFace compact businessName={f.name.trim() || 'Tu negocio'} customerName="Mariana López" cardId="VX-4F7K-92" total={Math.max(1, preview.stampsRequired || LIMITS.stampsRequired.min)} filled={Math.min(2, preview.stampsRequired || 2)} logoUrl={f.logoDataUrl} logoFit={f.logoFit} footer={<span className="opacity-70">{f.city || 'Ejemplo'}</span>} interactive={false} mode={isPoints(preview) ? 'points' : 'stamps'} unitLabel={unitTitle(preview)} /></div>
          <p className="mt-2 text-[11.5px] cc-muted">{rewardSentence(preview)}</p>
          
        </aside>
      </div>
    </>
  );
}

const Item = ({ k, v }: { k: string; v: string }) => <div><dt className="cc-faint text-[12px]">{k}</dt><dd className="mt-0.5 break-words">{v}</dd></div>;

/** Descarga un QR (SVG renderizado en pantalla) como PNG de 1024 px. */
async function downloadQr(host: HTMLElement | null, filename: string) {
  const svg = host?.querySelector('svg');
  if (!svg) return;
  const xml = new XMLSerializer().serializeToString(svg);
  const img = new Image();
  await new Promise<void>((ok, bad) => { img.onload = () => ok(); img.onerror = () => bad(new Error('qr')); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml); });
  const c = document.createElement('canvas'); c.width = c.height = 1024;
  const g = c.getContext('2d')!; g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0, 1024, 1024);
  const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = filename; a.click();
}

function QrBlock({ value, label, file }: { value: string; label: string; file: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  return (
    <div className="flex flex-col items-start gap-2">
      <div ref={ref} className="rounded-lg bg-white p-2 self-start"><QRCode value={value} size={132} label={label} /></div>
      <CButton small onClick={() => downloadQr(ref.current, file)} data-testid={`qr-download-${file.replace(/\.png$/, '')}`}><Download size={13} /> Descargar QR</CButton>
    </div>
  );
}

function Row({ k, v, testid }: { k: string; v: string; testid?: string }) {
  return (
    <div className="min-w-0">
      <div className="cc-faint text-[12px] mb-1">{k}</div>
      <div className="flex items-start gap-2">
        <div className="cc-code flex-1 min-w-0 break-all" data-testid={testid}>{v}</div>
        <CopyButton dark text={v} />
      </div>
    </div>
  );
}

/** Pantalla posterior al alta. Solo dice lo que es verdad: se generaron enlaces e invitación manual; no se envió ningún correo ni el negocio está operando todavía. */
function CreatedView({ c, f }: { c: Created; f: { name: string; ownerName: string; ownerEmail: string; primaryColor: string; accentColor: string; cardFinish: 'signature' | 'silver' | 'black'; logoDataUrl: string | null; logoFit: LogoFit | null; stampsRequired: number; points?: boolean; unit?: string } }) {
  const access = c.access ?? { customerUrl: c.registrationUrl, cashierUrl: '', ownerUrl: '' };
  const ficha = `/vlux-admin/negocios/${c.businessId}`;
  return (
    <div className="max-w-[980px]" data-testid="activation-screen">
      <div className="inline-flex items-center gap-2 text-[12.5px] text-[#47CD89]"><Check size={15} /> Configuración creada</div>
      <h1 className="mt-2 text-[26px] font-medium tracking-[-0.015em]">Tu negocio está configurado</h1>
      <p className="mt-1 text-[14px] font-medium" data-testid="created-name">{f.name}</p>
      <p className="mt-1.5 text-[13.5px] cc-muted max-w-[68ch]">Estado: <strong className="text-white">configuración creada</strong>. Todavía no opera: falta que {f.ownerName} acepte su invitación y que definas el acceso de caja. <strong className="text-white">No se envió ningún correo</strong> todavía: {c.email?.state === 'not_configured' || !c.email ? 'no hay proveedor de correo configurado, comparte los enlaces por un canal seguro.' : 'usa «Enviar invitación» o comparte el enlace por un canal seguro.'}</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr] items-start">
        <div style={brandVars(f.primaryColor, f.accentColor, f.cardFinish)} data-testid="activation-card">
          <LoyaltyCardFace businessName={f.name} customerName="Mariana López" cardId="VX-4F7K-92" total={f.stampsRequired} filled={0} logoUrl={f.logoDataUrl} logoFit={f.logoFit} footer={<span className="opacity-70">Vista previa</span>} mode={f.points ? 'points' : 'stamps'} unitLabel={f.unit} />
        </div>
        <div className="flex flex-col gap-4" data-testid="created-access">
          <section className="cc-panel p-5" aria-label="Cliente" data-testid="activation-customer">
            <div className="cc-label">Cliente · QR del mostrador</div>
            <div className="mt-3 flex flex-wrap gap-5">
              <QrBlock value={access.customerUrl} label="QR de registro de clientes" file={`${c.slug}-clientes.png`} />
              <div className="flex-1 min-w-[220px] flex flex-col gap-3">
                <Row k="Enlace público" v={access.customerUrl} testid="created-registration-url" />
                <div className="flex flex-wrap gap-2"><a className="cc-btn cc-btn-primary" href={access.customerUrl} target="_blank" rel="noopener noreferrer" data-testid="open-customer">Abrir experiencia del cliente <ExternalLink size={14} /></a></div>
              </div>
            </div>
          </section>
          <section className="cc-panel p-5" aria-label="Propietario" data-testid="activation-owner">
            <div className="cc-label">Propietario · invitación de un solo uso · 72 h</div>
            {c.ownerInvitation.invitationId && c.email?.state !== 'not_configured' && c.email && (
              <div className="mt-3 pb-4 border-b border-[color:var(--cc-line)]"><EmailInviteBlock businessId={c.businessId} invitationId={c.ownerInvitation.invitationId} email={f.ownerEmail} initial={{ status: 'pending', attempts: 0, sendsAccepted: 0, acceptedAt: null, deliveredAt: null, error: null, canSend: true }} /></div>
            )}
            <div className="mt-3 flex flex-wrap gap-5">
              <QrBlock value={c.ownerInvitation.link} label="QR de la invitación del dueño" file={`${c.slug}-invitacion-dueno.png`} />
              <div className="flex-1 min-w-[220px] flex flex-col gap-3">
                <Row k={`Para ${f.ownerName}`} v={c.ownerInvitation.link} testid="owner-invite-link" />
                {access.ownerUrl && <Row k="Panel del dueño" v={access.ownerUrl} />}
                {access.ownerUrl && <div className="flex flex-wrap gap-2"><a className="cc-btn" href={access.ownerUrl} target="_blank" rel="noopener noreferrer" data-testid="open-owner-panel">Abrir panel del dueño <ExternalLink size={14} /></a></div>}
                <p className="text-[12px] cc-faint">El panel del dueño pide la contraseña que se crea al aceptar la invitación.</p>
              </div>
            </div>
          </section>
          <section className="cc-panel p-5" aria-label="Empleados" data-testid="activation-staff">
            <div className="cc-label">Empleados · caja</div>
            <div className="mt-3 flex flex-col gap-3">
              {access.cashierUrl && <Row k="Acceso de caja" v={access.cashierUrl} testid="created-cashier-url" />}
              <div className="flex flex-wrap gap-2"><CButton onClick={() => navigate(ficha)} data-testid="invite-employee">Invitar empleado</CButton></div>
              <p className="text-[12px] cc-faint">Cada empleado entra con su propia invitación; se crean desde la ficha del negocio.</p>
            </div>
          </section>
        </div>
      </div>

      <section className="mt-6 flex flex-wrap gap-2" aria-label="VLUX" data-testid="activation-vlux">
        <CButton variant="primary" onClick={() => navigate(ficha)} data-testid="view-access">Ver accesos del negocio</CButton>
        <CButton onClick={() => navigate(ficha)}>Ver ficha del negocio</CButton>
        <CButton onClick={() => navigate(ficha)}>Editar configuración</CButton>
        <CButton variant="ghost" onClick={() => navigate('/vlux-admin/negocios')}>Volver a Control Center</CButton>
      </section>
    </div>
  );
}
