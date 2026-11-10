// 1.0.x · Ruta dedicada de impresión del cartel del mostrador: /panel/cartel?negocio=<slug>&tam=carta|a5
// Imprime una IMAGEN del cartel a tamaño físico fijo (@page carta o A5, sin márgenes del navegador), así el resultado
// no depende del ancho del teléfono ni del zoom. El PDF y el PNG salen del mismo dibujo (src/lib/poster.ts).
import React, { useEffect, useState } from 'react';
import { ArrowLeft, Download, FileDown, Printer, QrCode } from 'lucide-react';
import { api, BusinessInfo, Program } from '../lib/api';
import { businessQrValue } from '../lib/format';
import { units } from '../lib/vertical';
import { downloadQrPng } from '../lib/qr';
import { POSTER_SIZES, PosterSize, PosterSpec, posterFilename, posterPdfBlob, posterPngBlob, saveBlob } from '../lib/poster';
import { brandVars, ErrorBox, Loading } from '../components/Brand';
import { Button, useToast, cx } from '../components/ui';
import { navigate } from '../lib/router';

export function buildPosterSpec(b: BusinessInfo & { program: Program }): PosterSpec {
  const vars = brandVars(b.primaryColor, b.accentColor, b.cardFinish) as Record<string, string>;
  return {
    name: b.name,
    instruction: 'Escanea y obtén tu tarjeta de recompensas',
    programLine: `${b.program.stampsRequired} ${units(b.program, b.program.stampsRequired)} = ${b.program.rewardDescription.toLowerCase()}`,
    url: businessQrValue(b.slug),
    primary: b.primaryColor,
    onBrand: vars['--cream'] ?? '#F5ECDF',
    logoUrl: b.logoUrl,
  };
}

export const sizeFromParam = (v: string | null): PosterSize => (v === 'a5' ? 'a5' : 'letter');
export const sizeParam = (s: PosterSize) => (s === 'a5' ? 'a5' : 'carta');

/** Botones de descarga reutilizados en el panel y en la ruta de impresión. */
export function PosterDownloads({ spec, slug, size, compact }: { spec: PosterSpec; slug: string; size: PosterSize; compact?: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState<null | 'pdf' | 'png'>(null);
  const run = async (kind: 'pdf' | 'png') => {
    if (busy) return;
    setBusy(kind);
    try {
      const blob = kind === 'pdf' ? await posterPdfBlob(spec, size) : await posterPngBlob(spec, size);
      saveBlob(blob, posterFilename(slug, 'cartel', size, kind));
      toast('good', kind === 'pdf' ? `Cartel ${POSTER_SIZES[size].label} descargado (PDF).` : `Cartel ${POSTER_SIZES[size].label} descargado (PNG).`);
    } catch {
      toast('bad', 'No se pudo generar el archivo. Intenta de nuevo o usa «Descargar QR solo».');
    } finally { setBusy(null); }
  };
  return (
    <div className={cx('flex flex-wrap justify-center gap-2', compact && 'gap-1.5')} data-testid="poster-downloads">
      <Button variant="secondary" size={compact ? 'sm' : 'md'} onClick={() => run('pdf')} disabled={!!busy} data-testid="poster-pdf"><FileDown size={16} /> {busy === 'pdf' ? 'Generando…' : 'Descargar PDF'}</Button>
      <Button variant="secondary" size={compact ? 'sm' : 'md'} onClick={() => run('png')} disabled={!!busy} data-testid="poster-png"><Download size={16} /> {busy === 'png' ? 'Generando…' : 'Descargar PNG'}</Button>
      <Button variant="ghost" size={compact ? 'sm' : 'md'} onClick={() => { downloadQrPng(spec.url, posterFilename(slug, 'qr'), 2048); toast('good', 'QR descargado (PNG, 2048 px).'); }} data-testid="poster-qr-only"><QrCode size={16} /> Descargar QR solo</Button>
    </div>
  );
}

export function SizePicker({ size, onChange }: { size: PosterSize; onChange: (s: PosterSize) => void }) {
  return (
    <div className="inline-grid grid-cols-2 p-0.5 rounded-xl bg-[#F1F3F6] text-[12.5px]" role="radiogroup" aria-label="Tamaño del cartel">
      {(['letter', 'a5'] as const).map((s) => (
        <button key={s} type="button" role="radio" aria-checked={size === s} onClick={() => onChange(s)} data-testid={`poster-size-${sizeParam(s)}`}
          className={cx('h-8 px-4 rounded-[10px] transition', size === s ? 'bg-white shadow-sm text-ink font-medium' : 'text-slate2')}>
          {POSTER_SIZES[s].label}
        </button>
      ))}
    </div>
  );
}

export default function PosterPrintView({ initialSize }: { initialSize: PosterSize }) {
  const [biz, setBiz] = useState<(BusinessInfo & { program: Program }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState<PosterSize>(initialSize);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => { api<BusinessInfo & { program: Program }>('GET', '/staff/business').then(setBiz).catch((e) => setError(e.message)); }, []);

  // Imagen del cartel a 200 ppp: es lo que se imprime.
  useEffect(() => {
    if (!biz) return;
    let url: string | null = null;
    let live = true;
    setSrc(null);
    posterPngBlob(buildPosterSpec(biz), size).then((blob) => {
      url = URL.createObjectURL(blob);
      if (live) setSrc(url); else URL.revokeObjectURL(url);
    }).catch(() => live && setError('No se pudo generar el cartel en este navegador.'));
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [biz, size]);

  // Tamaño de hoja fijo para la impresión (sin márgenes del navegador: el cartel ya trae su margen blanco).
  useEffect(() => {
    const el = document.createElement('style');
    el.setAttribute('data-poster-page', size);
    el.textContent = `@page { size: ${POSTER_SIZES[size].cssPage}; margin: 0; }
@media print { .poster-sheet { width: ${POSTER_SIZES[size].wMm}mm !important; height: ${POSTER_SIZES[size].hMm}mm !important; max-width: none !important; box-shadow: none !important; border: 0 !important; } }`;
    document.head.appendChild(el);
    const u = new URL(location.href);
    u.searchParams.set('tam', sizeParam(size));
    history.replaceState(null, '', u.pathname + u.search);
    return () => el.remove();
  }, [size]);

  if (error) return <div className="mx-auto max-w-[520px] gutter py-10"><ErrorBox message={error} /></div>;
  if (!biz) return <Loading />;
  const spec = buildPosterSpec(biz);
  const back = `/panel?negocio=${encodeURIComponent(biz.slug)}`;
  const ratio = POSTER_SIZES[size].hMm / POSTER_SIZES[size].wMm;

  return (
    <div className="poster-print min-h-full bg-[#EEF0F3]" data-testid="poster-print">
      <div className="no-print sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-line" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="mx-auto max-w-[760px] gutter py-3 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={() => navigate(back)} className="inline-flex items-center gap-1.5 text-[13.5px] text-slate2 hover:text-ink"><ArrowLeft size={16} /> Volver al panel</button>
            <SizePicker size={size} onChange={setSize} />
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button onClick={() => window.print()} disabled={!src} data-testid="poster-print-button"><Printer size={16} /> Imprimir</Button>
            <PosterDownloads spec={spec} slug={biz.slug} size={size} compact />
          </div>
          <p className="text-[12px] text-slate2 text-center leading-snug">Al imprimir elige tamaño <strong>{POSTER_SIZES[size].label}</strong> y escala <strong>100 %</strong> (o «Tamaño real»). Si tu teléfono no imprime bien, descarga el PDF y ábrelo desde tus archivos.</p>
        </div>
      </div>
      <div className="mx-auto max-w-[760px] gutter py-6 flex justify-center">
        {src
          ? <img src={src} alt={`Cartel QR de ${biz.name}, tamaño ${POSTER_SIZES[size].label}`} className="poster-sheet block w-full max-w-[560px] h-auto bg-white shadow-xl border border-line" style={{ aspectRatio: `1 / ${ratio}` }} data-testid="poster-image" />
          : <div className="w-full max-w-[560px] bg-white border border-line animate-pulse" style={{ aspectRatio: `1 / ${ratio}` }} />}
      </div>
    </div>
  );
}
