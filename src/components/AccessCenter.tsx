// V0.4 · Accesos del negocio: qué enlace y qué QR usa cada persona (cliente, caja, dueño),
// con copiar, compartir, abrir y descargar. Los enlaces son direcciones: no llevan credenciales.
import React from 'react';
import { Users, ScanLine, LayoutDashboard, ExternalLink, Share2, Download, Printer } from 'lucide-react';
import { QRCode, CopyButton, Button, useToast, cx } from './ui';
import { downloadQrPng } from '../lib/qr';
import { InstallAppButton } from './InstallApp';

export interface Links { customerUrl: string; cashierUrl: string; ownerUrl: string }

function AccessCard({ icon, tone, title, who, what, url, qrLabel, filename, extra, testid }: {
  icon: React.ReactNode; tone: string; title: string; who: string; what: string; url: string; qrLabel: string; filename: string; extra?: React.ReactNode; testid: string;
}) {
  const toast = useToast();
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const share = async () => {
    try { await navigator.share({ title, text: what, url }); } catch { /* canceló */ }
  };
  return (
    <article className="panel p-5 flex flex-col gap-4 access-card" data-testid={testid}>
      <header className="flex items-start gap-3">
        <span className={cx('h-10 w-10 shrink-0 rounded-xl inline-flex items-center justify-center', tone)}>{icon}</span>
        <div className="min-w-0">
          <h3 className="text-[16px] font-semibold text-ink leading-tight">{title}</h3>
          <div className="text-[12px] uppercase tracking-[0.12em] text-slate2 mt-0.5">{who}</div>
        </div>
      </header>
      <p className="text-[13.5px] text-[#475467] leading-snug">{what}</p>
      <div className="flex items-center gap-4">
        <div className="shrink-0 rounded-xl border border-line p-1.5 bg-white access-qr"><QRCode value={url} size={104} label={qrLabel} /></div>
        <div className="min-w-0 flex-1 flex flex-wrap gap-1.5 content-center">
          <CopyButton text={url} className="border border-line bg-white" />
          {canShare && <button type="button" onClick={share} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 h-8 text-[12.5px] font-medium border border-line bg-white text-slate2 hover:text-ink"><Share2 size={14} /> Compartir</button>}
          <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg px-2.5 h-8 text-[12.5px] font-medium border border-line bg-white text-slate2 hover:text-ink"><ExternalLink size={14} /> Abrir</a>
          <button type="button" onClick={() => { downloadQrPng(url, filename); toast('good', 'QR descargado (PNG).'); }} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 h-8 text-[12.5px] font-medium border border-line bg-white text-slate2 hover:text-ink"><Download size={14} /> Descargar QR</button>
        </div>
      </div>
      <div className="text-[12px] font-mono text-ink break-all select-all rounded-lg bg-[#F6F7F9] px-2.5 py-2" data-testid={`${testid}-url`}>{url}</div>
      {extra}
    </article>
  );
}

export function AccessCenter({ businessName, slug, links }: { businessName: string; slug: string; links: Links }) {
  return (
    <section className="flex flex-col gap-4" aria-label="Accesos del negocio">
      <div>
        <h2 className="text-[18px] font-semibold text-ink">Accesos de {businessName}</h2>
        <p className="text-[13.5px] text-slate2 mt-0.5">Tres direcciones, tres personas distintas. Cada una solo ve lo suyo.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <AccessCard
          testid="access-customer" icon={<Users size={19} />} tone="bg-[#ECFDF3] text-[#067647]"
          title="Clientes" who="Pública · sin contraseña"
          what="Pon este QR en el mostrador, la mesa o el ticket. Tus clientes lo escanean, crean su tarjeta en menos de un minuto y la guardan en su teléfono."
          url={links.customerUrl} qrLabel={`QR de registro de clientes de ${businessName}`} filename={`${slug}-clientes.png`}
        />
        <AccessCard
          testid="access-cashier" icon={<ScanLine size={19} />} tone="bg-[#EEF4FF] text-[#3538CD]"
          title="Caja" who="Tu equipo · con contraseña"
          what="Úsalo en el celular o tablet de caja para escanear tarjetas y registrar visitas. Pide correo y contraseña del empleado."
          url={links.cashierUrl} qrLabel={`QR de caja de ${businessName}`} filename={`${slug}-caja.png`}
          extra={<InstallAppButton app="caja" label="Agregar caja a este teléfono" />}
        />
        <AccessCard
          testid="access-owner" icon={<LayoutDashboard size={19} />} tone="bg-[#FEF6EE] text-[#B93815]"
          title="Dueño" who="Solo tú · con contraseña"
          what="Revisa clientes, métricas y configura tu programa. No lo compartas con tu equipo: ellos usan el de Caja."
          url={links.ownerUrl} qrLabel={`QR del panel de ${businessName}`} filename={`${slug}-panel.png`}
          extra={<InstallAppButton app="panel" label="Agregar panel a mi teléfono" />}
        />
      </div>
      <div className="rounded-xl bg-[#F6F7F9] px-4 py-3 text-[12.5px] text-[#475467] leading-snug">
        Los botones <strong>Agregar a mi teléfono</strong> crean un acceso directo en este teléfono. Para tu equipo, abre el enlace de Caja en su teléfono y repite el paso allí.
        <Button variant="ghost" size="sm" className="ml-2 align-middle" onClick={() => window.print()}><Printer size={14} /> Imprimir esta página</Button>
      </div>
    </section>
  );
}
