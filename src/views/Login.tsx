// Acceso del personal (dueño y empleados). La sesión vive en una cookie HttpOnly que fija el servidor.
import React, { useEffect, useState } from 'react';
import { ChevronRight, LogIn } from 'lucide-react';
import { api, ApiError, StaffSessionInfo } from '../lib/api';
import { BusinessLogo, Button, Field, inputCls, VluxMark } from '../components/ui';

type Choice = { slug: string; name: string; role: 'OWNER' | 'EMPLOYEE' };
type PublicBiz = { name: string; logoUrl?: string | null; primaryColor: string };

/**
 * V0.4.6 · Con ?negocio=<slug> (enlace permanente del panel o la caja, o la app instalada de ese negocio) el inicio de
 * sesión ya sabe a qué negocio entrar: muestra su nombre y abre la sesión SOLO en ese negocio (nunca en otro en silencio).
 */
export function LoginView({ onLoggedIn, businessSlug }: { onLoggedIn: (s: StaffSessionInfo) => void; businessSlug?: string | null }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [choices, setChoices] = useState<Choice[] | null>(null);
  const [biz, setBiz] = useState<PublicBiz | null>(null);
  const [target, setTarget] = useState<string | null>(businessSlug ?? null);
  useEffect(() => {
    if (!businessSlug) return;
    api<{ business: PublicBiz }>('GET', `/public/businesses/${encodeURIComponent(businessSlug)}`)
      .then((r) => setBiz(r.business))
      .catch(() => setTarget(null)); // negocio inexistente: inicio de sesión normal
  }, [businessSlug]);

  const doLogin = async (slug?: string) => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ session?: StaffSessionInfo; chooseBusiness?: boolean; businesses: Choice[] }>('POST', '/staff/login', { email, password, businessSlug: slug ?? target ?? undefined });
      // Con varios negocios el servidor NO abre sesión hasta que la persona elija uno.
      if (r.chooseBusiness) setChoices(r.businesses);
      else if (r.session) onLoggedIn(r.session);
    } catch (err) {
      const e = err as ApiError;
      setError(e.code === 'forbidden' && target ? `Tu cuenta no tiene acceso a ${biz?.name ?? 'este negocio'}. Revisa el correo o pide una invitación.` : e.message);
    } finally {
      setBusy(false);
    }
  };
  const submit = (e: React.FormEvent) => { e.preventDefault(); doLogin(); };
  if (choices) {
    return (
      <div className="biz-bg min-h-full">
        <div className="mx-auto w-full max-w-[400px] gutter py-14 flex flex-col gap-5">
          <VluxMark className="text-[#475467]" />
          <div>
            <h1 className="text-[26px] font-semibold tracking-tight text-ink">Elige el negocio</h1>
            <p className="text-[14px] text-slate2 mt-1">Tu cuenta tiene acceso a varios negocios.</p>
          </div>
          <ul className="panel divide-y divide-line overflow-hidden" data-testid="business-chooser">
            {choices.map((b) => (
              <li key={b.slug}>
                <button disabled={busy} onClick={() => doLogin(b.slug)} className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-[#fafbfc] disabled:opacity-50">
                  <span className="min-w-0"><span className="block text-[15px] font-medium text-ink truncate">{b.name}</span><span className="block text-[12.5px] text-slate2">{b.role === 'OWNER' ? 'Dueño' : 'Caja'}</span></span>
                  <ChevronRight size={16} className="text-slate2 shrink-0" />
                </button>
              </li>
            ))}
          </ul>
          {error && <p className="text-[13px] text-[#B42318]" role="alert">{error}</p>}
          <button className="text-[13px] text-slate2 hover:text-ink self-start" onClick={() => { setChoices(null); setPassword(''); }}>Usar otra cuenta</button>
        </div>
      </div>
    );
  }
  return (
    <div className="biz-bg min-h-full">
      <form onSubmit={submit} className="mx-auto w-full max-w-[400px] gutter py-14 flex flex-col gap-5">
        <VluxMark className="text-[#475467]" />
        {target && biz ? (
          <div className="flex items-center gap-3" data-testid="login-business">
            <BusinessLogo name={biz.name} size={48} src={biz.logoUrl} />
            <div className="min-w-0">
              <h1 className="text-[24px] font-semibold tracking-tight text-ink leading-tight break-words">{biz.name}</h1>
              <p className="text-[14px] text-slate2">Acceso del dueño y del personal de caja.</p>
            </div>
          </div>
        ) : (
          <div>
            <h1 className="text-[26px] font-semibold tracking-tight text-ink">Acceso para negocios</h1>
            <p className="text-[14px] text-slate2 mt-1">Dueños y personal de caja.</p>
          </div>
        )}
        <div className="panel p-5 flex flex-col gap-4">
          <Field label="Correo" htmlFor="login-email"><input id="login-email" type="email" autoComplete="username" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Contraseña" htmlFor="login-password"><input id="login-password" type="password" autoComplete="current-password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          {error && <p className="text-[13px] text-[#B42318]" role="alert">{error}</p>}
          <Button type="submit" size="lg" disabled={busy || !email || !password}><LogIn size={17} /> {busy ? 'Entrando…' : 'Entrar'}</Button>
        </div>
        {target && biz && <button type="button" className="text-[12.5px] text-slate2 hover:text-ink self-start" onClick={() => setTarget(null)}>¿Eres de otro negocio? Entrar sin elegir negocio</button>}
        <p className="text-[12px] text-slate2">¿Olvidaste tu contraseña? Pide al dueño del negocio un enlace para crear una nueva. Si eres el dueño, pídelo a VLUX: te enviará un enlace seguro (nunca tu contraseña).</p>
      </form>
    </div>
  );
}
