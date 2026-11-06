// V0.4.5 · Envío de invitaciones por correo desde el Control Center, con estado verificable.
// "Aceptado por el proveedor" NO es "entregado": la entrega solo se muestra si llega un aviso firmado del proveedor.
import React, { useState } from 'react';
import { Mail, RefreshCw } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { CButton, Pill } from './kit';

export type EmailDelivery = { status: string; attempts: number; sendsAccepted: number; acceptedAt: string | null; deliveredAt: string | null; error: string | null; canSend: boolean } | null;

export const EMAIL_STATUS: Record<string, { label: string; tone: 'green' | 'cyan' | 'amber' | 'red' | 'silver'; hint: string }> = {
  pending: { label: 'Pendiente de envío', tone: 'silver', hint: 'Aún no se pide el envío.' },
  requested: { label: 'Envío solicitado', tone: 'cyan', hint: 'Se está entregando al proveedor.' },
  accepted: { label: 'Aceptado por el proveedor', tone: 'cyan', hint: 'El proveedor recibió el mensaje. Todavía no confirma que llegó al buzón.' },
  delivered: { label: 'Entregado', tone: 'green', hint: 'El proveedor confirmó la entrega al servidor de correo del destinatario.' },
  failed: { label: 'Fallido', tone: 'red', hint: 'El proveedor no aceptó el mensaje. Puedes reintentar.' },
  bounced: { label: 'Rebotado', tone: 'red', hint: 'El buzón rechazó el mensaje. Revisa el correo o comparte el enlace por otro medio.' },
  complained: { label: 'Marcado como spam', tone: 'amber', hint: 'El destinatario lo marcó como no deseado.' },
  not_configured: { label: 'Sin proveedor de correo', tone: 'amber', hint: 'No se envió nada. Comparte el enlace copiándolo.' },
};

export function EmailStatusPill({ d }: { d: EmailDelivery }) {
  if (!d) return null;
  const s = EMAIL_STATUS[d.status] ?? EMAIL_STATUS.pending;
  return <span title={d.error ?? s.hint} data-testid="email-status"><Pill tone={s.tone}>{s.label}</Pill></span>;
}

/** Bloque "Invitar al propietario" con botón de envío. Se usa al terminar el alta y en la ficha del negocio. */
export function EmailInviteBlock({ businessId, invitationId, email, title = 'Invitar al propietario', initial = null, onSent }: { businessId: string; invitationId: string; email: string; title?: string; initial?: EmailDelivery; onSent?: () => void }) {
  const [d, setD] = useState<EmailDelivery>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const send = async () => {
    setBusy(true); setErr(null);
    setD((x) => ({ ...(x ?? { attempts: 0, sendsAccepted: 0, acceptedAt: null, deliveredAt: null, error: null, canSend: true }), status: 'requested' }));
    try {
      const r = await api<{ status: string; attempt: number; error: string | null }>('POST', `/admin/businesses/${businessId}/invitations/${invitationId}/send-email`);
      setD((x) => ({ ...(x as NonNullable<EmailDelivery>), status: r.status, attempts: r.attempt, error: r.error, sendsAccepted: (x?.sendsAccepted ?? 0) + (r.status === 'accepted' ? 1 : 0) }));
      onSent?.();
    } catch (x) {
      setErr((x as ApiError).message);
      setD(initial);
    } finally { setBusy(false); }
  };
  const sentOnce = d && ['accepted', 'delivered', 'bounced', 'complained'].includes(d.status);
  const st = d ? EMAIL_STATUS[d.status] : null;
  return (
    <div className="flex flex-col gap-2" data-testid="email-invite">
      <div className="text-[13px] font-medium">{title}</div>
      <div className="text-[12.5px] cc-muted">Correo: <span className="text-white break-all" data-testid="email-invite-to">{email}</span></div>
      <div className="flex flex-wrap items-center gap-2">
        <CButton variant={sentOnce ? 'secondary' : 'primary'} onClick={send} disabled={busy || d?.canSend === false} data-testid="send-invite-email">
          {sentOnce ? <><RefreshCw size={14} /> Reenviar invitación</> : <><Mail size={14} /> Enviar invitación</>}
        </CButton>
        {d && d.status !== 'pending' && <EmailStatusPill d={d} />}
      </div>
      {d?.status === 'accepted' && <p className="text-[12px] cc-faint" data-testid="email-sent-note">Invitación enviada. {st?.hint}</p>}
      {d && ['failed', 'bounced', 'not_configured'].includes(d.status) && <p className="text-[12px] text-[#FDA29B]">{d.error ?? st?.hint}</p>}
      {err && <p className="text-[12px] text-[#FDA29B]" role="alert">{err}</p>}
      <p className="text-[11.5px] cc-faint">El correo lleva el mismo enlace de un solo uso (nunca una contraseña). Reenviar no crea otra invitación.</p>
    </div>
  );
}
