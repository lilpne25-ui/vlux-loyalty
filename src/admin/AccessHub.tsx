// V0.4.6 · Centro de accesos del Control Center: en un solo lugar, cómo entra cada persona de un negocio
// (propietario, caja y clientes), con recuperación y entrega segura sin depender del correo.
// Reglas: los enlaces permanentes NO llevan credenciales; las invitaciones y los restablecimientos generan SIEMPRE un
// token nuevo (los consumidos nunca se vuelven a mostrar); abrir WhatsApp no se reporta como "enviado".
import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock, Download, ExternalLink, KeyRound, LayoutDashboard, MessageCircle, QrCode, RefreshCw, ScanLine, Share2, Smartphone, UserPlus, Users, XCircle } from 'lucide-react';
import { api, ApiError, type Vertical } from '../lib/api';
import { relativeTime } from '../lib/format';
import { downloadQrPng } from '../lib/qr';
import { canNativeShare, nativeShare, shareMessage, whatsappUrl, type ShareKind } from '../lib/share';
import { CopyButton, QRCode, useToast } from '../components/ui';
import { LoyaltyCardFace } from '../components/LoyaltyCard';
import { brandVars } from '../components/Brand';
import { sanitizeFit } from '../lib/logoFit';
import { CButton, CField, CModal, Pill, cx } from './kit';
import { EmailInviteBlock, EmailStatusPill, type EmailDelivery } from './EmailInvite';

export type HubInvitation = { id: string; email: string; displayName: string; role: 'OWNER' | 'EMPLOYEE'; status: 'pendiente' | 'aceptada' | 'revocada' | 'vencida'; expiresAt: string; createdAt: string; delivery?: 'link' | 'in_person'; emailDelivery?: EmailDelivery };
export type HubStaff = { membershipId: string; role: 'OWNER' | 'EMPLOYEE'; active: boolean; email: string; displayName: string; createdAt: string; lastLogin: string | null; accountState?: string; otherBusinesses?: number };
export type HubBusiness = {
  id: string; slug: string; name: string; vertical: Vertical; primaryColor: string; accentColor: string; cardFinish?: 'signature' | 'silver' | 'black'; status: string;
  logoDataUrl: string | null; logoFit?: unknown | null; program: { stampsRequired: number; rewardDescription: string };
  registrationUrl: string; access?: { customerUrl: string; cashierUrl: string; ownerUrl: string; loginUrl: string };
  staff: HubStaff[]; invitations: HubInvitation[];
};

type ShareTarget = { kind: ShareKind; title: string; url: string; recipientName?: string; role?: 'OWNER' | 'EMPLOYEE'; expiresAt?: string | null; invitationId?: string; note?: string; qrFile: string };
type InPerson = { invitationId: string; url: string; code: string; activateUrl: string; expiresAt: string; name: string; role: 'OWNER' | 'EMPLOYEE' };
type InviteOut = { invitationId: string; link: string; expiresAt: string; mode: 'link' | 'in_person'; accessCode: string | null; activateUrl: string | null };

const STATUS_TONE = { pendiente: 'cyan', aceptada: 'green', revocada: 'silver', vencida: 'amber' } as const;
const ACCOUNT_TONE: Record<string, 'green' | 'amber' | 'red' | 'silver'> = { activa: 'green', 'debe cambiar contraseña': 'amber', 'bloqueada temporalmente': 'amber', 'acceso desactivado': 'silver', deshabilitada: 'red' };
const fmt = (d: string) => new Date(d).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).replace(/\.$/, '');

export function AccessHub({ d, refresh }: { d: HubBusiness; refresh: () => void }) {
  const toast = useToast();
  const [share, setShare] = useState<ShareTarget | null>(null);
  const [inPerson, setInPerson] = useState<InPerson | null>(null);
  const [emailOn, setEmailOn] = useState(false);
  useEffect(() => { api<{ state: string }>('GET', '/admin/email/status').then((r) => setEmailOn(r.state !== 'not_configured')).catch(() => setEmailOn(false)); }, []);

  const links = d.access ?? { customerUrl: d.registrationUrl, cashierUrl: '', ownerUrl: '', loginUrl: '' };
  const owners = d.staff.filter((s) => s.role === 'OWNER');
  const employees = d.staff.filter((s) => s.role === 'EMPLOYEE');
  const ownerInv = d.invitations.filter((i) => i.role === 'OWNER');
  const latestOwnerInv = ownerInv.find((i) => i.status === 'pendiente' || i.status === 'vencida') ?? null;
  const employeeInv = d.invitations.filter((i) => i.role === 'EMPLOYEE' && (i.status === 'pendiente' || i.status === 'vencida'));
  const archived = d.status === 'archived';

  const openInvitation = (r: InviteOut, name: string, role: 'OWNER' | 'EMPLOYEE') => {
    if (r.mode === 'in_person' && r.accessCode && r.activateUrl) setInPerson({ invitationId: r.invitationId, url: r.link, code: r.accessCode, activateUrl: r.activateUrl, expiresAt: r.expiresAt, name, role });
    else setShare({ kind: 'invitation', title: `Invitación para ${name}`, url: r.link, recipientName: name, role, expiresAt: r.expiresAt, invitationId: r.invitationId, qrFile: `${d.slug}-invitacion.png`,
      note: 'Enlace de un solo uso. Si generas otro, este deja de funcionar.' });
    refresh();
  };
  const renew = async (inv: HubInvitation, mode: 'link' | 'in_person') => {
    try { openInvitation(await api<InviteOut>('POST', `/admin/businesses/${d.id}/invitations/${inv.id}/resend`, { delivery: mode }), inv.displayName, inv.role); }
    catch (x) { toast('bad', (x as ApiError).message); }
  };
  const revoke = async (inv: HubInvitation) => {
    try { await api('POST', `/admin/businesses/${d.id}/invitations/${inv.id}/revoke`); toast('good', 'Invitación revocada: el enlace ya no funciona.'); refresh(); }
    catch (x) { toast('bad', (x as ApiError).message); }
  };
  const reset = async (s: HubStaff) => {
    try {
      const r = await api<{ resetLink: string; otherBusinesses: number }>('POST', `/admin/businesses/${d.id}/staff/${s.membershipId}/reset-link`);
      setShare({ kind: 'reset', title: `Nueva contraseña para ${s.displayName}`, url: r.resetLink, recipientName: s.displayName, qrFile: `${d.slug}-restablecer.png`,
        note: `Sirve una sola vez durante 60 minutos y cierra sus sesiones abiertas. La contraseña actual nunca se muestra ni se recupera.${r.otherBusinesses ? ` Es la misma cuenta con la que administra ${r.otherBusinesses} negocio(s) más.` : ''}` });
    } catch (x) { toast('bad', (x as ApiError).message); }
  };

  return (
    <div className="flex flex-col gap-5" data-testid="access-hub">
      {archived && <div className="cc-raised px-4 py-3 text-[13px] cc-muted">Negocio archivado: los accesos no funcionan hasta restaurarlo.</div>}

      {/* ---------- Propietario ---------- */}
      <HubSection icon={<LayoutDashboard size={17} />} title="Acceso del propietario" sub="Recupera y entrega el panel del dueño. El enlace permanente no lleva contraseña ni token." testid="hub-owner">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-3">
            {owners.map((s) => (
              <div key={s.membershipId} className="cc-raised p-4 flex flex-col gap-2" data-testid="owner-account">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-medium">{s.displayName}</span>
                  <Pill tone={ACCOUNT_TONE[s.accountState ?? 'activa'] ?? 'silver'}>{s.accountState ?? (s.active ? 'activa' : 'acceso desactivado')}</Pill>
                </div>
                <div className="text-[12.5px] cc-muted break-all">{s.email}</div>
                <div className="text-[12px] cc-faint">Último acceso: {s.lastLogin ? relativeTime(s.lastLogin) : 'todavía no entra'}{s.otherBusinesses ? ` · también administra ${s.otherBusinesses} negocio(s)` : ''}</div>
                <div className="flex flex-wrap gap-2 mt-1">
                  <CButton small onClick={() => setShare({ kind: 'permanent', title: `Panel de ${d.name}`, url: links.ownerUrl, recipientName: s.displayName, qrFile: `${d.slug}-panel.png`, note: 'Enlace permanente: abre el inicio de sesión del panel de este negocio. No contiene contraseña ni token.' })} data-testid="share-owner-link"><Share2 size={13} /> Compartir su enlace</CButton>
                  {s.active && s.accountState !== 'deshabilitada' && <CButton small variant="ghost" onClick={() => reset(s)} data-testid="owner-reset"><KeyRound size={13} /> Restablecer contraseña</CButton>}
                </div>
              </div>
            ))}
            {owners.length === 0 && !latestOwnerInv && <p className="text-[13px] cc-muted">Este negocio todavía no tiene propietario con cuenta.</p>}
            {latestOwnerInv && (
              <InvitationCard inv={latestOwnerInv} businessId={d.id} emailOn={emailOn} onRenew={renew} onRevoke={revoke} onSent={refresh} />
            )}
            {!archived && (owners.length === 0 || ownerInv.length === 0) && !latestOwnerInv && (
              <InviteForm businessId={d.id} role="OWNER" onCreated={openInvitation} />
            )}
          </div>
          <PermanentLink label="Enlace permanente del panel" url={links.ownerUrl} qrLabel={`QR del panel de ${d.name}`} onShare={() => setShare({ kind: 'permanent', title: `Panel de ${d.name}`, url: links.ownerUrl, recipientName: owners[0]?.displayName, qrFile: `${d.slug}-panel.png`, note: 'Enlace permanente: abre el inicio de sesión del panel de este negocio. No contiene contraseña ni token.' })} testid="owner-permanent"
            footer="Al abrirlo, el propietario entra con su correo y contraseña y ve «Instalar mi panel en este teléfono»." />
        </div>
      </HubSection>

      {/* ---------- Caja ---------- */}
      <HubSection icon={<ScanLine size={17} />} title="Acceso de caja" sub="Personal autorizado. Los empleados solo ven la caja: nunca el panel del dueño." testid="hub-cashier">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-3">
            <ul className="cc-raised divide-y divide-[color:var(--cc-line)]">
              {employees.map((s) => (
                <li key={s.membershipId} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-[13px]">
                  <div className="min-w-0"><div>{s.displayName} <span className="ml-1"><Pill tone={ACCOUNT_TONE[s.accountState ?? 'activa'] ?? 'silver'}>{s.accountState ?? (s.active ? 'activa' : 'inactiva')}</Pill></span></div><div className="cc-faint text-[12px] break-all">{s.email} · último acceso {s.lastLogin ? relativeTime(s.lastLogin) : 'nunca'}</div></div>
                  {s.active && <CButton small variant="ghost" onClick={() => reset(s)}><KeyRound size={13} /> Nueva contraseña</CButton>}
                </li>
              ))}
              {employees.length === 0 && <li className="px-4 py-3 text-[13px] cc-muted">Sin personal de caja todavía. El dueño también puede invitarlo desde su panel.</li>}
            </ul>
            {employeeInv.map((inv) => <InvitationCard key={inv.id} inv={inv} businessId={d.id} emailOn={emailOn} onRenew={renew} onRevoke={revoke} onSent={refresh} />)}
            {!archived && <InviteForm businessId={d.id} role="EMPLOYEE" onCreated={openInvitation} />}
          </div>
          <PermanentLink label="Enlace de caja" url={links.cashierUrl} qrLabel={`QR de caja de ${d.name}`} onShare={() => setShare({ kind: 'cashier', title: `Caja de ${d.name}`, url: links.cashierUrl, qrFile: `${d.slug}-caja.png`, note: 'Enlace permanente de la caja. Cada empleado entra con su propio correo y contraseña.' })} testid="cashier-permanent"
            footer={<><Smartphone size={12} className="inline -mt-0.5" /> Instalación: abre el enlace en el teléfono o tablet del mostrador, entra y toca «Agregar caja a este teléfono».</>} />
        </div>
      </HubSection>

      {/* ---------- Clientes ---------- */}
      <HubSection icon={<Users size={17} />} title="Acceso de clientes" sub="Público y sin contraseña: es el QR del mostrador." testid="hub-customers">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start">
          <PermanentLink label="Enlace público del negocio" url={links.customerUrl} qrLabel={`QR de registro de clientes de ${d.name}`} onShare={() => setShare({ kind: 'customers', title: `Tarjeta de ${d.name}`, url: links.customerUrl, qrFile: `${d.slug}-clientes.png` })} testid="customers-permanent"
            footer="Descarga el QR en alta resolución para el cartel del mostrador. El dueño también lo imprime desde su panel." />
          <div className="flex flex-col gap-2">
            <div className="cc-label">Vista previa de la tarjeta</div>
            <div style={brandVars(d.primaryColor, d.accentColor, d.cardFinish)} data-vertical={d.vertical} className="max-w-[380px]">
              <LoyaltyCardFace businessName={d.name} customerName="Cliente de ejemplo" cardId="XXXX-XXXX" total={d.program.stampsRequired} filled={Math.min(3, d.program.stampsRequired)} logoUrl={d.logoDataUrl} logoFit={sanitizeFit(d.logoFit)} footer={<span className="opacity-70">Vista previa</span>} interactive={false} compact />
            </div>
            <p className="text-[12px] cc-faint">{d.program.stampsRequired} sellos = {d.program.rewardDescription.toLowerCase()}</p>
          </div>
        </div>
      </HubSection>

      <ShareModal target={share} businessId={d.id} businessName={d.name} onClose={() => setShare(null)} />
      <InPersonModal data={inPerson} business={d} onClose={() => { setInPerson(null); refresh(); }} />
    </div>
  );
}

function HubSection({ icon, title, sub, children, testid }: { icon: React.ReactNode; title: string; sub: string; children: React.ReactNode; testid: string }) {
  return (
    <section className="cc-panel p-5 flex flex-col gap-4" data-testid={testid}>
      <header className="flex items-start gap-3">
        <span className="h-9 w-9 shrink-0 rounded-xl inline-flex items-center justify-center bg-white/[.06] text-[#67C7D3]">{icon}</span>
        <div><h2 className="text-[15px] font-medium">{title}</h2><p className="text-[12.5px] cc-muted mt-0.5">{sub}</p></div>
      </header>
      {children}
    </section>
  );
}

function PermanentLink({ label, url, qrLabel, onShare, footer, testid }: { label: string; url: string; qrLabel: string; onShare: () => void; footer?: React.ReactNode; testid: string }) {
  const toast = useToast();
  if (!url) return null;
  return (
    <div className="cc-raised p-4 flex flex-col gap-3" data-testid={testid}>
      <div className="cc-label">{label}</div>
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-white p-1.5 shrink-0"><QRCode value={url} size={96} label={qrLabel} /></div>
        <div className="min-w-0 flex-1 flex flex-col gap-2">
          <div className="cc-code select-all break-all" data-testid={`${testid}-url`}>{url}</div>
          <div className="flex flex-wrap gap-1.5">
            <CopyButton dark text={url} />
            <CButton small onClick={onShare}><Share2 size={13} /> Compartir</CButton>
            <CButton small variant="ghost" onClick={() => { downloadQrPng(url, `${qrLabel.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`); toast('good', 'QR descargado (PNG).'); }}><Download size={13} /> QR</CButton>
            <a className="cc-btn cc-btn-ghost cc-btn-sm" href={url} target="_blank" rel="noopener noreferrer"><ExternalLink size={13} /> Abrir</a>
          </div>
        </div>
      </div>
      {footer && <p className="text-[11.5px] cc-faint leading-snug">{footer}</p>}
    </div>
  );
}

function InvitationCard({ inv, businessId, emailOn, onRenew, onRevoke, onSent }: { inv: HubInvitation; businessId: string; emailOn: boolean; onRenew: (i: HubInvitation, m: 'link' | 'in_person') => void; onRevoke: (i: HubInvitation) => void; onSent: () => void }) {
  return (
    <div className="cc-raised p-4 flex flex-col gap-2" data-testid={`invitation-${inv.role === 'OWNER' ? 'owner' : 'employee'}`}>
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <span className="font-medium">{inv.displayName}</span>
        <Pill tone={STATUS_TONE[inv.status]}>Invitación {inv.status}</Pill>
        {inv.delivery === 'in_person' && <Pill dot={false}>presencial</Pill>}
        {inv.emailDelivery && inv.emailDelivery.status !== 'pending' && <EmailStatusPill d={inv.emailDelivery} />}
      </div>
      <div className="text-[12px] cc-faint break-all">{inv.email} · {inv.status === 'vencida' ? `venció el ${fmt(inv.expiresAt)}` : `vence el ${fmt(inv.expiresAt)}`}</div>
      <p className="text-[12px] cc-muted">Por seguridad el enlace anterior no se vuelve a mostrar. Genera uno nuevo para compartirlo: el anterior deja de funcionar.</p>
      <div className="flex flex-wrap gap-2">
        <CButton small variant="primary" onClick={() => onRenew(inv, 'link')} data-testid="renew-invitation"><RefreshCw size={13} /> Generar enlace nuevo</CButton>
        <CButton small onClick={() => onRenew(inv, 'in_person')} data-testid="in-person-invitation"><QrCode size={13} /> Activación presencial</CButton>
        {inv.status === 'pendiente' && <CButton small variant="ghost" onClick={() => onRevoke(inv)}><XCircle size={13} /> Revocar</CButton>}
      </div>
      {inv.status === 'pendiente' && emailOn && inv.emailDelivery?.canSend && <div className="mt-1"><EmailInviteBlock businessId={businessId} invitationId={inv.id} email={inv.email} title="O envíala por correo" initial={inv.emailDelivery} onSent={onSent} /></div>}
    </div>
  );
}

function InviteForm({ businessId, role, onCreated }: { businessId: string; role: 'OWNER' | 'EMPLOYEE'; onCreated: (r: InviteOut, name: string, role: 'OWNER' | 'EMPLOYEE') => void }) {
  const [f, setF] = useState({ displayName: '', email: '' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (mode: 'link' | 'in_person') => {
    setErr(null); setBusy(true);
    try {
      const r = await api<InviteOut>('POST', `/admin/businesses/${businessId}/invitations`, { ...f, role, delivery: mode });
      onCreated(r, f.displayName, role);
      setF({ displayName: '', email: '' });
    } catch (x) { setErr((x as ApiError).message); } finally { setBusy(false); }
  };
  const ok = f.displayName.trim().length >= 2 && /\S+@\S+\.\S+/.test(f.email);
  const p = role === 'OWNER' ? 'owner' : 'emp';
  return (
    <div className="cc-raised p-4 flex flex-col gap-3" data-testid={`invite-form-${p}`}>
      <div className="text-[13px] font-medium inline-flex items-center gap-2"><UserPlus size={14} /> {role === 'OWNER' ? 'Invitar al propietario' : 'Invitar personal de caja'}</div>
      <div className="grid sm:grid-cols-2 gap-3">
        <CField label="Nombre" htmlFor={`${p}-inv-name`}><input id={`${p}-inv-name`} className="cc-input" value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} /></CField>
        <CField label="Correo" htmlFor={`${p}-inv-email`}><input id={`${p}-inv-email`} type="email" className="cc-input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></CField>
      </div>
      {err && <p className="text-[12.5px] text-[#FDA29B]" role="alert">{err}</p>}
      <div className="flex flex-wrap gap-2">
        <CButton variant="primary" small disabled={!ok || busy} onClick={() => submit('link')} data-testid={`invite-${p}-link`}><KeyRound size={13} /> Generar enlace</CButton>
        <CButton small disabled={!ok || busy} onClick={() => submit('in_person')} data-testid={`invite-${p}-in-person`}><QrCode size={13} /> Activación presencial</CButton>
      </div>
      <p className="text-[11.5px] cc-faint">Si el correo ya tiene cuenta en VLUX, la persona confirma con su contraseña actual y se vincula (no se crean cuentas duplicadas). {role === 'EMPLOYEE' ? 'El rol es de caja: no da acceso al panel del dueño.' : ''}</p>
    </div>
  );
}

function ShareModal({ target, businessId, businessName, onClose }: { target: ShareTarget | null; businessId: string; businessName: string; onClose: () => void }) {
  const toast = useToast();
  const [opened, setOpened] = useState<null | 'whatsapp' | 'shared'>(null);
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => { setOpened(null); setConfirmed(false); }, [target?.url]);
  const msg = useMemo(() => (target ? shareMessage({ kind: target.kind, url: target.url, businessName, recipientName: target.recipientName, expiresAt: target.expiresAt, role: target.role }) : ''), [target, businessName]);
  if (!target) return <CModal open={false} onClose={onClose} title="" labelledBy="cc-share-title"><span /></CModal>;
  const track = (method: string) => { if (target.invitationId) api('POST', `/admin/businesses/${businessId}/invitations/${target.invitationId}/share`, { method }).catch(() => undefined); };
  return (
    <CModal open onClose={onClose} title={target.title} labelledBy="cc-share-title">
      <div className="flex flex-col gap-4" data-testid="share-modal">
        <p className="text-[13px] cc-muted"><strong className="text-white">VLUX no envió ningún mensaje.</strong> Compártelo tú por un canal directo (WhatsApp, en persona o QR). {target.note}</p>
        <div className="flex flex-col items-center gap-3">
          <div className="rounded-lg bg-white p-2"><QRCode value={target.url} size={176} label={`Código QR: ${target.title}`} /></div>
          <div className="cc-code w-full select-all break-all" data-testid="share-url">{target.url}</div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <span onClick={() => track('copied')} className="contents"><CopyButton dark text={target.url} className="justify-center" /></span>
          {canNativeShare() && <CButton onClick={async () => { const r = await nativeShare(target.title, msg, target.url); if (r === 'shared') { setOpened('shared'); track('native_share'); } }}><Share2 size={14} /> Compartir</CButton>}
          <a className="cc-btn cc-btn-primary inline-flex items-center justify-center gap-1.5" href={whatsappUrl(msg)} target="_blank" rel="noopener noreferrer" onClick={() => { setOpened('whatsapp'); track('whatsapp_opened'); }} data-testid="share-whatsapp"><MessageCircle size={14} /> WhatsApp</a>
          <CButton onClick={() => { downloadQrPng(target.url, target.qrFile); track('qr_downloaded'); toast('good', 'QR descargado (PNG).'); }}><Download size={14} /> Descargar QR</CButton>
        </div>
        {opened === 'whatsapp' && (
          <div className="cc-raised px-3.5 py-3 text-[12.5px] flex flex-col gap-2" data-testid="whatsapp-opened" role="status">
            <span>Se abrió WhatsApp con el mensaje preparado. <strong>VLUX no puede confirmar que se envió.</strong></span>
            {target.invitationId && !confirmed && <CButton small onClick={() => { setConfirmed(true); track('confirmed_sent'); }} data-testid="confirm-sent"><CheckCircle2 size={13} /> Ya lo envié</CButton>}
            {confirmed && <span className="text-[#75E0A7]">Registrado como enviado por ti.</span>}
          </div>
        )}
        {opened === 'shared' && <p className="text-[12.5px] cc-muted" role="status">Tu teléfono abrió el menú de compartir. Revisa que el mensaje haya salido.</p>}
        <details className="text-[12px] cc-faint"><summary className="cursor-pointer">Ver el mensaje preparado</summary><p className="mt-2 whitespace-pre-wrap" data-testid="share-message">{msg}</p></details>
      </div>
    </CModal>
  );
}

/** Pantalla de activación presencial: QR grande + código corto, para el propietario que está frente al equipo de VLUX. */
function InPersonModal({ data, business, onClose }: { data: InPerson | null; business: HubBusiness; onClose: () => void }) {
  const [now, setNow] = useState(Date.now());
  const [accepted, setAccepted] = useState(false);
  useEffect(() => {
    if (!data) return;
    setAccepted(false);
    const t = setInterval(() => setNow(Date.now()), 1000);
    // Detecta la activación consultando el estado de la invitación (no expone el token).
    const p = setInterval(async () => {
      try {
        const r = await api<{ invitations: HubInvitation[] }>('GET', `/admin/businesses/${business.id}`);
        if (r.invitations.find((i) => i.id === data.invitationId)?.status === 'aceptada') setAccepted(true);
      } catch { /* sin cambios */ }
    }, 4000);
    return () => { clearInterval(t); clearInterval(p); };
  }, [data, business.id]);
  if (!data) return <CModal open={false} onClose={onClose} title="" labelledBy="cc-inperson-title"><span /></CModal>;
  const left = Math.max(0, new Date(data.expiresAt).getTime() - now);
  const mm = Math.floor(left / 60000), ss = Math.floor((left % 60000) / 1000);
  return (
    <CModal open onClose={onClose} title={`Activación presencial · ${business.name}`} labelledBy="cc-inperson-title" wide>
      <div className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)] items-start" data-testid="in-person-modal">
        <div className="flex flex-col items-center gap-2">
          <div className="rounded-xl bg-white p-3"><QRCode value={data.url} size={220} label="QR de activación presencial" /></div>
          <div className={cx('inline-flex items-center gap-1.5 text-[12.5px] tabular-nums', left < 5 * 60000 ? 'text-[#FEC84B]' : 'cc-muted')}><Clock size={13} /> {left > 0 ? `Vence en ${mm}:${String(ss).padStart(2, '0')}` : 'Venció: genera otro'}</div>
        </div>
        <div className="flex flex-col gap-3">
          {accepted ? (
            <div className="cc-raised p-4 text-[14px] flex items-center gap-2 text-[#75E0A7]" data-testid="in-person-accepted"><CheckCircle2 size={18} /> {data.name} activó su cuenta. Ya puede instalar su panel desde la bienvenida.</div>
          ) : (
            <ol className="flex flex-col gap-2.5 text-[13.5px]">
              <li><strong>1.</strong> {data.name} escanea el QR con la cámara de su teléfono.</li>
              <li><strong>2.</strong> Elige su propia contraseña (nadie más la ve).</li>
              <li><strong>3.</strong> En la bienvenida toca «Instalar mi panel en este teléfono».</li>
            </ol>
          )}
          <div className="cc-raised p-3.5 flex flex-col gap-1">
            <span className="text-[12px] cc-muted">¿No funciona la cámara? Abre <span className="text-white">{data.activateUrl.replace(/^https?:\/\//, '')}</span> y escribe:</span>
            <span className="font-mono text-[26px] tracking-[0.16em] text-white select-all" data-testid="in-person-code">{data.code}</span>
          </div>
          <p className="text-[11.5px] cc-faint">Muestra esta pantalla solo a {data.name}. Código y QR sirven una sola vez y vencen en 30 minutos. No hay contraseñas predeterminadas.</p>
          <div className="flex gap-2"><CButton variant="primary" onClick={onClose}>{accepted ? 'Listo' : 'Cerrar'}</CButton></div>
        </div>
      </div>
    </CModal>
  );
}
