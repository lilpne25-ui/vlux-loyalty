// V0.4.3 · Controles del Intelligent Logo Engine y comparativas del Estudio de marca.
import { RotateCcw, Eraser, Undo2 } from 'lucide-react';
import { CButton, cx } from './kit';
import { LoyaltyCardFace } from '../components/LoyaltyCard';
import { brandVars } from '../components/Brand';
import { FINISHES, type CardFinish } from '../lib/finish';
import { defaultFit, fitKind, type LogoAnalysis, type LogoFit, type PlateVariant } from '../lib/logoFit';

const KIND_ES = { horizontal: 'horizontal', square: 'cuadrado', vertical: 'vertical' } as const;

export function describeAnalysis(a: LogoAnalysis): string {
  const parts: string[] = [`Logo ${KIND_ES[a.kind]}`];
  if (a.hasAlpha) parts.push('con transparencia');
  if (a.bg) parts.push(`fondo ${a.plate === 'light' ? 'claro' : 'oscuro'} uniforme`);
  if (a.marginFraction > 0.15) parts.push(`márgenes recortados (${Math.round(a.marginFraction * 100)}%)`);
  return parts.join(' · ');
}

export function LogoControls({ fit, analysis, canRemoveBg, bgRemoved, onChange, onReset, onRemoveBg, onRestoreBg }: {
  fit: LogoFit; analysis: LogoAnalysis | null; canRemoveBg: boolean; bgRemoved: boolean;
  onChange: (f: LogoFit) => void; onReset: () => void; onRemoveBg: () => void; onRestoreBg: () => void;
}) {
  const set = (p: Partial<LogoFit>) => onChange({ ...fit, ...p });
  const plates: { id: PlateVariant; label: string }[] = [{ id: 'light', label: 'Base clara' }, { id: 'dark', label: 'Base oscura' }, { id: 'none', label: 'Sin base' }];
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/10 p-3.5" data-testid="logo-controls" aria-label="Ajuste del logotipo">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[13px] font-medium">Ajuste automático del logo</div>
          {analysis && <p className="text-[12px] cc-muted mt-0.5" data-testid="logo-analysis">{describeAnalysis(analysis)}</p>}
        </div>
        <CButton type="button" small variant="ghost" onClick={onReset} data-testid="logo-reset"><RotateCcw size={13} /> Restaurar</CButton>
      </div>
      <label className="text-[12px] cc-muted">Tamaño ({Math.round(fit.scale * 100)}%)
        <input type="range" min={0.5} max={1.6} step={0.05} value={fit.scale} onChange={(e) => set({ scale: Number(e.target.value) })} data-testid="logo-scale" className="w-full" /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-[12px] cc-muted">Posición horizontal
          <input type="range" min={-0.3} max={0.3} step={0.01} value={fit.dx} onChange={(e) => set({ dx: Number(e.target.value) })} data-testid="logo-dx" className="w-full" /></label>
        <label className="text-[12px] cc-muted">Posición vertical
          <input type="range" min={-0.3} max={0.3} step={0.01} value={fit.dy} onChange={(e) => set({ dy: Number(e.target.value) })} data-testid="logo-dy" className="w-full" /></label>
      </div>
      <label className="text-[12px] cc-muted">Espacio alrededor ({Math.round(fit.pad * 100)}%)
        <input type="range" min={0} max={0.3} step={0.01} value={fit.pad} onChange={(e) => set({ pad: Number(e.target.value) })} data-testid="logo-pad" className="w-full" /></label>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Alineación">
        {(['center', 'left'] as const).map((al) => (
          <button key={al} type="button" role="radio" aria-checked={fit.align === al} onClick={() => set({ align: al })} data-testid={`logo-align-${al}`} className={cx('studio-chip text-[12px] px-2 py-1.5 rounded-lg border', fit.align === al ? 'border-[var(--cc-cyan)] bg-white/10' : 'border-white/10')}>{al === 'center' ? 'Centrado' : 'Izquierda'}</button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Base del logo">
        {plates.map((p) => (
          <button key={p.id} type="button" role="radio" aria-checked={fit.plate === p.id} onClick={() => set({ plate: p.id })} data-testid={`logo-plate-${p.id}`} className={cx('studio-chip text-[12px] px-1.5 py-1.5 rounded-lg border', fit.plate === p.id ? 'border-[var(--cc-cyan)] bg-white/10' : 'border-white/10')}>{p.label}</button>
        ))}
      </div>
      {(canRemoveBg || bgRemoved) && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12px] cc-muted">{bgRemoved ? 'Fondo quitado (puedes volver al original).' : 'Detectamos un fondo sólido; quitarlo es opcional.'}</p>
          {bgRemoved
            ? <CButton type="button" small variant="ghost" onClick={onRestoreBg} data-testid="logo-restore-bg"><Undo2 size={13} /> Original</CButton>
            : <CButton type="button" small onClick={onRemoveBg} data-testid="logo-remove-bg"><Eraser size={13} /> Quitar fondo</CButton>}
        </div>
      )}
    </div>
  );
}

type CardBrand = { name: string; logo: string | null; fit?: LogoFit | null; primary: string; accent: string; stamps: number; filled: number; reward: string };

/** Los tres acabados con el mismo logo, lado a lado. Tocar uno lo elige. */
export function FinishCompare({ b, current, onPick }: { b: CardBrand; current: CardFinish; onPick: (f: CardFinish) => void }) {
  return (
    <div className="grid gap-4 md:grid-cols-3" data-testid="finish-compare">
      {FINISHES.map((f) => (
        <button key={f.id} type="button" onClick={() => onPick(f.id)} aria-pressed={current === f.id} data-testid={`compare-${f.id}`}
          className={cx('text-left rounded-2xl p-3 border transition', current === f.id ? 'border-[var(--cc-cyan)] bg-white/[.04]' : 'border-white/10 hover:border-white/30')}>
          <div style={brandVars(b.primary, b.accent, f.id)}>
            <LoyaltyCardFace compact businessName={b.name.trim() || 'Tu negocio'} customerName="Mariana López" cardId="VX-4F7K-92" total={b.stamps} filled={b.filled} logoUrl={b.logo} logoFit={b.fit} footer={<span className="opacity-70">{f.label}</span>} interactive={false} />
          </div>
          <div className="mt-2.5 text-[13px] font-medium">{f.label}</div>
          <div className="text-[12px] cc-muted">{f.hint}</div>
        </button>
      ))}
    </div>
  );
}

/** Antes de personalizar → después de subir el logo. */
export function BeforeAfter({ b }: { b: CardBrand & { finish?: CardFinish } }) {
  return (
    <div className="grid gap-5 md:grid-cols-[1fr_auto_1fr] items-center" data-testid="before-after">
      <figure className="m-0">
        <div style={brandVars('#14171C', '#67C7D3', b.finish ?? 'silver')}><LoyaltyCardFace compact businessName="Tu negocio" customerName="Mariana López" cardId="VX-4F7K-92" total={b.stamps} filled={b.filled} footer={<span className="opacity-70">Antes</span>} interactive={false} /></div>
        <figcaption className="mt-2 text-[12px] cc-muted text-center">Antes de personalizar</figcaption>
      </figure>
      <div className="hidden md:block text-[22px] cc-muted" aria-hidden="true">→</div>
      <figure className="m-0">
        <div style={brandVars(b.primary, b.accent, b.finish ?? 'silver')} data-testid="after-card"><LoyaltyCardFace compact businessName={b.name.trim() || 'Tu negocio'} customerName="Mariana López" cardId="VX-4F7K-92" total={b.stamps} filled={b.filled} logoUrl={b.logo} logoFit={b.fit} footer={<span className="opacity-70">Después</span>} interactive={false} /></div>
        <figcaption className="mt-2 text-[12px] cc-muted text-center">Con tu logo y tus colores</figcaption>
      </figure>
    </div>
  );
}

export { defaultFit, fitKind };
