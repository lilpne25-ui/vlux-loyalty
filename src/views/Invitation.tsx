// V0.3 · Aceptar invitación (/invitacion#token). Reemplaza el alta técnica del dueño:
// la persona elige su contraseña (o, si ya tiene cuenta, la confirma) y entra directo a su negocio.
import React, { useEffect, useState } from 'react';
import { Check, KeyRound, LogIn } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { navigate } from '../lib/router';
import { Button, Field, inputCls, VluxMark } from '../components/ui';
import { Loading } from '../components/Brand';

type Info = { businessName: string; businessSlug?: string; role: 'OWNER' | 'EMPLOYEE'; email: string; displayName: string; accountExists: boolean; expiresAt: string; delivery?: 'link' | 'in_person' };

/** Destino después de aceptar: el panel o la caja DE ESE negocio, con la bienvenida (instalar, QR). */
export const afterAcceptPath = (role: 'OWNER' | 'EMPLOYEE', slug?: string) => `${role === 'OWNER' ? '/panel' : '/caja'}?${slug ? `negocio=${encodeURIComponent(slug)}&` : ''}bienvenida=1`;

/**
 * V0.4.6 · /activar: activación presencial con el código corto que muestra el equipo de VLUX (si la cámara no lee el QR).
 * El código es de un solo uso, vence en 30 minutos y el servidor limita los intentos.
 */
export function ActivateWithCodeView() {
  const [code, setCode] = useState('');
  const [checked, setChecked] = useState<{ code: string; info: Info } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (checked) return <InvitationForm credential={{ code: checked.code }} info={checked.info} />;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try { setChecked({ code, info: await api<Info>('POST', '/invitations/inspect', { code }) }); }
    catch (x) { setError((x as ApiError).message); } finally { setBusy(false); }
  };
  const clean = code.toUpperCase().replace(/[^0-9A-Z]/g, '');
  return (
    <Shell>
      <div className="text-[12px] uppercase tracking-[0.12em] text-slate2">Activación presencial</div>
      <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-ink">Escribe tu código</h1>
      <p className="mt-1.5 text-[14px] text-slate2">Te lo muestra el equipo de VLUX en su pantalla. Son 10 caracteres.</p>
      <form onSubmit={submit} className="panel p-5 mt-6 flex flex-col gap-4">
        <Field label="Código de activación" htmlFor="act-code"><input id="act-code" autoComplete="one-time-code" autoCapitalize="characters" spellCheck={false} className={`${inputCls} font-mono tracking-[0.18em] uppercase`} placeholder="XXXXX-XXXXX" maxLength={14} value={code} onChange={(e) => setCode(e.target.value)} /></Field>
        {error && <p className="text-[13px] text-[#B42318]" role="alert">{error}</p>}
        <Button type="submit" size="lg" disabled={busy || clean.length !== 10}><KeyRound size={17} /> {busy ? 'Revisando…' : 'Continuar'}</Button>
      </form>
      <p className="mt-4 text-[12px] text-slate2">Si el código venció, pide al equipo de VLUX que genere otro. Nunca te pediremos una contraseña por teléfono.</p>
    </Shell>
  );
}

export function InvitationView() {
  const [token] = useState(() => {
    const t = location.hash.slice(1);
    if (t) history.replaceState(null, '', location.pathname); // el token no queda en el historial ni en capturas de la barra
    return t;
  });
  const [info, setInfo] = useState<Info | null>(null);
  const [fatal, setFatal] = useState<string | null>(token ? null : 'Este enlace no trae una invitación. Pide uno nuevo a quien te invitó.');
  useEffect(() => {
    if (!token) return;
    api<Info>('POST', '/invitations/inspect', { token })
      .then((r) => setInfo(r))
      .catch((e) => setFatal((e as ApiError).message));
  }, [token]);
  if (fatal) return <Shell><h1 className="text-[22px] font-semibold text-ink">No se pudo abrir la invitación</h1><p className="mt-2 text-[14px] text-slate2" role="alert">{fatal}</p><Button variant="secondary" className="mt-6" onClick={() => navigate('/acceso')}>Ir al acceso</Button></Shell>;
  if (!info) return <Loading />;
  return <InvitationForm credential={{ token }} info={info} />;
}

function InvitationForm({ credential, info }: { credential: { token?: string; code?: string }; info: Info }) {
  const [fatal, setFatal] = useState<string | null>(null);
  const [name, setName] = useState(info.displayName);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (fatal) return <Shell><h1 className="text-[22px] font-semibold text-ink">No se pudo abrir la invitación</h1><p className="mt-2 text-[14px] text-slate2" role="alert">{fatal}</p><Button variant="secondary" className="mt-6" onClick={() => navigate('/acceso')}>Ir al acceso</Button></Shell>;

  const roleLabel = info.role === 'OWNER' ? 'dueño' : 'personal de caja';
  const valid = info.accountExists ? password.length > 0 : name.trim().length >= 2 && password.length >= 10 && password === confirm;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ role: 'OWNER' | 'EMPLOYEE'; businessSlug: string }>('POST', '/invitations/accept', { ...credential, password, displayName: info.accountExists ? undefined : name.trim() });
      navigate(afterAcceptPath(r.role, r.businessSlug), { replace: true });
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
