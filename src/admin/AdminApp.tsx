// V0.3 · VLUX Control Center (/vlux-admin). Acceso exclusivo del equipo VLUX:
// correo + contraseña → segundo factor (TOTP o código de recuperación). Sesión en cookie HttpOnly propia.
//   /vlux-admin                  resumen
//   /vlux-admin/negocios         directorio
//   /vlux-admin/negocios/nuevo   asistente "+ Nuevo negocio"
//   /vlux-admin/negocios/:id     ficha del negocio
//   /vlux-admin/planes           planes y precios
//   /vlux-admin/equipo           administradores y sesiones
//   /vlux-admin/bitacora         bitácora global
//   /vlux-admin/aceptar#token    alta de un administrador invitado
import React, { useCallback, useEffect, useState } from 'react';
import { Activity, Building2, CreditCard, LayoutGrid, LogOut, Palette, Plus, ScrollText, ShieldCheck, Users } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { navigate, useLocation } from '../lib/router';
import { QRCode, CopyButton } from '../components/ui';
import { CButton, CField, ErrorLine, cx } from './kit';
import { Dashboard } from './Dashboard';
import { BusinessDetail, Directory } from './Businesses';
import { Wizard } from './Wizard';
import { Studio } from './Studio';
import { AuditLog, Plans, Team } from './Settings';

type Me = { email: string; displayName: string; mfaVerified: boolean; totpEnabled: boolean; sessionId: string } | null;
type State = { loading: true } | { loading: false; disabled: boolean; me: Me; needsBootstrap: boolean };

export default function AdminApp() {
  const { path } = useLocation();
  const [st, setSt] = useState<State>({ loading: true });

  const load = useCallback(async () => {
    try {
      const [me, boot] = await Promise.all([
        api<{ admin: Me }>('GET', '/admin/auth/me'),
        api<{ needsBootstrap: boolean }>('GET', '/admin/bootstrap'),
      ]);
      setSt({ loading: false, disabled: false, me: me.admin, needsBootstrap: boot.needsBootstrap });
    } catch (e) {
      setSt({ loading: false, disabled: (e as ApiError).status === 404, me: null, needsBootstrap: false });
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { document.title = 'VLUX Control Center'; }, []);

  if (st.loading) return <Frame><div className="flex-1 flex items-center justify-center cc-muted text-[13px]">Cargando…</div></Frame>;
  if (st.disabled) return <Frame><AuthCard title="Control Center no disponible" sub="Este despliegue no tiene habilitado el Control Center." /></Frame>;
  if (path === '/vlux-admin/aceptar') return <Frame><AcceptAdminInvite onDone={() => { navigate('/vlux-admin', { replace: true }); load(); }} /></Frame>;
  if (!st.me) {
    if (st.needsBootstrap) return <Frame><Bootstrap onDone={load} /></Frame>;
    return <Frame><Login onDone={load} /></Frame>;
  }
  if (!st.me.mfaVerified) {
    return <Frame>{st.me.totpEnabled ? <VerifyTotp onDone={load} onCancel={() => logout(load)} /> : <Enroll onDone={load} onCancel={() => logout(load)} />}</Frame>;
  }
  return <Workspace me={st.me} path={path} onLogout={() => logout(load)} />;
}

async function logout(after: () => void) {
  await api('POST', '/admin/auth/logout').catch(() => undefined);
  after();
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="cc relative flex flex-col min-h-full overflow-hidden">
      <div className="cc-grid-bg absolute inset-x-0 top-0 h-[420px] pointer-events-none" aria-hidden />
      <div className="relative flex-1 flex flex-col">{children}</div>
    </div>
  );
}

export function Wordmark({ small }: { small?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 select-none">
      <img src="/brand/vlux-isotipo.png" alt="" width="34" height="35" className="h-[30px] w-auto" style={small ? { height: 22 } : undefined} />
      <div className="leading-none">
        <div className={cx('font-medium tracking-[0.18em]', small ? 'text-[12px]' : 'text-[13px]')}>VLUX</div>
        <div className="mt-1 text-[10px] tracking-[0.14em] uppercase cc-faint">Control Center</div>
      </div>
    </div>
  );
}

function AuthCard({ title, sub, children }: { title: string; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex-1 flex items-center justify-center gutter py-14">
      <div className="w-full max-w-[400px] view-in">
        <Wordmark />
        <div className="mt-10">
          <h1 className="text-[22px] font-medium tracking-[-0.01em]">{title}</h1>
          {sub && <p className="mt-1.5 text-[13.5px] cc-muted">{sub}</p>}
        </div>
        {children && <div className="mt-6">{children}</div>}
        <p className="mt-10 text-[11px] cc-faint">Acceso restringido al equipo VLUX. Cada acción queda registrada.</p>
      </div>
    </div>
  );
}

function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e) { setError((e as ApiError).message); } finally { setBusy(false); }
  };
  return { busy, error, run };
}

function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, run } = useSubmit();
  return (
    <AuthCard title="Iniciar sesión" sub="Correo, contraseña y tu app de autenticación.">
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); run(async () => { await api('POST', '/admin/auth/login', { email, password }); onDone(); }); }}>
        <CField label="Correo" htmlFor="cc-email"><input id="cc-email" className="cc-input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></CField>
        <CField label="Contraseña" htmlFor="cc-pass"><input id="cc-pass" className="cc-input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></CField>
        {error && <p className="text-[12.5px] text-[#FDA29B]" role="alert">{error}</p>}
        <CButton variant="primary" type="submit" disabled={busy || !email || !password}>{busy ? 'Verificando…' : 'Continuar'}</CButton>
      </form>
    </AuthCard>
  );
}

function VerifyTotp({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState(false);
  const { busy, error, run } = useSubmit();
  return (
    <AuthCard title="Segundo factor" sub={recovery ? 'Escribe uno de tus códigos de recuperación. Cada uno sirve una sola vez.' : 'Escribe el código de 6 dígitos de tu app de autenticación.'}>
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); run(async () => { await api('POST', '/admin/auth/totp', { code }); onDone(); }); }}>
        <CField label={recovery ? 'Código de recuperación' : 'Código'} htmlFor="cc-code">
          <input id="cc-code" className="cc-input font-mono tracking-[0.3em] text-center text-[18px] h-12" inputMode={recovery ? 'text' : 'numeric'} autoComplete="one-time-code" maxLength={recovery ? 11 : 6} autoFocus value={code} onChange={(e) => setCode(recovery ? e.target.value.toUpperCase() : e.target.value.replace(/\D/g, ''))} />
        </CField>
        {error && <p className="text-[12.5px] text-[#FDA29B]" role="alert">{error}</p>}
        <CButton variant="primary" type="submit" disabled={busy || code.length < 6}>{busy ? 'Verificando…' : 'Verificar'}</CButton>
        <div className="flex justify-between">
          <button type="button" className="text-[12.5px] cc-muted hover:text-white" onClick={() => { setRecovery(!recovery); setCode(''); }}>{recovery ? 'Usar app de autenticación' : 'Usar código de recuperación'}</button>
          <button type="button" className="text-[12.5px] cc-muted hover:text-white" onClick={onCancel}>Cancelar</button>
        </div>
      </form>
    </AuthCard>
  );
}

function Enroll({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const { busy, error, run } = useSubmit();
  useEffect(() => { run(async () => setSetup(await api('POST', '/admin/auth/enroll/start'))); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (codes) {
    return (
      <AuthCard title="Guarda tus códigos de recuperación" sub="Si pierdes el teléfono, cada código te deja entrar una vez. No se volverán a mostrar.">
        <div className="cc-panel p-4 grid grid-cols-2 gap-2 font-mono text-[13.5px] tracking-wider" data-testid="recovery-codes">
          {codes.map((c) => <span key={c} className="px-2 py-1.5 rounded-md bg-white/[.03] text-center">{c}</span>)}
        </div>
        <div className="mt-3 flex justify-end"><CopyButton dark text={codes.join('\n')} /></div>
        <label className="mt-4 flex items-start gap-2.5 text-[13px] cc-muted cursor-pointer">
          <input type="checkbox" className="mt-0.5 accent-[#67C7D3]" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> Los guardé en un lugar seguro (gestor de contraseñas).
        </label>
        <CButton variant="primary" className="mt-5 w-full" disabled={!saved} onClick={onDone}>Entrar al Control Center</CButton>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Configura tu segundo factor" sub="Obligatorio para todo el equipo VLUX. Escanea el código con Google Authenticator, 1Password, Authy o similar.">
      {setup ? (
        <div className="flex flex-col gap-4">
          <div className="cc-panel p-4 flex items-center gap-4">
            <div className="rounded-lg bg-white p-2 shrink-0"><QRCode value={setup.otpauthUri} size={132} label="Código QR para la app de autenticación" /></div>
            <div className="min-w-0">
              <div className="cc-label">Clave manual</div>
              <div className="mt-1.5 cc-code" data-testid="totp-secret">{setup.secret}</div>
            </div>
          </div>
          <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); run(async () => { const r = await api<{ recoveryCodes: string[] }>('POST', '/admin/auth/enroll/confirm', { code }); setCodes(r.recoveryCodes); }); }}>
            <CField label="Código de 6 dígitos" htmlFor="cc-enroll-code">
              <input id="cc-enroll-code" className="cc-input font-mono tracking-[0.3em] text-center text-[18px] h-12" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
            </CField>
            {error && <p className="text-[12.5px] text-[#FDA29B]" role="alert">{error}</p>}
            <CButton variant="primary" type="submit" disabled={busy || code.length !== 6}>Activar</CButton>
            <button type="button" className="text-[12.5px] cc-muted hover:text-white self-start" onClick={onCancel}>Cancelar</button>
          </form>
        </div>
      ) : error ? <ErrorLine message={error} /> : <div className="cc-muted text-[13px]">Generando…</div>}
    </AuthCard>
  );
}

function Bootstrap({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ setupToken: '', email: '', displayName: '', password: '' });
  const { busy, error, run } = useSubmit();
  return (
    <AuthCard title="Instalación del Control Center" sub="Crea el primer administrador. Solo funciona una vez y requiere el código de instalación del servidor (PLATFORM_ADMIN_TOKEN).">
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); run(async () => { await api('POST', '/admin/bootstrap', f); await api('POST', '/admin/auth/login', { email: f.email, password: f.password }); onDone(); }); }}>
        <CField label="Código de instalación" htmlFor="cc-setup" hint="No se guarda en el navegador."><input id="cc-setup" className="cc-input font-mono" type="password" autoComplete="off" value={f.setupToken} onChange={(e) => setF({ ...f, setupToken: e.target.value })} /></CField>
        <CField label="Nombre" htmlFor="cc-bname"><input id="cc-bname" className="cc-input" value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} /></CField>
        <CField label="Correo" htmlFor="cc-bemail"><input id="cc-bemail" className="cc-input" type="email" autoComplete="username" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></CField>
        <CField label="Contraseña" htmlFor="cc-bpass" hint="Mínimo 12 caracteres."><input id="cc-bpass" className="cc-input" type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></CField>
        {error && <p className="text-[12.5px] text-[#FDA29B]" role="alert">{error}</p>}
        <CButton variant="primary" type="submit" disabled={busy || !f.setupToken || !f.email || f.displayName.trim().length < 2 || f.password.length < 12}>Crear administrador</CButton>
      </form>
    </AuthCard>
  );
}

function AcceptAdminInvite({ onDone }: { onDone: () => void }) {
  const [token] = useState(() => {
    const t = location.hash.slice(1);
    history.replaceState(null, '', location.pathname); // el token no queda en el historial
    return t;
  });
  const [password, setPassword] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const { busy, error, run } = useSubmit();
  if (done) return <AuthCard title="Cuenta creada" sub={`Inicia sesión con ${done} y configura tu segundo factor.`}><CButton variant="primary" className="w-full" onClick={onDone}>Ir al inicio de sesión</CButton></AuthCard>;
  return (
    <AuthCard title="Invitación al Control Center" sub="Elige tu contraseña. Después configurarás tu segundo factor.">
      {!token ? <ErrorLine message="El enlace no trae invitación. Pide uno nuevo." /> : (
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); run(async () => { const r = await api<{ email: string }>('POST', '/admin/admins/accept', { token, password }); setDone(r.email); }); }}>
          <CField label="Contraseña" htmlFor="cc-apass" hint="Mínimo 12 caracteres."><input id="cc-apass" className="cc-input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></CField>
          {error && <p className="text-[12.5px] text-[#FDA29B]" role="alert">{error}</p>}
          <CButton variant="primary" type="submit" disabled={busy || password.length < 12}>Crear cuenta</CButton>
        </form>
      )}
    </AuthCard>
  );
}

// ---------- Área de trabajo ----------
const NAV: [string, string, React.ReactNode][] = [
  ['/vlux-admin', 'Resumen', <LayoutGrid size={16} key="r" />],
  ['/vlux-admin/negocios', 'Negocios', <Building2 size={16} key="n" />],
  ['/vlux-admin/estudio', 'Estudio de marca', <Palette size={16} key="s" />],
  ['/vlux-admin/planes', 'Planes', <CreditCard size={16} key="p" />],
  ['/vlux-admin/equipo', 'Equipo y sesiones', <Users size={16} key="e" />],
  ['/vlux-admin/bitacora', 'Bitácora', <ScrollText size={16} key="b" />],
];

function Workspace({ me, path, onLogout }: { me: NonNullable<Me>; path: string; onLogout: () => void }) {
  const current = (to: string) => (to === '/vlux-admin' ? path === to || path === '/vlux-admin/' : path.startsWith(to));
  const detail = path.match(/^\/vlux-admin\/negocios\/([0-9a-f-]{36})$/);
  let view: React.ReactNode;
  if (path === '/vlux-admin/negocios/nuevo') view = <Wizard />;
  else if (detail) view = <BusinessDetail id={detail[1]} />;
  else if (path.startsWith('/vlux-admin/negocios')) view = <Directory />;
  else if (path.startsWith('/vlux-admin/estudio')) view = <Studio />;
  else if (path.startsWith('/vlux-admin/planes')) view = <Plans />;
  else if (path.startsWith('/vlux-admin/equipo')) view = <Team me={me} />;
  else if (path.startsWith('/vlux-admin/bitacora')) view = <AuditLog />;
  else view = <Dashboard />;

  return (
    <div className="cc flex min-h-full">
      <aside className="hidden lg:flex w-[232px] shrink-0 flex-col border-r border-[color:var(--cc-line)] px-3 py-5 sticky top-0 h-screen">
        <div className="px-2"><Wordmark /></div>
        <CButton variant="primary" className="mt-7 mx-1" onClick={() => navigate('/vlux-admin/negocios/nuevo')}><Plus size={15} /> Nuevo negocio</CButton>
        <nav className="mt-5 flex flex-col gap-0.5" aria-label="Control Center">
          {NAV.map(([to, label, icon]) => (
            <a key={to} href={to} aria-current={current(to) ? 'page' : undefined} className="cc-nav-item" onClick={(e) => { e.preventDefault(); navigate(to); }}>{icon} {label}</a>
          ))}
        </nav>
        <div className="mt-auto px-2 pt-4 border-t border-[color:var(--cc-line)]">
          <div className="flex items-center gap-2 text-[12px] cc-muted"><ShieldCheck size={14} className="text-[#67C7D3]" /> 2FA verificado</div>
          <div className="mt-2 text-[13px] truncate">{me.displayName}</div>
          <div className="text-[11.5px] cc-faint truncate">{me.email}</div>
          <CButton variant="ghost" small className="mt-3 -ml-2" onClick={onLogout}><LogOut size={14} /> Cerrar sesión</CButton>
        </div>
      </aside>
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="lg:hidden sticky top-0 z-30 border-b border-[color:var(--cc-line)] bg-[#08090B]/90 backdrop-blur gutter py-3">
          <div className="flex items-center justify-between gap-3">
            <Wordmark small />
            <div className="flex gap-1">
              <CButton small variant="primary" onClick={() => navigate('/vlux-admin/negocios/nuevo')} aria-label="Nuevo negocio"><Plus size={14} /></CButton>
              <CButton small variant="ghost" onClick={onLogout} aria-label="Cerrar sesión"><LogOut size={14} /></CButton>
            </div>
          </div>
          <nav className="mt-3 flex gap-1 overflow-x-auto cc-scroll -mx-1 px-1" aria-label="Control Center">
            {NAV.map(([to, label, icon]) => (
              <a key={to} href={to} aria-current={current(to) ? 'page' : undefined} className="cc-nav-item shrink-0" onClick={(e) => { e.preventDefault(); navigate(to); }}>{icon} {label}</a>
            ))}
          </nav>
        </header>
        <main className="flex-1 gutter lg:px-10 py-7 lg:py-9 max-w-[1240px] w-full">
          <div className="view-in" key={path}>{view}</div>
        </main>
        <footer className="gutter lg:px-10 pb-6 text-[11px] cc-faint flex items-center gap-2"><Activity size={12} /> Sin cobros automáticos · cada acción queda en la bitácora</footer>
      </div>
    </div>
  );
}
