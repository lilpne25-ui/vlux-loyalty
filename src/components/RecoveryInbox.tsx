// 1.0.x · Bandeja del dueño: solicitudes «Perdí mi acceso» de sus clientes y WhatsApp público del negocio.
// El dueño decide: generar un enlace nuevo (revoca el anterior) y enviarlo él mismo, atender en persona o descartar.
// Seguridad: el enlace solo se envía al contacto REGISTRADO del cliente (deliverTo) o se entrega en persona con el QR.
// Si el contacto de la solicitud no coincide con el registro, primero hay que confirmar la identidad en persona.
import React, { useState } from 'react';
import { AlertTriangle, Check, KeyRound, Mail, MessageCircle, Phone, Search, X } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { relativeTime } from '../lib/format';
import { customerLinkText, mxToIntl, waLink } from '../lib/support';
import { Badge, Button, CopyButton, Field, Modal, QRCode, cx, inputCls, useToast } from './ui';

export interface RecoveryItem {
  id: string; status: 'pending' | 'link_issued' | 'resolved' | 'dismissed' | 'expired'; resolution: string | null;
  contact: string; contactType: 'whatsapp' | 'email'; nameHint: string | null; requestCount: number;
  createdAt: string; lastRequestedAt: string; resolvedAt: string | null; expiresAt?: string;
  match: { cardId: string; publicCode: string; customerName: string; contactMatches: boolean; hasRegisteredContact?: boolean } | null;
}
export interface RecoveryData { available: boolean; pending: number; dropped24h?: number; businessWhatsapp: string | null; requests: RecoveryItem[] }

const STATUS: Record<RecoveryItem['status'], [string, 'warn' | 'info' | 'good' | 'neutral']> = {
  pending: ['Pendiente', 'warn'], link_issued: ['Enlace generado', 'info'], resolved: ['Resuelta', 'good'], dismissed: ['Descartada', 'neutral'], expired: ['Vencida', 'neutral'],
};
const fmtContact = (c: string, t: 'whatsapp' | 'email') => (t === 'whatsapp' && /^\d{10}$/.test(c) ? `${c.slice(0, 3)} ${c.slice(3, 6)} ${c.slice(6)}` : c);

type Issued = { personalLink: string; card: { publicCode: string; customerName: string; contactMatches: boolean }; deliverTo: { contact: string; contactType: 'whatsapp' | 'email' } | null; requestId: string };
type Pending = { item: RecoveryItem; cardId?: string };

export function RecoveryInbox({ data, businessName, refresh }: { data: RecoveryData; businessName: string; refresh: () => void }) {
  const toast = useToast();
  const [showClosed, setShowClosed] = useState(false);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [picking, setPicking] = useState<RecoveryItem | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Pending | null>(null);

  const issue = async (r: RecoveryItem, cardId?: string, identityVerified = false) => {
    // Tarjeta elegida a mano o contacto distinto al registrado: primero, confirmación de identidad en persona.
    if (!identityVerified && (cardId || (r.match && !r.match.contactMatches))) { setPicking(null); setConfirming({ item: r, cardId }); return; }
    setBusy(r.id);
    try {
      const body: Record<string, unknown> = {};
      if (cardId) body.cardId = cardId;
      if (identityVerified) body.identityVerified = true;
      const out = await api<Omit<Issued, 'requestId'>>('POST', `/owner/recovery/${r.id}/link`, body);
      setIssued({ ...out, requestId: r.id });
      setPicking(null); setConfirming(null);
      refresh();
    } catch (e) {
      const err = e as ApiError;
      if (err.code === 'identity_check_required') { setPicking(null); setConfirming({ item: r, cardId }); }
      else toast('bad', err.message);
    } finally { setBusy(null); }
  };
  const close = async (id: string, resolution: 'link_sent' | 'in_person' | 'not_customer' | 'spam') => {
    setBusy(id);
    try { await api('POST', `/owner/recovery/${id}/close`, { resolution }); toast('good', resolution === 'link_sent' || resolution === 'in_person' ? 'Solicitud resuelta.' : 'Solicitud descartada.'); refresh(); }
    catch (e) { toast('bad', (e as ApiError).message); } finally { setBusy(null); }
  };

  const open = data.requests.filter((r) => r.status === 'pending' || r.status === 'link_issued');
  const closed = data.requests.filter((r) => !(r.status === 'pending' || r.status === 'link_issued'));

  return (
    <section className="panel overflow-hidden" data-testid="recovery-inbox" aria-labelledby="recovery-title">
      <header className="px-4 sm:px-5 py-3.5 border-b border-line flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="recovery-title" className="text-[15px] font-semibold text-ink inline-flex items-center gap-2"><KeyRound size={16} /> Clientes que perdieron su acceso {data.pending > 0 && <Badge tone="warn">{data.pending} pendiente{data.pending === 1 ? '' : 's'}</Badge>}</h2>
          <p className="text-[12.5px] text-slate2">Llegan desde «Perdí mi acceso» en la tarjeta. Verifica que sea tu cliente antes de enviar un enlace.</p>
        </div>
      </header>
      {(data.dropped24h ?? 0) > 0 && (
        <p className="px-4 sm:px-5 py-2.5 text-[12.5px] bg-[#FEF3F2] text-[#B42318] border-b border-line" data-testid="recovery-dropped" role="status">
          <AlertTriangle size={13} className="inline -mt-0.5 mr-1" />
          En las últimas 24 h se descartaron {data.dropped24h} solicitud{data.dropped24h === 1 ? '' : 'es'} porque la bandeja estaba llena (posible abuso). Cierra las que no sean de tus clientes; si un cliente real no aparece, atiéndelo en caja.
        </p>
      )}
      {open.length === 0 ? (
        <p className="px-4 sm:px-5 py-5 text-[13px] text-slate2" data-testid="recovery-empty">No hay solicitudes pendientes.</p>
      ) : (
        <ul className="divide-y divide-line">
          {open.map((r) => (
            <li key={r.id} className="px-4 sm:px-5 py-3.5 flex flex-col gap-2.5" data-testid="recovery-item">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[14px] text-ink font-medium inline-flex items-center gap-1.5 flex-wrap">
                    {r.contactType === 'whatsapp' ? <Phone size={14} /> : <Mail size={14} />}
                    <span className="break-all" data-testid="recovery-contact">{fmtContact(r.contact, r.contactType)}</span>
                    {r.nameHint && <span className="text-slate2 font-normal">· {r.nameHint}</span>}
                    <Badge tone={STATUS[r.status][1]}>{STATUS[r.status][0]}</Badge>
                  </div>
                  <div className="text-[12px] text-slate2 mt-0.5">{relativeTime(r.lastRequestedAt)}{r.requestCount > 1 ? ` · lo pidió ${r.requestCount} veces` : ''}</div>
                </div>
              </div>
              {r.match ? (
                <div className={cx('rounded-lg px-3 py-2 text-[12.5px]', r.match.contactMatches ? 'bg-[#F6FEF9] text-[#067647]' : 'bg-[#FFFAEB] text-[#B54708]')} data-testid="recovery-match">
                  {r.match.contactMatches ? <Check size={13} className="inline -mt-0.5 mr-1" /> : <AlertTriangle size={13} className="inline -mt-0.5 mr-1" />}
                  Tarjeta <span className="font-mono">{r.match.publicCode}</span> de <strong>{r.match.customerName}</strong>{r.match.contactMatches ? ' · el contacto coincide con su registro.' : ' · el contacto NO coincide: verifica en persona.'}
                </div>
              ) : (
                <div className="rounded-lg px-3 py-2 text-[12.5px] bg-[#F6F7F9] text-[#475467]">Ninguna tarjeta tiene registrado este contacto. Si lo reconoces, búscalo por nombre o código.</div>
              )}
              <div className="flex flex-wrap gap-1.5">
                {r.match
                  ? <Button size="sm" onClick={() => issue(r)} disabled={busy === r.id} data-testid="recovery-issue">Generar enlace nuevo</Button>
                  : <Button size="sm" onClick={() => setPicking(r)} disabled={busy === r.id} data-testid="recovery-pick"><Search size={14} /> Buscar su tarjeta</Button>}
                {r.match && <Button size="sm" variant="ghost" onClick={() => setPicking(r)} disabled={busy === r.id}>Elegir otra tarjeta</Button>}
                {r.status === 'link_issued' && <Button size="sm" variant="secondary" onClick={() => close(r.id, 'link_sent')} disabled={busy === r.id} data-testid="recovery-done">Ya se lo envié</Button>}
                <Button size="sm" variant="secondary" onClick={() => close(r.id, 'in_person')} disabled={busy === r.id}>Lo atendí en persona</Button>
                <Button size="sm" variant="ghost" onClick={() => close(r.id, 'not_customer')} disabled={busy === r.id} data-testid="recovery-dismiss"><X size={14} /> No es mi cliente</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {closed.length > 0 && (
        <div className="border-t border-line">
          <button type="button" className="w-full text-left px-4 sm:px-5 py-2.5 text-[12.5px] text-slate2 hover:text-ink" onClick={() => setShowClosed((v) => !v)}>{showClosed ? 'Ocultar' : 'Ver'} historial ({closed.length})</button>
          {showClosed && (
            <ul className="divide-y divide-line">
              {closed.map((r) => (
                <li key={r.id} className="px-4 sm:px-5 py-2 text-[12.5px] text-slate2 flex flex-wrap justify-between gap-2">
                  <span className="break-all">{fmtContact(r.contact, r.contactType)}{r.match ? ` · ${r.match.publicCode}` : ''}</span>
                  <span><Badge tone={STATUS[r.status][1]}>{STATUS[r.status][0]}</Badge> {relativeTime(r.resolvedAt ?? r.lastRequestedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <PickCardModal item={picking} onClose={() => setPicking(null)} onPick={(cardId) => picking && issue(picking, cardId)} />
      <ConfirmIdentityModal pending={confirming} busy={!!busy} onClose={() => setConfirming(null)} onConfirm={() => confirming && issue(confirming.item, confirming.cardId, true)} />
      <IssuedModal issued={issued} businessName={businessName} onClose={() => setIssued(null)} onSent={async () => { if (issued) await close(issued.requestId, 'link_sent'); setIssued(null); }} />
    </section>
  );
}

function PickCardModal({ item, onClose, onPick }: { item: RecoveryItem | null; onClose: () => void; onPick: (cardId: string) => void }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<{ id: string; publicCode: string; customerName: string }[] | null>(null);
  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    try { setRows((await api<{ cards: { id: string; publicCode: string; customerName: string }[] }>('GET', `/staff/cards?q=${encodeURIComponent(q)}`)).cards); } catch { setRows([]); }
  };
  return (
    <Modal open={!!item} onClose={() => { setRows(null); setQ(''); onClose(); }} title="Elegir la tarjeta del cliente" labelledBy="pick-card-title">
      <form onSubmit={search} className="flex gap-2 items-end">
        <div className="flex-1"><Field label="Nombre o código de tarjeta" htmlFor="pick-q"><input id="pick-q" className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder={item?.nameHint ?? 'Ej. Mariana o 7KQ4-M2XA'} /></Field></div>
        <Button type="submit" variant="secondary"><Search size={15} /> Buscar</Button>
      </form>
      <p className="mt-2 text-[12px] text-[#B54708]">Antes de generar el enlace te pediremos confirmar que verificaste la identidad en persona. El enlace se envía al contacto registrado de la tarjeta, nunca al de la solicitud.</p>
      {rows && (rows.length === 0 ? <p className="mt-3 text-[13px] text-slate2">Sin resultados.</p> : (
        <ul className="mt-3 divide-y divide-line border border-line rounded-xl overflow-hidden">
          {rows.map((c) => (
            <li key={c.id} className="px-3 py-2 flex items-center justify-between gap-2">
              <span className="text-[13px] text-ink">{c.customerName} <span className="font-mono text-slate2">{c.publicCode}</span></span>
              <Button size="sm" onClick={() => onPick(c.id)}>Usar esta</Button>
            </li>
          ))}
        </ul>
      ))}
    </Modal>
  );
}

function ConfirmIdentityModal({ pending, busy, onClose, onConfirm }: { pending: Pending | null; busy: boolean; onClose: () => void; onConfirm: () => void }) {
  const [checked, setChecked] = useState(false);
  if (!pending) return null;
  return (
    <Modal open onClose={() => { setChecked(false); onClose(); }} title="Confirma la identidad del cliente" labelledBy="confirm-identity-title">
      <div className="flex flex-col gap-3" data-testid="recovery-confirm">
        <p className="text-[13.5px] text-[#475467]">El contacto que escribió quien pidió el acceso <strong>no coincide</strong> con el registrado en esta tarjeta. Si generas un enlace nuevo, el anterior deja de funcionar en todos los teléfonos del cliente.</p>
        <p className="text-[13px] text-[#B54708]"><AlertTriangle size={13} className="inline -mt-0.5 mr-1" />Hazlo solo con el cliente frente a ti (o si lo reconoces sin duda). El enlace se enviará a su contacto registrado o se lo mostrarás en un QR.</p>
        <label className="flex items-start gap-2 text-[13.5px] text-ink">
          <input type="checkbox" className="mt-1" checked={checked} onChange={(e) => setChecked(e.target.checked)} data-testid="recovery-confirm-check" />
          Verifiqué en persona que es el titular de la tarjeta.
        </label>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={() => { setChecked(false); onClose(); }}>Cancelar</Button>
          <Button disabled={!checked || busy} onClick={() => { setChecked(false); onConfirm(); }} data-testid="recovery-confirm-go">Generar enlace</Button>
        </div>
      </div>
    </Modal>
  );
}

function IssuedModal({ issued, businessName, onClose, onSent }: { issued: Issued | null; businessName: string; onClose: () => void; onSent: () => void }) {
  if (!issued) return null;
  const to = issued.deliverTo;
  const intl = to?.contactType === 'whatsapp' ? mxToIntl(to.contact) : null;
  const text = customerLinkText(businessName, issued.personalLink);
  const wa = intl ? waLink(intl, text) : null;
  const mail = to?.contactType === 'email' ? `mailto:${encodeURIComponent(to.contact)}?subject=${encodeURIComponent(`Tu tarjeta de ${businessName}`)}&body=${encodeURIComponent(text)}` : null;
  return (
    <Modal open onClose={onClose} title="Enlace nuevo listo" labelledBy="issued-title">
      <div className="flex flex-col gap-3" data-testid="recovery-issued">
        <p className="text-[13.5px] text-[#475467]">Para <strong>{issued.card.customerName}</strong> (tarjeta <span className="font-mono">{issued.card.publicCode}</span>). El enlace anterior ya no funciona. Se envía solo al contacto registrado de la tarjeta.</p>
        {!to && <p className="text-[13px] text-[#B54708]" data-testid="recovery-in-person">Este cliente no tiene contacto registrado: entrégale el enlace en persona con el QR.</p>}
        {to && !issued.card.contactMatches && <p className="text-[12.5px] text-[#B54708]">Ojo: no es el contacto que escribió quien lo pidió. Si el cliente cambió de número, entrégalo en persona con el QR.</p>}
        {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 h-11 rounded-xl bg-[#128C7E] text-white text-[14px] font-medium" data-testid="recovery-send-wa"><MessageCircle size={17} /> Enviar por WhatsApp a {fmtContact(to!.contact, 'whatsapp')}</a>}
        {mail && <a href={mail} className="inline-flex items-center justify-center gap-2 h-11 rounded-xl bg-ink text-white text-[14px] font-medium" data-testid="recovery-send-mail"><Mail size={16} /> Enviar por correo</a>}
        <div className="flex flex-col items-center gap-2 rounded-xl border border-line p-3">
          <span className="text-[12px] text-slate2">O que lo escanee aquí mismo</span>
          <QRCode value={issued.personalLink} size={150} label="Código del enlace nuevo de la tarjeta" />
          <span className="text-[11px] font-mono text-slate2 break-all select-all text-center" data-testid="recovery-link">{issued.personalLink}</span>
          <CopyButton text={issued.personalLink} />
        </div>
        <Button variant="secondary" onClick={onSent} data-testid="recovery-mark-sent">Listo, ya se lo envié</Button>
      </div>
    </Modal>
  );
}

/** WhatsApp público del negocio: lo ve el cliente al pedir recuperar su tarjeta. */
export function BusinessWhatsappForm({ value, onSaved }: { value: string | null; onSaved: () => void }) {
  const toast = useToast();
  const [v, setV] = useState(value ?? '');
  const [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try { await api('PUT', '/owner/contact', { whatsapp: v.trim() || null }); toast('good', v.trim() ? 'WhatsApp del negocio guardado.' : 'WhatsApp del negocio quitado.'); onSaved(); }
    catch (err) { toast('bad', (err as ApiError).message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={save} className="panel p-4 sm:p-5 flex flex-col gap-3" data-testid="business-whatsapp">
      <Field label={<span>WhatsApp del negocio para clientes <span className="font-normal text-slate2">(opcional)</span></span>} htmlFor="biz-wa" hint="Aparece al cliente cuando pide recuperar su tarjeta, para que te escriba directo. Es público: usa el número del negocio.">
        <input id="biz-wa" className={inputCls} inputMode="tel" placeholder="722 123 4567" value={v} maxLength={20} onChange={(e) => setV(e.target.value)} />
      </Field>
      <div><Button type="submit" variant="secondary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</Button></div>
    </form>
  );
}
