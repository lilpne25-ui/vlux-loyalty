// Tarjeta de sellos: misma pieza para cliente, empleado, configuración y vista previa de Wallet.
import React from 'react';
import { BusinessLogo, cx } from './ui';

export function StampGrid({ total, filled, animateFrom, size = 'md', onBrand = true }: { total: number; filled: number; animateFrom?: number | null; size?: 'sm' | 'md'; onBrand?: boolean }) {
  const cols = total <= 5 ? total : total <= 10 ? Math.ceil(total / 2) : Math.ceil(total / 3);
  const dim = size === 'sm' ? 'h-6 w-6' : 'h-[34px] w-[34px] sm:h-9 sm:w-9';
  return (
    <div className="grid gap-2.5 sm:gap-3 justify-start" style={{ gridTemplateColumns: `repeat(${cols}, max-content)` }} role="img" aria-label={`${filled} de ${total} sellos`}>
      {Array.from({ length: total }).map((_, i) => {
        const isFilled = i < filled;
        const isNew = isFilled && animateFrom != null && i >= animateFrom;
        return (
          <span
            key={i}
            className={cx('relative inline-flex items-center justify-center rounded-full', dim, isNew && 'stamp-new')}
            style={{
              background: isFilled ? 'var(--accent)' : 'transparent',
              border: isFilled ? 'none' : `1.5px dashed ${onBrand ? 'color-mix(in srgb, var(--cream) 38%, transparent)' : '#C9CED6'}`,
              animationDelay: isNew ? `${(i - (animateFrom || 0)) * 140 + 250}ms` : undefined,
              boxShadow: isFilled ? 'inset 0 -2px 0 rgba(0,0,0,.18), 0 1px 0 rgba(255,255,255,.25) inset' : undefined,
            }}
          >
            {isFilled ? (
              <svg viewBox="0 0 24 24" className={size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} aria-hidden="true">
                <g transform="translate(12 12) rotate(-30)">
                  <ellipse rx="5" ry="7.2" fill="var(--brand)" opacity=".88" />
                  <path d="M0 -6.6 C -2.4 -2.2, 2.4 2.2, 0 6.6" stroke="var(--accent)" strokeWidth="1.3" fill="none" />
                </g>
              </svg>
            ) : (
              <span className={cx('text-[10px] tabular-nums', onBrand ? 'text-[color:var(--cream)] opacity-40' : 'text-[#98A2B3]')}>{i + 1}</span>
            )}
            {isNew && <span className="stamp-ring absolute inset-0 rounded-full" style={{ animationDelay: `${(i - (animateFrom || 0)) * 140 + 250}ms` }} />}
          </span>
        );
      })}
    </div>
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
}) {
  return (
    <div
      className={cx('card-surface relative overflow-hidden text-[color:var(--cream)] shadow-[0_24px_48px_-24px_rgba(30,18,10,.55),0_2px_6px_rgba(30,18,10,.18)]', compact ? 'rounded-2xl p-4' : 'rounded-[22px] p-5 sm:p-6')}
      style={{ background: 'var(--brand)' }}
    >
      <div className="pointer-events-none absolute inset-0 card-sheen" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <BusinessLogo name={businessName} size={compact ? 34 : 42} />
          <div className="min-w-0">
            <div className={cx('font-display leading-tight truncate', compact ? 'text-[15px]' : 'text-[17px]')}>{businessName}</div>
            <div className="text-[11px] uppercase tracking-[0.14em] opacity-60">Mi tarjeta de recompensas</div>
          </div>
        </div>
        {rewardReady && (
          <span className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold reward-chip" style={{ background: 'var(--accent)', color: 'var(--brand)' }}>
            Premio listo
          </span>
        )}
      </div>

      <div className={cx('relative', compact ? 'mt-4' : 'mt-6')}>
        <StampGrid total={total} filled={filled} animateFrom={animateFrom} size={compact ? 'sm' : 'md'} />
      </div>

      <div className={cx('relative flex items-end justify-between gap-3', compact ? 'mt-4' : 'mt-6')}>
        <div className="min-w-0">
          <div className="text-[10.5px] uppercase tracking-[0.14em] opacity-55">Cliente</div>
          <div className={cx('font-medium truncate', compact ? 'text-[13px]' : 'text-[15px]')}>{customerName}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10.5px] uppercase tracking-[0.14em] opacity-55">Sellos</div>
          <div className={cx('font-display tabular-nums', compact ? 'text-[15px]' : 'text-[20px]')}>
            {filled}<span className="opacity-50"> / {total}</span>
          </div>
        </div>
      </div>
      <div className="relative mt-3 pt-3 border-t card-divider flex items-center justify-between gap-2 text-[11.5px]">
        <span className="font-mono tracking-wider opacity-70">{cardId}</span>
        {footer}
      </div>
    </div>
  );
}
