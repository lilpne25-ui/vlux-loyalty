// Contenedor y rutas. V0.2 elimina el selector "Soy cliente / empleado / dueño" de V0.1:
// cada persona entra por su propia ruta y el servidor decide qué puede ver.
//   /             presentación para negocios
//   /n/:slug      tarjeta del cliente (llega desde el QR del mostrador)
//   /acceso       inicio de sesión del personal
//   /caja         panel del empleado (empleado o dueño)
//   /panel        panel del dueño (solo dueño)
//   /panel/cartel cartel del QR para imprimir a tamaño carta o A5 (1.0.x, solo dueño)
//   /cuenta       cambio de contraseña del personal
//   /t#token      abre la tarjeta desde el enlace personal
//   /restablecer#token  contraseña nueva con enlace de un solo uso
//   /invitacion#token   aceptar invitación de dueño o empleado (V0.3)
//   /activar            activación presencial con código corto (V0.4.6)
//   ?negocio=<slug>     en /acceso, /caja y /panel: abre ESE negocio (enlaces permanentes y apps instaladas, V0.4.6)
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
import { LandingView } from './views/Landing';
import { LoginView } from './views/Login';
import { CardLinkView, ChangePasswordPanel, ResetPasswordView } from './views/Account';
import { ActivateWithCodeView, InvitationView } from './views/Invitation';
import PosterPrintView from './views/PosterPrint';

const AdminApp = lazy(() => import('./admin/AdminApp'));
const PersonalizarView = lazy(() => import('./views/Personalizar'));

/** Negocios de demostración anteriores (V0.1–V0.4.1): sus rutas públicas ya no son la experiencia principal. */
const LEGACY_DEMO_SLUGS = new Set(['cafe-demo-toluca', 'barberia-demo-metepec']);

export default function App() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  );
}

type SessionState = { loading: boolean; session: StaffSessionInfo | null; colors: { primary: string; accent: string; vertical: string; finish?: 'signature' | 'silver' | 'black' } | null };

function Redirect({ to }: { to: string }) {
  useEffect(() => { navigate(to, { replace: true }); }, [to]);
  return <Loading />;
}

function Shell() {
  const { path, search } = useLocation();
  const [s, setS] = useState<SessionState>({ loading: true, session: null, colors: null });

  const loadSession = useCallback(async () => {
    try {
      const r = await api<{ session: StaffSessionInfo | null }>('GET', '/staff/me');
      let colors = null;
      if (r.session) {
        const b = await api('GET', '/staff/business');
        colors = { primary: b.primaryColor, accent: b.accentColor, vertical: b.vertical, finish: b.cardFinish };
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
  if (path === '/activar') return <ActivateWithCodeView />;
  if (path === '/t') return <CardLinkView />;
  if (path === '/restablecer') return <ResetPasswordView />;

  if (path === '/personalizar') return <Suspense fallback={<div className="lp min-h-full" />}><PersonalizarView /></Suspense>;

  const customerMatch = path.match(/^\/n\/([a-z0-9-]{3,40})\/?$/);
  if (customerMatch && LEGACY_DEMO_SLUGS.has(customerMatch[1])) return <Redirect to="/?demo=anterior" />;
  if (customerMatch) return <CustomerApp slug={customerMatch[1]} />;

  if (!isStaffRoute) {
    return (
      <div className="app-root flex flex-col min-h-full">
        {search.get('demo') === 'anterior' && <div className="gutter py-2 text-center text-[12.5px] bg-[#0E1115] text-white/80" role="status">Esa demostración anterior ya no está disponible. Estas son las experiencias actuales de VLUX Loyalty.</div>}
        {search.get('enlace') === 'invalido' && <div className="gutter py-2 text-center text-[12.5px] bg-[#FEF3F2] text-[#B42318]">Ese enlace de tarjeta no es válido o ya no está activo.</div>}
        <LandingView />
      </div>
    );
  }

  if (s.loading) return <Loading />;
  const session = s.session;
  const wanted = search.get('negocio');
  const home = (role: 'OWNER' | 'EMPLOYEE', slug?: string) => `${role === 'OWNER' ? '/panel' : '/caja'}${slug ? `?negocio=${encodeURIComponent(slug)}` : ''}`;
  if (!session || path === '/acceso') {
    if (session && (!wanted || wanted === session.business.slug)) {
      navigate(home(session.role, session.business.slug), { replace: true });
      return <Loading />;
    }
    if (!session) return <LoginView businessSlug={wanted} onLoggedIn={async (ses) => { await loadSession(); navigate(home(ses.role, ses.business.slug), { replace: true }); }} />;
  }
  // V0.4.6 · La app instalada (o el enlace permanente) es de un negocio concreto. Si la sesión abierta es de OTRO negocio,
  // nunca se muestran sus datos bajo este ícono: se cambia de negocio solo si la persona también pertenece a él;
  // si no, se explica y se ofrece entrar con otra cuenta.
  if (wanted && wanted !== session.business.slug) {
    return <BusinessGate wanted={wanted} session={session} onSwitched={async (role) => { await loadSession(); navigate(home(role, wanted), { replace: true }); }}
      onLogout={async () => { await api('POST', '/staff/logout', {}).catch(() => undefined); setS({ loading: false, session: null, colors: null }); navigate(`/acceso?negocio=${encodeURIComponent(wanted)}`, { replace: true }); }}
      onStay={() => navigate(home(session.role, session.business.slug), { replace: true })} />;
  }

  // 1.0.x · Ruta de impresión del cartel: sin barra superior ni pestañas (solo el cartel y sus botones).
  if (path === '/panel/cartel' && session.role === 'OWNER' && !session.mustChangePassword) {
    return <PosterPrintView initialSize={search.get('tam') === 'a5' ? 'a5' : 'letter'} />;
  }

  const logout = async () => {
    await api('POST', '/staff/logout', {}).catch(() => undefined);
    setS({ loading: false, session: null, colors: null });
    navigate(`/acceso?negocio=${encodeURIComponent(session.business.slug)}`, { replace: true });
  };

  const wantsPanel = path.startsWith('/panel');
  const forbidden = wantsPanel && session.role !== 'OWNER';
  const code = search.get('tarjeta') || search.get('premio');

  return (
    <div className="app-root flex flex-col min-h-full" data-vertical={s.colors?.vertical} style={s.colors ? brandVars(s.colors.primary, s.colors.accent, s.colors.finish) : undefined}>
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
            <OwnerView onBusinessChanged={loadSession} welcome={search.get('bienvenida') === '1'} />
          ) : (
            <EmployeeView businessName={session.business.name} businessSlug={session.business.slug} initialCode={code} />
          )}
        </div>
      </main>
    </div>
  );
}

function BusinessGate({ wanted, session, onSwitched, onLogout, onStay }: { wanted: string; session: StaffSessionInfo; onSwitched: (role: 'OWNER' | 'EMPLOYEE') => void; onLogout: () => void; onStay: () => void }) {
  const [state, setState] = useState<'checking' | 'other'>('checking');
  const [name, setName] = useState<string>(wanted);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const mine = await api<{ businesses: { slug: string; name: string; role: 'OWNER' | 'EMPLOYEE' }[] }>('GET', '/staff/businesses');
        if (mine.businesses.some((b) => b.slug === wanted)) {
          const r = await api<{ session: StaffSessionInfo }>('POST', '/staff/switch', { slug: wanted });
          if (live) onSwitched(r.session.role);
          return;
        }
      } catch { /* sin acceso a ese negocio */ }
      try { const p = await api<{ business: { name: string } }>('GET', `/public/businesses/${encodeURIComponent(wanted)}`); if (live) setName(p.business.name); } catch { /* negocio inexistente */ }
      if (live) setState('other');
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted]);
  if (state === 'checking') return <Loading />;
  return (
    <div className="biz-bg min-h-full">
      <div className="mx-auto w-full max-w-[440px] gutter py-14 flex flex-col gap-5" data-testid="business-gate">
        <VluxMark className="text-[#475467]" />
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">Este acceso es de {name}</h1>
        <p className="text-[14px] text-slate2">Tu sesión abierta en este teléfono es de <strong className="text-ink">{session.business.name}</strong> y esa cuenta no tiene acceso a {name}. Por seguridad no mostramos datos de un negocio con el acceso de otro.</p>
        <div className="flex flex-col gap-2">
          <button onClick={onLogout} className="h-11 rounded-xl bg-ink text-white text-[14px] font-medium">Entrar con la cuenta de {name}</button>
          <button onClick={onStay} className="h-11 rounded-xl border border-line text-[14px] text-ink">Seguir en {session.business.name}</button>
        </div>
      </div>
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
          <VluxMark tone="dark" />
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
