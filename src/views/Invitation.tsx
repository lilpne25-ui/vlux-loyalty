// V0.3 · Aceptar invitación (/invitacion#token). Reemplaza el alta técnica del dueño:
// la persona elige su contraseña (o, si ya tiene cuenta, la confirma) y entra directo a su negocio.
import React, { useEffect, useState } from 'react';
import { Check, LogIn } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { navigate } from '../lib/router';
import { Button, Field, inputCls, VluxMark } from '../components/ui';
import { Loading } from '../components/Brand';

type Info = { businessName: string; role: 'OWNER' | 'EMPLOYEE'; email: string; displayName: string; accountExists: boolean; expiresAt: string };

export function InvitationView() {
  const [token] = useState(() => {
    const t = location.hash.slice(1);
    if (t) history.replaceState(null, '', location.pathname); // el token no queda en el historial ni en capturas de la barra
    return t;
  });
  const [info, setInfo] = useState<Info | null>(null);
  const [fatal, setFatal] = useState<string | null>(token ? null : 'Este enlace no trae una invitación. Pide uno nuevo a quien te invitó.');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    api<Info>('POST', '/invitations/inspect', { token })
      .then((r) => { setInfo(r); setName(r.displayName); })
      .catch((e) => setFatal((e as ApiError).message));
  }, [token]);

  if (fatal) return <Shell><h1 className="text-[22px] font-semibold text-ink">No se pudo abrir la invitación</h1><p className="mt-2 text-[14px] text-slate2" role="alert">{fatal}</p><Button variant="secondary" className="mt-6" onClick={() => navigate('/acceso')}>Ir al acceso</Button></Shell>;
  if (!info) return <Loading />;

  const roleLabel = info.role === 'OWNER' ? 'dueño' : 'personal de caja';
  const valid = info.accountExists ? password.length > 0 : name.trim().length >= 2 && password.length >= 10 && password === confirm;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ role: 'OWNER' | 'EMPLOYEE' }>('POST', '/invitations/accept', { token, password, displayName: info.accountExists ? undefined : name.trim() });
      navigate(r.role === 'OWNER' ? '/panel' : '/caja', { replace: true });
    } catch (x) {
      const err = x as ApiError;
      if (['invalid_invitation', 'invitation_used', 'invitation_expired', 'business_suspended'].includes(err.code)) setFatal(err.message);
      else setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <div className="text-[12px] uppercase tracking-[0.12em] text-slate2">Invitación</div>
      <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-ink">{info.businessName}</h1>
      <p className="mt-1.5 text-[14px] text-slate2">Te invitaron como <strong className="text-ink">{roleLabel}</strong> con el correo <span className="text-ink break-all">{info.email}</span>.</p>
      <form onSubmit={submit} className="panel p-5 mt-6 flex flex-col gap-4">
        {info.accountExists ? (
          <>
            <p className="text-[13.5px] text-[#475467]">Ese correo ya tiene cuenta en VLUX. Escribe tu <strong>contraseña actual</strong> para agregar este negocio a tu cuenta. Tu contraseña no cambia.</p>
            <Field label="Contraseña actual" htmlFor="inv-current"><input id="inv-current" type="password" autoComplete="current-password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          </>
        ) : (
          <>
            <Field label="Tu nombre" htmlFor="inv-name"><input id="inv-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Crea tu contraseña" htmlFor="inv-pass" hint="Mínimo 10 caracteres."><input id="inv-pass" type="password" autoComplete="new-password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
            <Field label="Repítela" htmlFor="inv-pass2" error={confirm && password !== confirm ? 'No coincide.' : null}><input id="inv-pass2" type="password" autoComplete="new-password" className={inputCls} value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
          </>
        )}
        {error && <p className="text-[13px] text-[#B42318]" role="alert">{error}</p>}
        <Button type="submit" size="lg" disabled={busy || !valid}>{info.accountExists ? <LogIn size={17} /> : <Check size={17} />} {busy ? 'Entrando…' : info.accountExists ? 'Vincular y entrar' : 'Crear cuenta y entrar'}</Button>
      </form>
      <p className="mt-4 text-[12px] text-slate2">El enlace sirve una sola vez y vence el {new Date(info.expiresAt).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).replace(/\.$/, '')}.</p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="biz-bg min-h-full">
      <div className="mx-auto w-full max-w-[420px] gutter py-14 view-in">
        <VluxMark className="text-[#475467]" />
        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
}
