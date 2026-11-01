// Piezas visuales del Control Center (tema oscuro propio). No se usan en los paneles de los negocios.
import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { cx } from '../components/ui';

export { cx };

type V = 'primary' | 'secondary' | 'ghost' | 'danger';
export function CButton({ variant = 'secondary', small, className, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: V; small?: boolean }) {
  return <button className={cx('cc-btn', `cc-btn-${variant}`, small && 'cc-btn-sm', className)} {...rest}>{children}</button>;
}

export function CField({ label, hint, error, htmlFor, children, className }: { label: React.ReactNode; hint?: React.ReactNode; error?: string | null; htmlFor: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-[12.5px] font-medium text-[#C5CBD3]">{label}</label>
      {children}
      {error ? <p className="text-[12px] text-[#FDA29B]" role="alert">{error}</p> : hint ? <p className="text-[11.5px] cc-faint">{hint}</p> : null}
    </div>
  );
}

export function Pill({ tone = 'silver', children, dot = true }: { tone?: 'green' | 'cyan' | 'amber' | 'red' | 'silver'; children: React.ReactNode; dot?: boolean }) {
  return <span className={cx('cc-pill', `cc-pill-${tone}`, !dot && 'no-dot')}>{children}</span>;
}

export function CModal({ open, onClose, title, children, labelledBy, wide }: { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode; labelledBy: string; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-[3px] anim-fade" onClick={onClose} />
      <div className={cx('relative w-full cc-panel cc-sheen shadow-2xl anim-sheet max-h-[92vh] overflow-y-auto rounded-b-none sm:rounded-[14px]', wide ? 'sm:max-w-2xl' : 'sm:max-w-md')}>
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-[color:var(--cc-line)]">
          <div id={labelledBy} className="text-[14.5px] font-medium min-w-0">{title}</div>
          <button onClick={onClose} aria-label="Cerrar" className="h-8 w-8 -mr-1.5 inline-flex items-center justify-center rounded-lg cc-muted hover:bg-white/5"><X size={16} /></button>
        </div>
        <div className="px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('cc-skeleton', className)} />;
}

export function PageHeader({ title, sub, actions }: { title: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div className="min-w-0">
        <h1 className="text-[22px] sm:text-[24px] font-medium tracking-[-0.015em]">{title}</h1>
        {sub && <p className="mt-1 text-[13.5px] cc-muted">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function ErrorLine({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="cc-raised px-4 py-3 flex items-center justify-between gap-3 text-[13px] text-[#FDA29B]" role="alert">
      <span>{message}</span>
      {onRetry && <CButton small onClick={onRetry}>Reintentar</CButton>}
    </div>
  );
}

export const money = (cents: number | null | undefined, currency = 'MXN') =>
  cents == null ? '—' : new Intl.NumberFormat('es-MX', { style: 'currency', currency, maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
export const num = (n: number | null | undefined) => (n == null ? '—' : new Intl.NumberFormat('es-MX').format(n));
export const shortDate = (iso: string | null | undefined) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

export const COMMERCIAL: Record<string, { label: string; tone: 'green' | 'cyan' | 'amber' | 'red' | 'silver' }> = {
  piloto: { label: 'Piloto', tone: 'cyan' },
  activo: { label: 'Activo', tone: 'green' },
  vencido: { label: 'Vencido', tone: 'amber' },
  suspendido: { label: 'Suspendido', tone: 'red' },
  cancelado: { label: 'Cancelado', tone: 'silver' },
};
export const PLAN_LABEL: Record<string, string> = { piloto: 'Piloto', inicio: 'Inicio', crecimiento: 'Crecimiento' };

/** Nombre legible de las acciones de bitácora. */
export const ACTION_LABEL: Record<string, string> = {
  'business.created': 'Negocio creado', 'business.updated': 'Negocio editado', 'business.suspended': 'Servicio suspendido', 'business.reactivated': 'Servicio reactivado',
  'subscription.updated': 'Suscripción actualizada', 'plan.updated': 'Plan actualizado',
  'invitation.created': 'Invitación creada', 'invitation.resent': 'Invitación reenviada', 'invitation.revoked': 'Invitación revocada', 'invitation.accepted': 'Invitación aceptada', 'invitation.failed_attempt': 'Intento fallido de invitación',
  'admin.bootstrap': 'Primer administrador', 'admin.login': 'Inicio de sesión', 'admin.login_failed': 'Inicio de sesión fallido', 'admin.mfa_failed': 'Código 2FA incorrecto',
  'admin.mfa_enrolled': '2FA configurado', 'admin.invited': 'Administrador invitado', 'admin.invitation_accepted': 'Administrador aceptó invitación',
  'admin.disabled': 'Administrador desactivado', 'admin.enabled': 'Administrador reactivado', 'admin.session_revoked': 'Sesión revocada',
  'staff.login': 'Entrada de personal', 'staff.switched_business': 'Cambio de negocio', 'purchase.registered': 'Compra registrada', 'purchase.voided': 'Compra anulada',
  'card.created': 'Tarjeta creada', 'card.device_paired': 'Tarjeta en otro dispositivo', 'card.link_reissued': 'Enlace de tarjeta reenviado',
  'customer.anonymized': 'Cliente anonimizado', 'customer.exported': 'Datos de cliente exportados', 'reward.unlocked': 'Premio desbloqueado', 'reward.redeemed': 'Premio canjeado',
  'program.updated': 'Programa actualizado', 'staff.activated': 'Personal reactivado', 'staff.created': 'Personal agregado', 'staff.deactivated': 'Personal desactivado',
  'staff.password_changed': 'Contraseña cambiada', 'staff.password_reset': 'Contraseña restablecida', 'staff.reset_issued': 'Enlace de contraseña emitido',
};
export const actionLabel = (a: string) => ACTION_LABEL[a] ?? a;
