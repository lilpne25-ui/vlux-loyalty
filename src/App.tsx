// Contenedor y rutas. V0.2 elimina el selector "Soy cliente / empleado / dueño" de V0.1:
// cada persona entra por su propia ruta y el servidor decide qué puede ver.
//   /             presentación para negocios
//   /n/:slug      tarjeta del cliente (llega desde el QR del mostrador)
//   /acceso       inicio de sesión del personal
//   /caja         panel del empleado (empleado o dueño)
//   /panel        panel del dueño (solo dueño)
//   /cuenta       cambio de contraseña del personal
//   /t#token      abre la tarjeta desde el enlace personal
//   /restablecer#token  contraseña nueva con enlace de un solo uso
//   /invitacion#token   aceptar invitación de dueño o empleado (V0.3)
//   /vlux-admin/*       VLUX Control Center (V0.3, solo equipo VLUX; se carga aparte)
import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { ScanLine, LayoutDashboard, LogOut, KeyRound, ArrowLeftRight } from 'lucide-react';
import { api, StaffSessionInfo } from './lib/api';
import { navigate, useLocation } from './lib/router';
import { ToastProvider, VluxMark, cx } from './components/ui';
import { brandVars, Loading } from './components/Brand';
import { CustomerApp } from './views/Customer';
import { EmployeeView } from './views/Employee';
import { OwnerView } from './views/Owner';
import { ForBusinessView } from './views/ForBusiness';
import { LoginView } from './views/Login';
import { CardLinkView, ChangePasswordPanel, ResetPasswordView } from './views/Account';
import { InvitationView } from './views/Invitation';

const AdminApp = lazy(() => import('./admin/AdminApp'));

export default function App() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  );
}

type SessionState = { loading: boolean; session: StaffSessionInfo | null; colors: { primary: string; accent: string; vertical: string } | null };

function Shell() {
  const { path, search } = useLocation();
  const [s, setS] = useState<SessionState>({ loading: true, session: null, colors: null });

  const loadSession = useCallback(async () => {
    try {
      const r = await api<{ session: StaffSessionInfo | null }>('GET', '/staff/me');
      let colors = null;
      if (r.session) {
        const b = await api('GET', '/staff/business');
        colors = { primary: b.primaryColor, accent: b.accentColor, vertical: b.vertical };
      }
      setS({ loading: false, session: r.session, colors });
    } catch {
      setS({ loading: false, session: null, colors: null });
    }
  }, []);

  const isStaffRoute = path === '/acceso' || path.startsWith('/caja') || path.startsWith('/panel') || path === '/cuenta';
  useEffect(() => { if (isStaffRoute) loadSession(); }, [isStaffRoute, loadSession]);

  if (path === '/vlux-admin' || path.startsWith('/vlux-admin/')) return <Suspense fallback={<div className="cc min-h-full" />}><AdminApp /></Suspense>;
  if (path === '/invitacion') return <InvitationView />;
  if (path === '/t') return <CardLinkView />;
  if (path === '/restablecer') return <ResetPasswordView />;

  const customerMatch = path.match(/^\/n\/([a-z0-9-]{3,40})\/?$/);
  if (customerMatch) return <CustomerApp slug={customerMatch[1]} />;

  if (!isStaffRoute) {
    return (
      <div className="app-root flex flex-col min-h-full">
        {search.get('enlace') === 'invalido' && <div className="gutter py-2 text-center text-[12.5px] bg-[#FEF3F2] text-[#B42318]">Ese enlace de tarjeta no es válido o ya no está activo.</div>}
        <ForBusinessView goTo={(p) => navigate(p)} />
      </div>
    );
  }

  if (s.loading) return <Loading />;
  const session = s.session;
  if (!session || path === '/acceso') {
    if (session) {
      navigate(session.role === 'OWNER' ? '/panel' : '/caja', { replace: true });
      return <Loading />;
    }
    return <LoginView onLoggedIn={async (ses) => { await loadSession(); navigate(ses.role === 'OWNER' ? '/panel' : '/caja', { replace: true }); }} />;
  }

  const logout = async () => {
    await api('POST', '/staff/logout', {}).catch(() => undefined);
    setS({ loading: false, session: null, colors: null });
    navigate('/acceso', { replace: true });
  };

  const wantsPanel = path.startsWith('/panel');
  const forbidden = wantsPanel && session.role !== 'OWNER';
  const code = search.get('tarjeta') || search.get('premio');

  return (
    <div className="app-root flex flex-col min-h-full" data-vertical={s.colors?.vertical} style={s.colors ? brandVars(s.colors.primary, s.colors.accent) : undefined}>
      <TopBar session={session} path={path} onLogout={logout} onSwitched={async (role) => { await loadSession(); navigate(role === 'OWNER' ? '/panel' : '/caja', { replace: true }); }} />
      <main className="flex-1">
        <div className="view-in min-h-full">
          {session.mustChangePassword || path === '/cuenta' ? (
            <ChangePasswordPanel forced={session.mustChangePassword} onDone={async () => { await loadSession(); navigate(session.role === 'OWNER' ? '/panel' : '/caja', { replace: true }); }} />
          ) : forbidden ? (
            <div className="mx-auto max-w-[520px] gutter py-16 text-center">
              <h1 className="text-[20px] font-semibold text-ink">Solo el dueño puede ver este panel</h1>
              <p className="mt-2 text-[14px] text-slate2">Tu cuenta es de caja. Si necesitas acceso, pídeselo al dueño del negocio.</p>
            </div>
          ) : wantsPanel ? (
            <OwnerView onBusinessChanged={loadSession} />
          ) : (
            <EmployeeView businessName={session.business.name} initialCode={code} />
          )}
        </div>
      </main>
    </div>
  );
}

function TopBar({ session, path, onLogout, onSwitched }: { session: StaffSessionInfo; path: string; onLogout: () => void; onSwitched: (role: 'OWNER' | 'EMPLOYEE') => void }) {
  const [businesses, setBusinesses] = useState<{ slug: string; name: string; role: 'OWNER' | 'EMPLOYEE' }[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => { api<{ businesses: typeof businesses }>('GET', '/staff/businesses').then((r) => setBusinesses(r.businesses)).catch(() => undefined); }, [session.business.slug]);
  const switchTo = async (slug: string) => {
    setOpen(false);
    try {
      const r = await api<{ session: StaffSessionInfo }>('POST', '/staff/switch', { slug });
      onSwitched(r.session.role);
    } catch { /* la sesión actual sigue igual */ }
  };
  const items: [string, string, React.ReactNode][] = [['/caja', 'Caja', <ScanLine size={15} key="c" />]];
  if (session.role === 'OWNER') items.push(['/panel', 'Panel', <LayoutDashboard size={15} key="p" />]);
  return (
    <header className="topbar sticky z-30 text-white" style={{ top: 'env(safe-area-inset-top, 0px)' }}>
      <div className="mx-auto max-w-[1180px] gutter py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2.5">
        <div className="flex items-center gap-2.5 mr-auto min-w-0">
          <VluxMark className="text-white" />
          <span className="h-3.5 w-px bg-white/20" />
          {businesses.length > 1 ? (
            <div className="relative min-w-0">
              <button onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="listbox" className="h-8 px-2 -ml-2 rounded-lg inline-flex items-center gap-1.5 text-[13px] text-white/85 hover:bg-white/10 max-w-[48vw]" data-testid="business-switcher">
                <span className="truncate">{session.business.name}</span> <ArrowLeftRight size={13} className="shrink-0 opacity-70" />
              </button>
              {open && (
                <ul role="listbox" aria-label="Cambiar de negocio" className="absolute left-0 mt-1.5 min-w-[240px] max-w-[80vw] rounded-xl bg-white text-ink shadow-xl border border-line py-1 z-40">
                  {businesses.map((b) => (
                    <li key={b.slug}>
                      <button role="option" aria-selected={b.slug === session.business.slug} onClick={() => b.slug !== session.business.slug && switchTo(b.slug)} className={cx('w-full text-left px-3.5 py-2.5 text-[13.5px] hover:bg-[#F5F6F8] flex justify-between gap-3', b.slug === session.business.slug && 'font-medium')}>
                        <span className="truncate">{b.name}</span><span className="text-[12px] text-slate2 shrink-0">{b.role === 'OWNER' ? 'Dueño' : 'Caja'}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <span className="text-[13px] text-white/80 truncate max-w-[40vw]">{session.business.name}</span>
          )}
        </div>
        <nav className="flex items-center gap-1" aria-label="Navegación">
          {items.map(([to, label, icon]) => (
            <button key={to} onClick={() => navigate(to)} aria-current={path.startsWith(to) ? 'page' : undefined} className={cx('h-8 px-3 rounded-lg text-[12.5px] font-medium inline-flex items-center gap-1.5 transition', path.startsWith(to) ? 'bg-white text-ink' : 'text-white/70 hover:text-white hover:bg-white/10')}>
              {icon} {label}
            </button>
          ))}
          <button onClick={() => navigate('/cuenta')} title={`${session.email} · cambiar contraseña`} aria-label="Cambiar contraseña" className="h-8 px-2 rounded-lg text-[11.5px] inline-flex items-center gap-1.5 text-white/60 hover:text-white hover:bg-white/10">
            <KeyRound size={13} /> <span className="hidden sm:inline truncate max-w-[140px]">{session.displayName}</span>
          </button>
          <button onClick={onLogout} className="h-8 px-2.5 rounded-lg text-[12.5px] inline-flex items-center gap-1.5 text-white/70 hover:text-white hover:bg-white/10" aria-label="Cerrar sesión">
            <LogOut size={14} /> <span className="hidden sm:inline">Salir</span>
          </button>
        </nav>
      </div>
    </header>
  );
}
