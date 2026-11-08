// 1.0.x · «Reportar problema» para el dueño: 1 toque abre, 1 toque envía por WhatsApp a soporte VLUX con el contexto
// ya escrito (negocio, vista, fecha, usuario/rol, dispositivo, versión). Además deja el reporte en la bitácora del
// negocio con la misma referencia, para que VLUX lo encuentre aunque el mensaje no llegue.
import React, { useEffect, useMemo, useState } from 'react';
import { Bug, Copy, MessageCircle } from 'lucide-react';
import { api } from '../lib/api';
import { VLUX_SUPPORT_DISPLAY, VLUX_SUPPORT_WHATSAPP, deviceSummary, formatReportDate, newSupportRef, reportText, roleLabel, waLink } from '../lib/support';
import { Button, Field, Modal, inputCls, useToast, copyText } from './ui';

declare const __APP_VERSION__: string | undefined;
const appVersion = () => (typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'desconocida');

type Me = { session: { displayName: string; role: 'OWNER' | 'EMPLOYEE' } | null };

/** Registra el reporte sin bloquear la apertura de WhatsApp (keepalive: sobrevive al cambio de app). */
function record(body: Record<string, unknown>) {
  try {
    void fetch('/api/staff/support-report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin', keepalive: true }).catch(() => undefined);
  } catch { /* sin red: el WhatsApp ya lleva todo el contexto */ }
}

export function ReportProblemButton({ businessName, slug, view, className }: { businessName: string; slug: string; view: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} data-testid="report-open"
        className={className ?? 'inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-line bg-white text-[13px] font-medium text-ink hover:bg-[#F6F7F9]'}>
        <Bug size={15} /> Reportar problema
      </button>
      {open && <ReportProblemModal businessName={businessName} slug={slug} view={view} onClose={() => setOpen(false)} />}
    </>
  );
}

function ReportProblemModal({ businessName, slug, view, onClose }: { businessName: string; slug: string; view: string; onClose: () => void }) {
  const toast = useToast();
  const [me, setMe] = useState<Me['session']>(null);
  const [description, setDescription] = useState('');
  const ref = useMemo(() => newSupportRef(), []);
  const at = useMemo(() => new Date(), []);
  const device = useMemo(() => deviceSummary(navigator.userAgent, window.screen?.width, window.screen?.height), []);
  useEffect(() => { api<Me>('GET', '/staff/me').then((r) => setMe(r.session)).catch(() => undefined); }, []);

  const ctx = { ref, businessName, slug, view, role: me?.role ?? 'OWNER' as const, userName: me?.displayName ?? '—', at, device, appVersion: appVersion(), description };
  const text = reportText(ctx);
  const wa = waLink(VLUX_SUPPORT_WHATSAPP, text);
  const body = (channel: 'whatsapp' | 'copy') => ({ ref, view, description: description.slice(0, 1000), device, appVersion: ctx.appVersion, channel });

  return (
    <Modal open onClose={onClose} title="Reportar un problema a VLUX" labelledBy="report-title">
      <div className="flex flex-col gap-4" data-testid="report-modal">
        <Field label="¿Qué pasó?" htmlFor="report-desc" hint="Ej. «No se imprime el QR desde mi celular». Puedes enviarlo vacío y escribir en WhatsApp.">
          <textarea id="report-desc" className={inputCls + ' min-h-[96px] py-2'} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <dl className="rounded-xl bg-[#F6F7F9] px-3.5 py-3 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-[12.5px]" data-testid="report-context">
          <dt className="text-slate2">Negocio</dt><dd className="text-ink break-words">{businessName} <span className="text-slate2">({slug})</span></dd>
          <dt className="text-slate2">Vista</dt><dd className="text-ink">{view}</dd>
          <dt className="text-slate2">Fecha</dt><dd className="text-ink">{formatReportDate(at)}</dd>
          <dt className="text-slate2">Usuario</dt><dd className="text-ink">{me ? `${me.displayName} · ${roleLabel(me.role)}` : '…'}</dd>
          <dt className="text-slate2">Dispositivo</dt><dd className="text-ink break-words">{device}</dd>
          <dt className="text-slate2">Referencia</dt><dd className="text-ink font-mono" data-testid="report-ref">{ref}</dd>
        </dl>
        <a href={wa} target="_blank" rel="noopener noreferrer" data-testid="report-wa" onClick={() => { record(body('whatsapp')); setTimeout(onClose, 300); }}
          className="inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-[#128C7E] text-white text-[15px] font-medium">
          <MessageCircle size={18} /> Enviar por WhatsApp a soporte VLUX
        </a>
        <div className="flex items-center justify-between gap-2 text-[12px] text-slate2">
          <span>Soporte VLUX: {VLUX_SUPPORT_DISPLAY}</span>
          <Button size="sm" variant="ghost" onClick={async () => { const okc = await copyText(text); record(body('copy')); toast(okc ? 'good' : 'bad', okc ? 'Reporte copiado. Pégalo donde prefieras.' : 'No se pudo copiar.'); }} data-testid="report-copy"><Copy size={14} /> Copiar reporte</Button>
        </div>
      </div>
    </Modal>
  );
}
