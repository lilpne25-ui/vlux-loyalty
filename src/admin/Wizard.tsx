// Asistente "+ Nuevo negocio": 4 pasos. El servidor crea todo en una sola transacción
// (negocio, programa, suscripción e invitación del dueño). No crea proyectos ni despliegues nuevos.
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { api, ApiError, type Vertical } from '../lib/api';
import { navigate } from '../lib/router';
import { VERTICAL_LABEL } from '../lib/vertical';
import { CopyButton, QRCode } from '../components/ui';
import { CButton, CField, PLAN_LABEL, PageHeader, cx, money } from './kit';
import { ColorField, LogoField } from './Businesses';
import { LIMITS } from '../../shared/rules';
import { LoyaltyCardFace } from '../components/LoyaltyCard';
import { brandVars } from '../components/Brand';
import { sanitizeFit, type LogoFit } from '../lib/logoFit';

type Plan = { code: 'piloto' | 'inicio' | 'crecimiento'; name: string; priceCents: number; currency: string };
type Created = { businessId: string; slug: string; registrationUrl: string; access?: { customerUrl: string; cashierUrl: string; ownerUrl: string }; ownerInvitation: { link: string; expiresAt: string } };

const PRESETS: Record<Vertical, { primary: string; accent: string; reward: string }> = {
  cafeteria: { primary: '#2B1B14', accent: '#C9A15B', reward: 'Una bebida de cortesía' },
  barberia: { primary: '#14181F', accent: '#B9C0C9', reward: 'Un corte de cortesía' },
  salon: { primary: '#2A1626', accent: '#D8A7B1', reward: 'Un tratamiento de cortesía' },
  restaurante: { primary: '#1B1F1A', accent: '#D9A441', reward: 'Un postre de cortesía' },
  otro: { primary: '#111418', accent: '#67C7D3', reward: 'Un producto de cortesía' },
};

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
    stampsRequired: 8, stampMode: 'per_purchase' as 'per_purchase' | 'per_item', maxStampsPerPurchase: 3, visitWindowMinutes: 120,
    rewardDescription: PRESETS.cafeteria.reward, reviewUrl: '',
    plan: 'piloto' as Plan['code'], price: '', pilotDays: 30, isDemo: false,
  });
  // Marca preparada en el Estudio de marca (solo sesión del navegador; se consume una vez).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('vlux:studio');
      if (!raw) return;
      sessionStorage.removeItem('vlux:studio');
      const v = JSON.parse(raw);
      const hex = /^#[0-9a-f]{6}$/i;
      setF((x) => ({
        ...x,
        name: typeof v.name === 'string' ? v.name.slice(0, 60) : x.name,
        logoDataUrl: typeof v.logoDataUrl === 'string' && v.logoDataUrl.length < 90000 && /^data:image\/(png|jpeg|webp);base64,/.test(v.logoDataUrl) ? v.logoDataUrl : x.logoDataUrl,
        logoFit: sanitizeFit(v.logoFit) ?? x.logoFit,
        primaryColor: hex.test(v.primaryColor) ? v.primaryColor : x.primaryColor,
        accentColor: hex.test(v.accentColor) ? v.accentColor : x.accentColor,
        cardFinish: v.cardFinish === 'signature' || v.cardFinish === 'black' ? v.cardFinish : 'silver',
        rewardDescription: typeof v.rewardDescription === 'string' ? v.rewardDescription.slice(0, 80) : x.rewardDescription,
        stampsRequired: Number.isInteger(v.stampsRequired) && v.stampsRequired >= 3 && v.stampsRequired <= 15 ? v.stampsRequired : x.stampsRequired,
      }));
    } catch { /* sin almacenamiento */ }
  }, []);
  useEffect(() => { api<{ plans: Plan[] }>('GET', '/admin/plans').then((r) => setPlans(r.plans)).catch(() => undefined); }, []);
  const plan = plans.find((p) => p.code === f.plan);
  const priceCents = f.price.trim() === '' ? plan?.priceCents ?? 0 : Math.round(Number(f.price) * 100);

  const setVertical = (v: Vertical) => setF((x) => ({
    ...x, vertical: v,
    // Cambia los colores y el premio sugeridos solo si siguen siendo los sugeridos del giro anterior.
    primaryColor: x.primaryColor === PRESETS[x.vertical].primary ? PRESETS[v].primary : x.primaryColor,
    accentColor: x.accentColor === PRESETS[x.vertical].accent ? PRESETS[v].accent : x.accentColor,
    rewardDescription: x.rewardDescription === PRESETS[x.vertical].reward ? PRESETS[v].reward : x.rewardDescription,
  }));

  const stepValid = useMemo(() => [
    f.name.trim().length >= 2 && f.ownerName.trim().length >= 2 && /^\S+@\S+\.\S+$/.test(f.ownerEmail.trim()) && /^#[0-9A-F]{6}$/i.test(f.primaryColor) && /^#[0-9A-F]{6}$/i.test(f.accentColor),
    f.stampsRequired >= LIMITS.stampsRequired.min && f.stampsRequired <= LIMITS.stampsRequired.max && f.visitWindowMinutes >= LIMITS.visitWindowMinutes.min && f.visitWindowMinutes <= LIMITS.visitWindowMinutes.max
      && f.maxStampsPerPurchase >= 1 && f.maxStampsPerPurchase <= LIMITS.maxStampsPerPurchase.max && f.rewardDescription.trim().length >= 3 && f.rewardDescription.trim().length <= 80 && (!f.reviewUrl.trim() || /^https:\/\/\S+$/.test(f.reviewUrl.trim())),
    !!f.plan && Number.isFinite(priceCents) && priceCents >= 0,
    true,
  ], [f, priceCents]);

  const create = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<Created>('POST', '/admin/businesses', {
        name: f.name.trim(), vertical: f.vertical, city: f.city.trim(), ownerName: f.ownerName.trim(), ownerEmail: f.ownerEmail.trim(),
        logoDataUrl: f.logoDataUrl, logoFit: f.logoFit, logoOriginalDataUrl: f.logoOriginalDataUrl, primaryColor: f.primaryColor, accentColor: f.accentColor, cardFinish: f.cardFinish,
        rules: { stampsRequired: f.stampsRequired, stampMode: f.stampMode, maxStampsPerPurchase: f.stampMode === 'per_item' ? f.maxStampsPerPurchase : 1, visitWindowMinutes: f.visitWindowMinutes, rewardDescription: f.rewardDescription.trim() },
        reviewUrl: f.reviewUrl.trim() || null, plan: f.plan, priceCents, pilotDays: f.pilotDays, isDemo: f.isDemo,
      });
      setCreated(r);
    } catch (x) {
      setErr((x as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  if (created) return <CreatedView c={created} name={f.name} ownerName={f.ownerName} />;

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
            <div className="grid sm:grid-cols-2 gap-4">
              <CField label="Sellos para el premio" htmlFor="wz-stamps" hint={`Entre ${LIMITS.stampsRequired.min} y ${LIMITS.stampsRequired.max}.`}><input id="wz-stamps" type="number" min={LIMITS.stampsRequired.min} max={LIMITS.stampsRequired.max} className="cc-input tabular-nums" value={f.stampsRequired} onChange={(e) => setF({ ...f, stampsRequired: Number(e.target.value) })} /></CField>
              <CField label="Ventana de visita (min)" htmlFor="wz-window" hint="Compras dentro de esta ventana cuentan como una visita."><input id="wz-window" type="number" min={15} max={720} className="cc-input tabular-nums" value={f.visitWindowMinutes} onChange={(e) => setF({ ...f, visitWindowMinutes: Number(e.target.value) })} /></CField>
              <div className="sm:col-span-2">
                <div className="text-[12.5px] font-medium text-[#C5CBD3] mb-2">Regla de acumulación</div>
                <div className="grid sm:grid-cols-2 gap-2">
                  <button type="button" className="cc-choice" aria-pressed={f.stampMode === 'per_purchase'} onClick={() => setF({ ...f, stampMode: 'per_purchase' })}><div className="text-[13.5px] font-medium">1 sello por compra</div><div className="mt-1 text-[12px] cc-muted">Sin importar cuántos artículos.</div></button>
                  <button type="button" className="cc-choice" aria-pressed={f.stampMode === 'per_item'} onClick={() => setF({ ...f, stampMode: 'per_item' })}><div className="text-[13.5px] font-medium">1 sello por artículo</div><div className="mt-1 text-[12px] cc-muted">Con un tope por compra.</div></button>
                </div>
              </div>
              {f.stampMode === 'per_item' && <CField label="Tope de sellos por compra" htmlFor="wz-max"><input id="wz-max" type="number" min={1} max={10} className="cc-input tabular-nums" value={f.maxStampsPerPurchase} onChange={(e) => setF({ ...f, maxStampsPerPurchase: Number(e.target.value) })} /></CField>}
              <CField label="Premio" htmlFor="wz-reward" className="sm:col-span-2"><input id="wz-reward" className="cc-input" value={f.rewardDescription} onChange={(e) => setF({ ...f, rewardDescription: e.target.value })} /></CField>
              <CField label="Enlace de reseñas de Google (opcional)" htmlFor="wz-review" className="sm:col-span-2" hint="Se invita a reseñar después de la visita; nunca se premia la reseña (política de Google)."><input id="wz-review" className="cc-input" value={f.reviewUrl} onChange={(e) => setF({ ...f, reviewUrl: e.target.value })} placeholder="https://g.page/r/…/review" /></CField>
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
              <Item k="Programa" v={`${f.stampsRequired} sellos → ${f.rewardDescription}`} />
              <Item k="Regla" v={f.stampMode === 'per_item' ? `1 sello por artículo (máx. ${f.maxStampsPerPurchase})` : '1 sello por compra'} />
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
          <div style={brandVars(f.primaryColor, f.accentColor, f.cardFinish)} data-testid="wizard-card"><LoyaltyCardFace compact businessName={f.name.trim() || 'Tu negocio'} customerName="Mariana López" cardId="VX-4F7K-92" total={Math.min(Math.max(f.stampsRequired, LIMITS.stampsRequired.min), LIMITS.stampsRequired.max)} filled={2} logoUrl={f.logoDataUrl} logoFit={f.logoFit} footer={<span className="opacity-70">{f.city || 'Ejemplo'}</span>} interactive={false} /></div>
          <p className="mt-2 text-[11.5px] cc-muted">Premio: {f.rewardDescription || '—'}</p>
          
        </aside>
      </div>
    </>
  );
}

const Item = ({ k, v }: { k: string; v: string }) => <div><dt className="cc-faint text-[12px]">{k}</dt><dd className="mt-0.5 break-words">{v}</dd></div>;

function CreatedView({ c, name, ownerName }: { c: Created; name: string; ownerName: string }) {
  return (
    <div className="max-w-[760px]">
      <div className="inline-flex items-center gap-2 text-[12.5px] text-[#47CD89]"><Check size={15} /> Negocio creado</div>
      <h1 className="mt-2 text-[24px] font-medium tracking-[-0.01em]" data-testid="created-name">{name}</h1>
      <p className="mt-1.5 text-[13.5px] cc-muted">Siguiente paso: envía la invitación a {ownerName}. <strong className="text-white">No se envió ningún correo</strong> (no hay proveedor configurado); compártela tú por un canal seguro.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <section className="cc-panel p-5 flex flex-col items-center gap-3 text-center">
          <div className="cc-label self-start">Invitación del dueño · un solo uso · 72 h</div>
          <div className="rounded-lg bg-white p-2"><QRCode value={c.ownerInvitation.link} size={150} label="QR de la invitación del dueño" /></div>
          <div className="cc-code w-full text-left select-all" data-testid="owner-invite-link">{c.ownerInvitation.link}</div>
          <CopyButton dark text={c.ownerInvitation.link} />
        </section>
        <section className="cc-panel p-5 flex flex-col items-center gap-3 text-center">
          <div className="cc-label self-start">Registro de clientes (QR del mostrador)</div>
          <div className="rounded-lg bg-white p-2"><QRCode value={c.registrationUrl} size={150} label="QR de registro de clientes" /></div>
          <div className="cc-code w-full text-left" data-testid="created-registration-url">{c.registrationUrl}</div>
          <CopyButton dark text={c.registrationUrl} />
        </section>
      </div>
      {c.access && (
        <section className="mt-4 cc-panel p-5" data-testid="created-access" aria-label="Accesos del negocio">
          <div className="cc-label">Accesos del negocio · el dueño los verá también en su panel (pestaña Accesos)</div>
          <dl className="mt-3 grid gap-3 text-[13px]">
            {([['Clientes (QR del mostrador)', c.access.customerUrl], ['Caja (empleados, con contraseña)', c.access.cashierUrl], ['Panel del dueño (con contraseña)', c.access.ownerUrl]] as const).map(([k, v]) => (
              <div key={k} className="flex flex-wrap items-center gap-x-3 gap-y-1"><dt className="cc-faint w-[220px] shrink-0">{k}</dt><dd className="cc-code flex-1 min-w-0 break-all">{v}</dd><CopyButton dark text={v} /></div>
            ))}
          </dl>
        </section>
      )}
      <div className="mt-6 flex flex-wrap gap-2">
        <CButton variant="primary" onClick={() => navigate(`/vlux-admin/negocios/${c.businessId}`)}>Abrir ficha del negocio</CButton>
        <CButton onClick={() => navigate('/vlux-admin/negocios')}>Volver al directorio</CButton>
      </div>
    </div>
  );
}
