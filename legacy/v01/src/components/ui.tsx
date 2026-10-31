// Componentes base reutilizables (sin dependencia del dominio).
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Check, X, AlertCircle, Copy } from 'lucide-react';
import { qrMatrix, qrPath } from '../lib/qr';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'brand' | 'ink';
export function Button({ variant = 'primary', size = 'md', className, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' | 'lg' }) {
  const base = 'inline-flex items-center justify-center gap-2 font-medium rounded-xl transition active:scale-[.98] disabled:opacity-45 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-cyan-500 select-none';
  const sizes = { sm: 'h-9 px-3 text-[13px]', md: 'h-11 px-4 text-[14px]', lg: 'h-[52px] px-5 text-[15px]' };
  const variants: Record<BtnVariant, string> = {
    primary: 'bg-ink text-white hover:bg-[#1d2127] shadow-sm',
    ink: 'bg-ink text-white hover:bg-[#1d2127]',
    secondary: 'bg-white text-ink border border-line hover:border-[#c9ced6] hover:bg-[#fafbfc]',
    ghost: 'text-slate2 hover:bg-black/[.04] hover:text-ink',
    danger: 'bg-[#B42318] text-white hover:bg-[#9a1d14]',
    brand: 'text-[var(--on-brand)] shadow-[0_8px_24px_-10px_var(--brand)] hover:brightness-110',
  };
  return (
    <button className={cx(base, sizes[size], variants[variant], className)} style={variant === 'brand' ? { background: 'var(--brand)' } : undefined} {...rest}>
      {children}
    </button>
  );
}

export function Badge({ tone = 'neutral', children, className }: { tone?: 'neutral' | 'good' | 'warn' | 'info' | 'sample' | 'gold'; children: React.ReactNode; className?: string }) {
  const tones = {
    neutral: 'bg-[#F1F3F6] text-[#475467] border-[#E3E6EB]',
    good: 'bg-[#ECFDF3] text-[#067647] border-[#ABEFC6]',
    warn: 'bg-[#FFFAEB] text-[#B54708] border-[#FEDF89]',
    info: 'bg-[#EEF8FA] text-[#0E6874] border-[#BFE6EC]',
    sample: 'bg-[#F4F3FF] text-[#5925DC] border-[#D9D6FE]',
    gold: 'bg-[#FBF3E4] text-[#7A5A1F] border-[#EBD7B0]',
  } as const;
  return <span className={cx('inline-flex items-center gap-1 rounded-full border px-2 py-[2px] text-[11px] font-medium leading-[16px] whitespace-nowrap', tones[tone], className)}>{children}</span>;
}

export function SampleBadge() {
  return <Badge tone="sample">Ejemplo</Badge>;
}

export function Modal({ open, onClose, title, children, wide, labelledBy }: { open: boolean; onClose: () => void; title?: React.ReactNode; children: React.ReactNode; wide?: boolean; labelledBy?: string }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
      <div className="absolute inset-0 bg-[#0b0d10]/45 backdrop-blur-[2px] anim-fade" onClick={onClose} />
      <div className={cx('relative w-full bg-white sm:rounded-2xl rounded-t-2xl shadow-2xl anim-sheet max-h-[92vh] overflow-y-auto', wide ? 'sm:max-w-2xl' : 'sm:max-w-md')} style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 pt-4 pb-3 bg-white/95 backdrop-blur border-b border-line">
          <div id={labelledBy} className="text-[15px] font-semibold text-ink min-w-0">{title}</div>
          <button onClick={onClose} aria-label="Cerrar" className="h-9 w-9 -mr-2 inline-flex items-center justify-center rounded-lg text-slate2 hover:bg-black/5">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

// ---------- Toasts ----------
type Toast = { id: number; tone: 'good' | 'bad' | 'info'; text: string };
const ToastCtx = createContext<(tone: Toast['tone'], text: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const push = useCallback((tone: Toast['tone'], text: string) => {
    const id = ++idRef.current;
    setToasts((t) => [...t.slice(-2), { id, tone, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'bad' ? 5200 : 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed z-[60] left-1/2 -translate-x-1/2 flex flex-col gap-2 w-[min(92vw,420px)] pointer-events-none" style={{ bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }} aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="anim-toast pointer-events-auto flex items-start gap-3 rounded-xl bg-ink text-white px-4 py-3 shadow-xl text-[13.5px] leading-snug">
            <span className={cx('mt-[1px] h-5 w-5 shrink-0 rounded-full inline-flex items-center justify-center', t.tone === 'good' ? 'bg-[#12B76A]' : t.tone === 'bad' ? 'bg-[#F04438]' : 'bg-[#2E90A0]')}>
              {t.tone === 'good' ? <Check size={13} strokeWidth={3} /> : <AlertCircle size={13} strokeWidth={2.5} />}
            </span>
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------- QR ----------
export function QRCode({ value, size = 168, fg = '#111', bg = '#fff', label }: { value: string; size?: number; fg?: string; bg?: string; label?: string }) {
  const { path, n } = useMemo(() => {
    const m = qrMatrix(value);
    return { path: qrPath(m), n: m.length };
  }, [value]);
  const q = 2; // zona de silencio
  return (
    <svg width={size} height={size} viewBox={`${-q} ${-q} ${n + q * 2} ${n + q * 2}`} role="img" aria-label={label || `Código QR ${value}`} shapeRendering="crispEdges" className="block max-w-full h-auto">
      <rect x={-q} y={-q} width={n + q * 2} height={n + q * 2} fill={bg} />
      <path d={path} fill={fg} />
    </svg>
  );
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function CopyButton({ text, className, dark }: { text: string; className?: string; dark?: boolean }) {
  const toast = useToast();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={cx('inline-flex items-center gap-1.5 rounded-lg px-2.5 h-8 text-[12.5px] font-medium transition', dark ? 'text-[var(--cream)] hover:bg-white/10' : 'text-slate2 hover:bg-black/5 hover:text-ink', className)}
      onClick={async () => {
        const ok = await copyText(text);
        if (ok) {
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } else {
          toast('info', `No se pudo copiar automáticamente. Selecciona el texto: ${text}`);
        }
      }}
    >
      {done ? <Check size={14} /> : <Copy size={14} />} {done ? 'Copiado' : 'Copiar'}
    </button>
  );
}

export function Switch({ checked, onChange, id, label }: { checked: boolean; onChange: (v: boolean) => void; id: string; label: React.ReactNode }) {
  return (
    <label htmlFor={id} className="inline-flex items-center gap-2.5 cursor-pointer select-none text-[13px] text-ink">
      <span className="relative inline-flex">
        <input id={id} type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-[22px] w-[38px] rounded-full bg-[#D0D5DD] peer-checked:bg-ink transition peer-focus-visible:ring-2 peer-focus-visible:ring-cyan-500 peer-focus-visible:ring-offset-2" />
        <span className="absolute top-[3px] left-[3px] h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
      </span>
      {label}
    </label>
  );
}

export function Field({ label, hint, error, children, htmlFor }: { label: React.ReactNode; hint?: React.ReactNode; error?: string | null; children: React.ReactNode; htmlFor: string }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink">{label}</label>
      {children}
      {error ? <p className="text-[12.5px] text-[#B42318]">{error}</p> : hint ? <p className="text-[12.5px] text-slate2 leading-snug">{hint}</p> : null}
    </div>
  );
}

export const inputCls = 'h-11 w-full rounded-xl border border-line bg-white px-3.5 text-[15px] text-ink placeholder:text-[#98A2B3] outline-none transition focus:border-[#98A2B3] focus:ring-4 focus:ring-[#67C7D3]/20';

// ---------- Marcas ----------
export function VluxMark({ className = '' }: { className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 font-semibold tracking-[0.18em] text-[11px]', className)}>
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 4h4.2L12 15.6 16.8 4H21l-7.4 16h-3.2z" fill="currentColor" />
        <path d="M16.8 4H21l-1.6 3.5h-4.1z" fill="#67C7D3" />
      </svg>
      VLUX
    </span>
  );
}

export function PoweredByVlux({ dark }: { dark?: boolean }) {
  return (
    <div className={cx('flex items-center justify-center gap-1.5 text-[11px] tracking-wide', dark ? 'text-white/45' : 'text-[#98A2B3]')}>
      <span>Powered by</span>
      <VluxMark className={dark ? 'text-white/70' : 'text-[#475467]'} />
    </div>
  );
}

/** Monograma del negocio, construido con su nombre y colores (cada negocio tendría su logo real). */
export function BusinessLogo({ name, size = 44, ring = true }: { name: string; size?: number; ring?: boolean }) {
  const initials = name
    .replace(/caf[eé]/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || name.slice(0, 2).toUpperCase();
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className="shrink-0">
      <circle cx="24" cy="24" r="23" fill="var(--brand)" />
      {ring && <circle cx="24" cy="24" r="19.5" fill="none" stroke="var(--accent)" strokeWidth="0.9" opacity=".9" />}
      <g transform="translate(24 15.5) rotate(-28)">
        <ellipse rx="3.4" ry="5" fill="var(--accent)" />
        <path d="M0 -4.6 C -1.6 -1.5, 1.6 1.5, 0 4.6" stroke="var(--brand)" strokeWidth="0.9" fill="none" />
      </g>
      <text x="24" y="34.5" textAnchor="middle" fontFamily="'Young Serif', Georgia, serif" fontSize="11" fill="var(--cream)" letterSpacing="0.5">{initials}</text>
    </svg>
  );
}

export function CupIllustration({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 220" className={className} aria-hidden="true">
      <defs>
        <radialGradient id="cupTop" cx="50%" cy="45%" r="60%">
          <stop offset="0" stopColor="#C89A6A" />
          <stop offset=".55" stopColor="#8A5A36" />
          <stop offset="1" stopColor="#4A2C1C" />
        </radialGradient>
        <linearGradient id="cupBody" x1="0" x2="1">
          <stop offset="0" stopColor="#FFFDF9" />
          <stop offset=".6" stopColor="#F3E9DA" />
          <stop offset="1" stopColor="#DCCBB1" />
        </linearGradient>
        <linearGradient id="saucer" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#FBF6EE" />
          <stop offset="1" stopColor="#D9C6A9" />
        </linearGradient>
      </defs>
      <ellipse cx="160" cy="186" rx="128" ry="22" fill="#000" opacity=".18" />
      <ellipse cx="160" cy="176" rx="122" ry="26" fill="url(#saucer)" />
      <ellipse cx="160" cy="172" rx="70" ry="12" fill="#CDB797" opacity=".55" />
      <path d="M232 104c22-6 38 4 36 22-2 17-22 26-44 22" fill="none" stroke="url(#cupBody)" strokeWidth="13" strokeLinecap="round" />
      <path d="M78 96h164c-2 46-30 78-82 78S80 142 78 96z" fill="url(#cupBody)" />
      <ellipse cx="160" cy="96" rx="82" ry="20" fill="#F7EFE3" />
      <ellipse cx="160" cy="97" rx="72" ry="15.5" fill="url(#cupTop)" />
      <path d="M160 86c-9 0-15 4-15 8 0 3 4 5 9 5-6 1-10 3-10 6 0 4 7 6 16 6s16-2 16-6c0-3-4-5-10-6 5 0 9-2 9-5 0-4-6-8-15-8z" fill="#F4E6D2" opacity=".92" />
      <path d="M160 88v24" stroke="#C89A6A" strokeWidth="1.4" opacity=".7" />
      <g fill="none" stroke="#F3E9DA" strokeWidth="3" strokeLinecap="round" opacity=".5" className="steam">
        <path d="M132 66c-10-12 10-18 0-32" />
        <path d="M160 58c-10-12 10-18 0-32" />
        <path d="M188 66c-10-12 10-18 0-32" />
      </g>
    </svg>
  );
}
