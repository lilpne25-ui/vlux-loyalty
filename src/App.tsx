// Contenedor: selector "Explorar experiencia", guía de demostración y restablecer.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Smartphone, ScanLine, LayoutDashboard, Briefcase, RotateCcw, ListChecks, Check, X } from 'lucide-react';
import { useStore, storageAvailable } from './lib/store';
import { State, opsOf, redeemedRewardsOf } from './domain/model';
import { ToastProvider, Modal, Button, VluxMark, cx } from './components/ui';
import { CustomerView } from './views/Customer';
import { EmployeeView } from './views/Employee';
import { OwnerView } from './views/Owner';
import { ForBusinessView } from './views/ForBusiness';

type View = 'cliente' | 'empleado' | 'dueno' | 'negocio';
const VIEWS: View[] = ['cliente', 'empleado', 'dueno', 'negocio'];

function readHash(): View {
  const h = (typeof location !== 'undefined' ? location.hash : '').replace('#', '') as View;
  return VIEWS.includes(h) ? h : 'cliente';
}

function luminance(hex: string) {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export default function App() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  );
}

function Shell() {
  const { state, run, reset } = useStore();
  const [view, setView] = useState<View>(readHash);
  const [resetOpen, setResetOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [persisted] = useState(storageAvailable);

  useEffect(() => {
    const onHash = () => setView(readHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = useCallback((v: View) => {
    setView(v);
    try {
      if (location.hash !== '#' + v) location.hash = v;
    } catch {}
    window.scrollTo({ top: 0 });
  }, []);

  const b = state.business;
  const light = luminance(b.primary) > 0.4;
  const brandVars = {
    ['--brand' as any]: b.primary,
    ['--accent' as any]: b.accent,
    ['--cream' as any]: light ? '#1E140F' : '#F5ECDF',
    ['--on-brand' as any]: light ? '#1E140F' : '#FBF7F1',
  } as React.CSSProperties;

  return (
    <div className="app-root flex flex-col min-h-full" style={brandVars}>
      <TopBar view={view} go={go} onReset={() => setResetOpen(true)} onGuide={() => setGuideOpen(true)} steps={guideSteps(state).filter((s) => s.done).length} />
      <main className="flex-1" key={view}>
        <div className="view-in min-h-full">
          {view === 'cliente' && <CustomerView state={state} run={run} />}
          {view === 'empleado' && <EmployeeView state={state} run={run} />}
          {view === 'dueno' && <OwnerView state={state} run={run} />}
          {view === 'negocio' && <ForBusinessView state={state} run={run} goTo={go} />}
        </div>
      </main>
      {!persisted && (
        <div className="text-center text-[11.5px] text-slate2 py-2 bg-[#F6F7F9] border-t border-line gutter">Este navegador no permite guardar datos: la demo funciona, pero se reinicia al recargar.</div>
      )}

      <Modal open={resetOpen} onClose={() => setResetOpen(false)} title="Restablecer la demostración" labelledBy="reset-title">
        <p className="text-[14px] text-[#475467] leading-relaxed">Se borran las tarjetas creadas en esta demo, sus sellos y canjes, la configuración y las solicitudes. Los clientes de ejemplo vuelven a su estado inicial.</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => setResetOpen(false)}>Cancelar</Button>
          <Button variant="danger" onClick={() => { reset(); setResetOpen(false); go('cliente'); }}><RotateCcw size={15} /> Restablecer</Button>
        </div>
      </Modal>

      <Modal open={guideOpen} onClose={() => setGuideOpen(false)} title="Recorrido de demostración" labelledBy="guide-title">
        <p className="text-[13px] text-slate2 mb-4">Ideal para enseñar el producto en 3 minutos. Cada paso se marca solo cuando ocurre.</p>
        <ol className="flex flex-col gap-1">
          {guideSteps(state).map((s, i) => (
            <li key={i}>
              <button onClick={() => { go(s.view); setGuideOpen(false); }} className="w-full flex items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-[#F6F7F9]">
                <span className={cx('h-7 w-7 shrink-0 rounded-full inline-flex items-center justify-center text-[12px] font-semibold tabular-nums', s.done ? 'bg-ink text-white' : 'border border-line text-slate2')}>{s.done ? <Check size={14} strokeWidth={3} /> : i + 1}</span>
                <span className="flex-1 min-w-0">
                  <span className={cx('block text-[13.5px]', s.done ? 'text-slate2 line-through decoration-[#C9CED6]' : 'text-ink font-medium')}>{s.title}</span>
                  <span className="block text-[12px] text-slate2">{s.where}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </Modal>
    </div>
  );
}

function guideSteps(state: State) {
  const mine = state.myCardId ? state.cards.find((c) => c.id === state.myCardId && !c.isSample) : null;
  const ops = mine ? opsOf(state, mine.id) : [];
  return [
    { title: 'Crear una tarjeta como cliente', where: 'Soy cliente', view: 'cliente' as View, done: !!mine },
    { title: 'Cambiar al panel del empleado', where: 'Soy empleado', view: 'empleado' as View, done: !!mine && state.demo.visitedEmployee },
    { title: 'Registrar una compra', where: 'Soy empleado · Registrar visita y agregar sello', view: 'empleado' as View, done: ops.some((o) => o.type === 'stamp') },
    { title: 'Regresar a la tarjeta del cliente', where: 'Soy cliente', view: 'cliente' as View, done: state.demo.sawNewStamp },
    { title: 'Comprobar que apareció el sello nuevo', where: 'El sello se anima al entrar', view: 'cliente' as View, done: state.demo.sawNewStamp },
    { title: 'Simular visitas adicionales', where: 'Soy empleado · Modo de prueba', view: 'empleado' as View, done: ops.some((o) => o.type === 'stamp' && o.testMode) },
    { title: 'Desbloquear y canjear la recompensa', where: 'Soy empleado · Confirmar canje', view: 'empleado' as View, done: !!mine && redeemedRewardsOf(state, mine.id).length > 0 },
    { title: 'Consultar las estadísticas como dueño', where: 'Soy dueño', view: 'dueno' as View, done: state.demo.ownerAfterRedeem },
  ];
}

function TopBar({ view, go, onReset, onGuide, steps }: { view: View; go: (v: View) => void; onReset: () => void; onGuide: () => void; steps: number }) {
  const items: [View, string, React.ReactNode][] = [
    ['cliente', 'Soy cliente', <Smartphone size={15} key="c" />],
    ['empleado', 'Soy empleado', <ScanLine size={15} key="e" />],
    ['dueno', 'Soy dueño', <LayoutDashboard size={15} key="d" />],
  ];
  return (
    <header className="topbar sticky z-30 text-white" style={{ top: 'env(safe-area-inset-top, 0px)' }}>
      <div className="mx-auto max-w-[1180px] gutter py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2.5">
        <div className="flex items-center gap-2.5 mr-auto">
          <VluxMark className="text-white" />
          <span className="h-3.5 w-px bg-white/20" />
          <span className="text-[13px] text-white/80">Loyalty</span>
          <span className="hidden sm:inline text-[10.5px] rounded-full border border-white/15 px-1.5 py-[1px] text-white/50 tracking-wide">V0.1 demo</span>
        </div>
        <div className="order-3 sm:order-none w-full sm:w-auto flex items-center gap-2">
          <span className="hidden md:inline text-[11.5px] text-white/45 whitespace-nowrap">Explorar experiencia</span>
          <div className="seg flex-1 sm:flex-none grid grid-cols-3 rounded-xl p-1" role="tablist" aria-label="Explorar experiencia">
            {items.map(([k, label, icon]) => (
              <button key={k} role="tab" aria-selected={view === k} onClick={() => go(k)} className={cx('h-8 px-2 sm:px-3 rounded-lg text-[12.5px] font-medium inline-flex items-center justify-center gap-1.5 transition whitespace-nowrap', view === k ? 'bg-white text-ink shadow' : 'text-white/70 hover:text-white')}>
                {icon} {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => go('negocio')} className={cx('h-8 px-2.5 rounded-lg text-[12.5px] inline-flex items-center gap-1.5 transition', view === 'negocio' ? 'bg-white/15 text-white' : 'text-white/70 hover:text-white hover:bg-white/10')}>
            <Briefcase size={14} /> <span>Para tu negocio</span>
          </button>
          <button onClick={onGuide} className="h-8 px-2.5 rounded-lg text-[12.5px] inline-flex items-center gap-1.5 text-white/70 hover:text-white hover:bg-white/10" aria-label="Recorrido de demostración">
            <ListChecks size={14} /> <span className="hidden sm:inline">Recorrido</span> <span className="tabular-nums text-[11px] text-[#67C7D3]">{steps}/8</span>
          </button>
          <button onClick={onReset} className="h-8 w-8 rounded-lg inline-flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10" aria-label="Restablecer demostración" title="Restablecer demostración">
            <RotateCcw size={14} />
          </button>
        </div>
      </div>
    </header>
  );
}
