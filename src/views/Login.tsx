// Acceso del personal (dueño y empleados). La sesión vive en una cookie HttpOnly que fija el servidor.
import React, { useState } from 'react';
import { LogIn } from 'lucide-react';
import { api, ApiError, StaffSessionInfo } from '../lib/api';
import { Button, Field, inputCls, VluxMark } from '../components/ui';

export function LoginView({ onLoggedIn }: { onLoggedIn: (s: StaffSessionInfo) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ session: StaffSessionInfo }>('POST', '/staff/login', { email, password });
      onLoggedIn(r.session);
    } catch (err) {
      setError((err as ApiError).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="biz-bg min-h-full">
      <form onSubmit={submit} className="mx-auto w-full max-w-[400px] gutter py-14 flex flex-col gap-5">
        <VluxMark className="text-[#475467]" />
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-ink">Acceso para negocios</h1>
          <p className="text-[14px] text-slate2 mt-1">Dueños y personal de caja.</p>
        </div>
        <div className="panel p-5 flex flex-col gap-4">
          <Field label="Correo" htmlFor="login-email"><input id="login-email" type="email" autoComplete="username" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Contraseña" htmlFor="login-password"><input id="login-password" type="password" autoComplete="current-password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          {error && <p className="text-[13px] text-[#B42318]" role="alert">{error}</p>}
          <Button type="submit" size="lg" disabled={busy || !email || !password}><LogIn size={17} /> {busy ? 'Entrando…' : 'Entrar'}</Button>
        </div>
        <p className="text-[12px] text-slate2">¿Olvidaste tu contraseña? Pide al dueño del negocio o a VLUX que la restablezca.</p>
      </form>
    </div>
  );
}
