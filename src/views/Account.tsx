// V0.2.1 · pantallas de cuenta y acceso:
//   /t#<token>            abre la tarjeta del cliente (el token va en el fragmento: no llega a logs)
//   /restablecer#<token>  fija una contraseña nueva con un enlace de un solo uso
//   ChangePasswordPanel   cambio de contraseña del personal (obligatorio si es temporal)
import React, { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { navigate } from '../lib/router';
import { Button, Field, inputCls, VluxMark } from '../components/ui';
import { Loading } from '../components/Brand';

/** Lee el token del fragmento y lo borra de la barra de direcciones y del historial. */
function takeFragmentToken(): string {
  const t = location.hash.replace(/^#/, '');
  if (t) history.replaceState(null, '', location.pathname);
  return t;
}

export function CardLinkView() {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const token = takeFragmentToken();
    if (!token) { navigate('/?enlace=invalido', { replace: true }); return; }
    api<{ slug: string }>('POST', '/card-access', { token })
      .then((r) => navigate(`/n/${r.slug}`, { replace: true }))
      .catch((e: ApiError) => setError(e.message));
  }, []);
  if (!error) return <Loading label="Abriendo tu tarjeta…" />;
  return (
    <div className="mx-auto max-w-[460px] gutter py-16 text-center">
      <h1 className="text-[20px] font-semibold text-ink">No pudimos abrir la tarjeta</h1>
      <p className="mt-2 text-[14px] text-slate2">{error}</p>
    </div>
  );
}

function PasswordForm({ title, subtitle, needsCurrent, onSubmit, submitLabel }: { title: string; subtitle: string; needsCurrent: boolean; submitLabel: string; onSubmit: (current: string, next: string) => Promise<void> }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next.length < 10) return setError('La contraseña debe tener al menos 10 caracteres.');
    if (next !== repeat) return setError('Las contraseñas no coinciden.');
    setBusy(true);
    try { await onSubmit(current, next); } catch (err) { setError((err as ApiError).message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="panel p-5 flex flex-col gap-4" aria-label={title}>
      <div>
        <h2 className="text-[17px] font-semibold text-ink">{title}</h2>
        <p className="text-[13px] text-slate2 mt-0.5">{subtitle}</p>
      </div>
      {needsCurrent && <Field label="Contraseña actual" htmlFor="pwd-current"><input id="pwd-current" type="password" autoComplete="current-password" className={inputCls} value={current} onChange={(e) => setCurrent(e.target.value)} /></Field>}
      <Field label="Contraseña nueva" hint="Mínimo 10 caracteres." htmlFor="pwd-new"><input id="pwd-new" type="password" autoComplete="new-password" className={inputCls} value={next} onChange={(e) => setNext(e.target.value)} /></Field>
      <Field label="Repite la contraseña nueva" htmlFor="pwd-repeat"><input id="pwd-repeat" type="password" autoComplete="new-password" className={inputCls} value={repeat} onChange={(e) => setRepeat(e.target.value)} /></Field>
      {error && <p className="text-[13px] text-[#B42318]" role="alert">{error}</p>}
      <Button type="submit" disabled={busy || !next || (needsCurrent && !current)}><KeyRound size={16} /> {busy ? 'Guardando…' : submitLabel}</Button>
    </form>
  );
}

export function ResetPasswordView() {
  const [token] = useState(takeFragmentToken);
  const [done, setDone] = useState(false);
  return (
    <div className="biz-bg min-h-full">
      <div className="mx-auto w-full max-w-[420px] gutter py-14 flex flex-col gap-5">
        <VluxMark className="text-[#475467]" />
        {!token ? (
          <p className="text-[14px] text-slate2">Este enlace no es válido. Pide uno nuevo al dueño del negocio.</p>
        ) : done ? (
          <div className="panel p-5">
            <h1 className="text-[18px] font-semibold text-ink">Contraseña actualizada</h1>
            <p className="text-[13.5px] text-slate2 mt-1">Ya puedes entrar con tu contraseña nueva.</p>
            <Button className="mt-4" onClick={() => navigate('/acceso', { replace: true })}>Ir a iniciar sesión</Button>
          </div>
        ) : (
          <PasswordForm title="Crea tu contraseña nueva" subtitle="El enlace sirve una sola vez y vence en 60 minutos." needsCurrent={false} submitLabel="Guardar contraseña"
            onSubmit={async (_c, next) => { await api('POST', '/staff/password-reset', { token, newPassword: next }); setDone(true); }} />
        )}
      </div>
    </div>
  );
}

export function ChangePasswordPanel({ forced, onDone }: { forced?: boolean; onDone: () => void }) {
  return (
    <div className="mx-auto w-full max-w-[440px] gutter py-10">
      <PasswordForm
        title={forced ? 'Cambia tu contraseña temporal' : 'Cambiar contraseña'}
        subtitle={forced ? 'Por seguridad, elige una contraseña propia antes de continuar.' : 'Se cerrará tu sesión en los demás dispositivos.'}
        needsCurrent submitLabel="Cambiar contraseña"
        onSubmit={async (current, next) => { await api('POST', '/staff/password', { currentPassword: current, newPassword: next }); onDone(); }} />
    </div>
  );
}
