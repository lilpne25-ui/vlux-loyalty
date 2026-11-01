// Tarjeta de sellos: misma pieza para cliente, caja, panel, Estudio de marca y presentación comercial.
// V0.4: acabado metálico premium. Capas (de abajo hacia arriba):
//   base con el color del negocio → cepillado fino → brillo especular que sigue al dedo/ratón →
//   borde pulido (bisel) → contenido grabado. Inclinación 3D suave con el puntero; respeta
//   "reducir movimiento". Todo es CSS: sin imágenes ni librerías, se ve igual instalada como app.
import React, { useCallback, useEffect, useRef } from 'react';
import { useState } from 'react';
import { BusinessLogo, cx } from './ui';
import { legacyFit, placeLogo, type LogoFit } from '../lib/logoFit';

export function StampGrid({ total, filled, animateFrom, size = 'md', onBrand = true }: { total: number; filled: number; animateFrom?: number | null; size?: 'sm' | 'md'; onBrand?: boolean }) {
  const cols = total <= 5 ? total : total <= 10 ? Math.ceil(total / 2) : Math.ceil(total / 3);
  const dim = size === 'sm' ? 'h-6 w-6' : 'h-[34px] w-[34px] sm:h-9 sm:w-9';
  return (
    <div className="grid gap-2.5 sm:gap-3 justify-start" style={{ gridTemplateColumns: `repeat(${cols}, max-content)` }} role="img" aria-label={`${filled} de ${total} sellos`}>
      {Array.from({ length: total }).map((_, i) => {
        const isFilled = i < filled;
        const isNew = isFilled && animateFrom != null && i >= animateFrom;
        const delay = isNew ? `${(i - (animateFrom || 0)) * 140 + 250}ms` : undefined;
        return (
          <span
            key={i}
            className={cx('relative inline-flex items-center justify-center rounded-full', dim, isFilled ? 'stamp-coin' : onBrand ? 'stamp-slot' : 'stamp-slot-light', isNew && 'stamp-new')}
            style={{ animationDelay: delay }}
          >
            {isFilled ? (
              <svg viewBox="0 0 24 24" className={cx('relative', size === 'sm' ? 'w-3 h-3' : 'w-4 h-4')} aria-hidden="true">
                <g transform="translate(12 12) rotate(-30)" className="mark-bean">
                  <ellipse rx="5" ry="7.2" fill="var(--c-stamp-ink, var(--brand))" opacity=".88" />
                  <path d="M0 -6.6 C -2.4 -2.2, 2.4 2.2, 0 6.6" stroke="var(--c-detail, var(--accent))" strokeWidth="1.3" fill="none" />
                </g>
                <path className="mark-generic" transform="translate(12 12)" d="M-5 0.5 L-1.6 4 L5.5 -3.5" stroke="var(--c-stamp-ink, var(--brand))" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
            ) : (
              <span className={cx('text-[10px] tabular-nums', onBrand ? 'card-ink2' : 'text-[#98A2B3]')}>{i + 1}</span>
            )}
            {isNew && <span className="stamp-ring absolute inset-0 rounded-full" style={{ animationDelay: delay }} />}
          </span>
        );
      })}
    </div>
  );
}

/** Inclinación 3D y reflejo que siguen al puntero. Escribe variables CSS (sin re-render de React). */
export function useTilt<T extends HTMLElement>(enabled = true) {
  const ref = useRef<T | null>(null);
  const frame = useRef(0);
  const set = useCallback((x: number, y: number) => {
    const el = ref.current;
    if (!el) return;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
      el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
      el.style.setProperty('--rx', `${((0.5 - y) * 5).toFixed(2)}deg`);
      el.style.setProperty('--ry', `${((x - 0.5) * 7).toFixed(2)}deg`);
      // La sombra se desplaza en sentido contrario a la luz (que sigue al puntero): profundidad coherente con el reflejo.
      el.style.setProperty('--sx', `${((0.5 - x) * 14).toFixed(1)}px`);
      el.style.setProperty('--sy', `${((0.5 - y) * 6).toFixed(1)}px`);
    });
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      set(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)));
      el.dataset.tilting = '1';
    };
    const leave = () => { delete el.dataset.tilting; set(0.5, 0.5); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    el.addEventListener('pointercancel', leave);
    return () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave); el.removeEventListener('pointercancel', leave); cancelAnimationFrame(frame.current); };
  }, [enabled, set]);
  return ref;
}

/** Placa del logotipo: aplica el ajuste del motor de logos (contain, sin deformar ni recortar) sobre una base pulida. */
export function LogoPlate({ name, src, fit, compact, className }: { name: string; src?: string | null; fit?: LogoFit | null; compact?: boolean; className?: string }) {
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [broken, setBroken] = useState(false);
  const k = compact ? 0.85 : 1;
  if (!src || broken) {
    const d = Math.round(46 * k);
    return <span className={cx('logo-plate', className)} data-plate="none" style={{ width: d + 5, height: d + 5 }}><BusinessLogo name={name} size={d} src={null} /></span>;
  }
  const f = fit ?? (nat ? legacyFit(nat.w, nat.h) : null);
  if (!f) {
    // Logo antiguo sin ajuste: se mide una vez para respetar su proporción real.
    return (
      <span className={cx('logo-plate', className)} data-plate="light" style={{ width: Math.round(52 * k) + 5, height: Math.round(52 * k) + 5 }}>
        <span className="logo-plate-in block" style={{ width: Math.round(52 * k), height: Math.round(52 * k) }}>
          <img src={src} alt="" onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth || 1, h: e.currentTarget.naturalHeight || 1 })} onError={() => setBroken(true)} style={{ opacity: 0, width: 1, height: 1 }} />
        </span>
      </span>
    );
  }
  const p = placeLogo(f, k);
  return (
    <span className={cx('logo-plate', className)} data-plate={f.plate} data-kind={p.kind} data-testid="logo-plate" style={{ width: p.plateW + 5, height: p.plateH + 5 }}>
      <span className="logo-plate-in block" data-content={[p.left + f.bounds.x * p.imgW, p.top + f.bounds.y * p.imgH, p.fitW, p.fitH].map((n) => n.toFixed(2)).join(',')} style={{ width: p.plateW, height: p.plateH }}>
        <img src={src} alt={`Logotipo de ${name}`} draggable={false} onError={() => setBroken(true)} style={{ width: p.imgW, height: p.imgH, left: p.left, top: p.top }} />
      </span>
    </span>
  );
}

export function LoyaltyCardFace({
  businessName,
  customerName,
  cardId,
  total,
  filled,
  rewardReady,
  animateFrom,
  compact,
  footer,
  logoUrl,
  logoFit,
  rewardLabel,
  interactive = true,
  className,
}: {
  businessName: string;
  customerName: string;
  cardId: string;
  total: number;
  filled: number;
  rewardReady?: boolean;
  animateFrom?: number | null;
  compact?: boolean;
  footer?: React.ReactNode;
  logoUrl?: string | null;
  logoFit?: LogoFit | null;
  rewardLabel?: string;
  interactive?: boolean;
  className?: string;
}) {
  const tilt = useTilt<HTMLDivElement>(interactive);
  return (
    <div className={cx('card-stage', className)} ref={tilt}>
      <div
        className={cx('card-metal relative overflow-hidden text-[color:var(--cream)]', rewardReady && 'card-metal-reward', compact ? 'rounded-2xl p-4' : 'rounded-[22px] p-5 sm:p-6')}
        data-testid="loyalty-card"
      >
        <div className="card-metal-sheen" aria-hidden="true" />
        <div className="card-metal-brush" aria-hidden="true" />
        <div className="card-metal-grain" aria-hidden="true" />
        <div className="card-metal-shine" aria-hidden="true" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="flex items-center gap-x-3 gap-y-1.5 min-w-0 flex-wrap">
            <LogoPlate name={businessName} src={logoUrl} fit={logoFit} compact={compact} />
            <div className="min-w-[7.5rem] flex-1">
              <div className={cx('font-display leading-tight truncate card-emboss', compact ? 'text-[15px]' : 'text-[17px]')}>{businessName}</div>
              <div className="text-[10px] sm:text-[10.5px] uppercase tracking-[0.14em] sm:tracking-[0.18em] card-ink2 whitespace-nowrap">Tarjeta de recompensas</div>
            </div>
          </div>
          {rewardReady ? (
            <span className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold reward-chip">
              Premio listo
            </span>
          ) : (
            <span className="shrink-0 card-mark" aria-hidden="true">VLUX</span>
          )}
        </div>

        <div className={cx('relative', compact ? 'mt-4' : 'mt-6')}>
          <StampGrid total={total} filled={filled} animateFrom={animateFrom} size={compact ? 'sm' : 'md'} />
        </div>

        <div className={cx('relative flex items-end justify-between gap-3', compact ? 'mt-4' : 'mt-6')}>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.16em] card-ink2">{rewardLabel ? 'Recompensa' : 'Cliente'}</div>
            <div className={cx('font-medium truncate card-emboss', compact ? 'text-[13px]' : 'text-[15px]')}>{rewardLabel ?? customerName}</div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] uppercase tracking-[0.16em] card-ink2">Sellos</div>
            <div className={cx('font-display tabular-nums card-emboss', compact ? 'text-[15px]' : 'text-[20px]')}>
              {filled}<span className="card-ink2"> / {total}</span>
            </div>
          </div>
        </div>
        <div className="relative mt-3 pt-3 border-t card-divider flex items-center justify-between gap-2 text-[11.5px]">
          <span className="font-mono tracking-[0.16em] card-ink2 card-emboss">{cardId}</span>
          {footer}
        </div>
      </div>
    </div>
  );
}
