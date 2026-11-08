// 1.0.x · Ayuda en las vistas del cliente:
//   · RecoverScreen: «Perdí mi acceso». Manda una solicitud al negocio sin revelar si la tarjeta existe.
//   · VluxHelp: bloque discreto con soporte por WhatsApp de VLUX y «Conocer VLUX Loyalty».
import React, { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, ExternalLink, KeyRound, LifeBuoy, MessageCircle, ShieldCheck, Store } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { VLUX_LANDING_URL, businessRecoveryText, mxToIntl, vluxSupportLink, waLink } from '../lib/support';
import { Button, Field, inputCls, VluxMark, cx } from './ui';

type Help = { recovery: boolean; businessWhatsapp: string | null };

export function useBusinessHelp(slug: string) {
  const [help, setHelp] = useState<Help | null>(null);
  useEffect(() => { api<Help>('GET', `/public/businesses/${slug}/help`).then(setHelp).catch(() => setHelp({ recovery: false, businessWhatsapp: null })); }, [slug]);
  return help;
}

/** Enlace visible para iniciar la recuperación (bienvenida y app instalada). */
export function RecoverLink({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick} data-testid="recover-open"
      className={cx('inline-flex items-center justify-center gap-1.5 text-[13px] font-medium text-cafe-ink underline underline-offset-4 decoration-cafe-line hover:decoration-cafe-ink', className)}>
      <KeyRound size={14} /> Perdí mi acceso · Recuperar mi tarjeta
    </button>
  );
}

export function RecoverScreen({ slug, businessName, onBack }: { slug: string; businessName: string; onBack: () => void }) {
  const help = useBusinessHelp(slug);
  const [contact, setContact] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<null | { businessWhatsapp: string | null }>(null);
  const [offline, setOffline] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const r = await api<{ ok: true; businessWhatsapp: string | null }>('POST', `/public/businesses/${slug}/recovery`, { contact, name });
      setSent({ businessWhatsapp: r.businessWhatsapp });
    } catch (err) {
      const e2 = err as ApiError;
      if (e2.code === 'recovery_unavailable') setOffline(true);
      else setError(e2.message || 'No se pudo enviar. Intenta de nuevo.');
    } finally { setBusy(false); }
  };

  const bizWa = mxToIntl(sent?.businessWhatsapp ?? help?.businessWhatsapp ?? null);
  const waBusiness = bizWa ? waLink(bizWa, businessRecoveryText(businessName, name.trim() || undefined)) : null;

  return (
    <div className="screen-in pt-6 sm:pt-10 flex flex-col gap-5" data-testid="recover-screen">
      <button type="button" onClick={onBack} className="self-start inline-flex items-center gap-1 text-[13px] text-cafe-muted hover:text-cafe-ink"><ArrowLeft size={14} /> Regresar</button>
      {sent ? (
        <section className="rounded-2xl bg-white border border-cafe-line p-5 flex flex-col gap-3" data-testid="recover-sent" role="status">
          <div className="flex items-center gap-2 text-[16px] font-semibold text-cafe-ink"><CheckCircle2 size={20} className="text-[#12B76A]" /> Tu solicitud fue enviada a {businessName}</div>
          <p className="text-[13.5px] text-cafe-body leading-relaxed">Si tus datos coinciden con una tarjeta, el negocio te enviará un <strong>enlace nuevo</strong> o te ayudará en caja. Por seguridad no te confirmamos aquí si encontramos tu tarjeta.</p>
          <p className="text-[12.5px] text-cafe-muted leading-snug">¿Estás en el negocio? Pide en caja que te generen tu enlace nuevo: es inmediato.</p>
          {waBusiness && (
            <a href={waBusiness} target="_blank" rel="noopener noreferrer" data-testid="recover-wa-business"
              className="inline-flex items-center justify-center gap-2 h-11 rounded-xl bg-[#128C7E] text-white text-[14px] font-medium">
              <MessageCircle size={17} /> Escribir a {businessName} por WhatsApp
            </a>
          )}
        </section>
      ) : offline ? (
        <section className="rounded-2xl bg-white border border-cafe-line p-5 flex flex-col gap-3" data-testid="recover-offline" role="status">
          <div className="flex items-center gap-2 text-[16px] font-semibold text-cafe-ink"><Store size={18} /> Pídelo en caja</div>
          <p className="text-[13.5px] text-cafe-body leading-relaxed">La recuperación en línea aún no está activa en {businessName}. En caja pueden darte un enlace nuevo en un momento con el código de tu tarjeta o tu nombre.</p>
          <a href={vluxSupportLink(businessName)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 h-11 rounded-xl border border-cafe-line text-[14px] font-medium text-cafe-ink"><MessageCircle size={16} /> Pedir ayuda a soporte VLUX</a>
        </section>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
          <div>
            <h1 className="font-display text-[26px] leading-tight text-cafe-ink">Recuperar mi tarjeta</h1>
            <p className="mt-1.5 text-[14px] text-cafe-body leading-snug">Escribe el WhatsApp o correo con el que te registraste en {businessName}. El negocio recibirá tu solicitud.</p>
          </div>
          <div className="rounded-2xl bg-white border border-cafe-line p-4 sm:p-5 flex flex-col gap-4">
            <Field label="WhatsApp o correo con el que te registraste" htmlFor="rec-contact">
              <input id="rec-contact" className={inputCls} autoComplete="off" inputMode="email" placeholder="722 123 4567 o tu@correo.com" value={contact} maxLength={120} onChange={(e) => setContact(e.target.value)} />
            </Field>
            <Field label={<span>Tu nombre <span className="font-normal text-slate2">(opcional)</span></span>} htmlFor="rec-name" hint="Ayuda al negocio a reconocerte si no registraste contacto.">
              <input id="rec-name" className={inputCls} autoComplete="given-name" placeholder="Ej. Mariana" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
            </Field>
          </div>
          <p className="text-[12px] text-cafe-muted leading-snug inline-flex gap-2"><ShieldCheck size={15} className="shrink-0 mt-px" /> Por tu seguridad, aquí no mostramos si existe una tarjeta con esos datos. Solo el negocio puede darte un enlace nuevo, y el anterior deja de funcionar.</p>
          {error && <p className="text-[13px] text-[#B42318]" role="alert">{error}</p>}
          <Button variant="brand" size="lg" type="submit" disabled={busy || contact.trim().length < 3} data-testid="recover-submit">{busy ? 'Enviando…' : 'Enviar solicitud al negocio'}</Button>
          <p className="text-[12.5px] text-cafe-muted text-center">¿Estás en el negocio? En caja pueden darte tu enlace nuevo al momento.</p>
        </form>
      )}
    </div>
  );
}

/** Bloque de ayuda de VLUX para el cliente: discreto, al final de la pantalla. */
export function VluxHelp({ businessName }: { businessName: string }) {
  return (
    <section className="rounded-2xl border border-cafe-line bg-white/60 px-4 py-3.5 flex flex-col gap-2.5" aria-label="Ayuda y soporte" data-testid="vlux-help">
      <div className="flex items-center gap-2 text-[13px] font-medium text-cafe-ink"><LifeBuoy size={15} /> ¿Necesitas ayuda con tu tarjeta?</div>
      <div className="grid grid-cols-2 gap-2">
        <a href={vluxSupportLink(businessName)} target="_blank" rel="noopener noreferrer" data-testid="vlux-help-wa"
          className="inline-flex items-center justify-center gap-1.5 h-10 rounded-xl border border-cafe-line bg-white text-[12.5px] font-medium text-cafe-ink hover:bg-cafe-cream/60">
          <MessageCircle size={15} /> Soporte por WhatsApp
        </a>
        <a href={VLUX_LANDING_URL} target="_blank" rel="noopener" data-testid="vlux-help-landing"
          className="inline-flex items-center justify-center gap-1.5 h-10 rounded-xl border border-cafe-line bg-white text-[12.5px] font-medium text-cafe-ink hover:bg-cafe-cream/60">
          Conocer VLUX Loyalty <ExternalLink size={13} />
        </a>
      </div>
      <div className="flex items-center justify-center gap-1.5 text-[11px] tracking-wide text-[#98A2B3]"><span>Powered by</span><VluxMark className="text-[#475467]" /></div>
    </section>
  );
}
