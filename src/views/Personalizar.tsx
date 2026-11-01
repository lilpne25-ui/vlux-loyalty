// V0.4.2 · Estudio de marca público: personaliza una tarjeta con tu logo. Todo ocurre en el navegador
// (nada se sube ni se crea en el servidor). Dar de alta un negocio real pasa por el equipo de VLUX.
import { Studio } from '../admin/Studio';
import { navigate } from '../lib/router';

export default function PersonalizarView() {
  return (
    <div className="cc relative flex flex-col min-h-full overflow-hidden" data-testid="public-studio">
      <div className="cc-grid-bg absolute inset-x-0 top-0 h-[420px] pointer-events-none" aria-hidden />
      <header className="relative border-b border-white/10">
        <div className="mx-auto max-w-[1240px] px-5 h-[64px] flex items-center justify-between">
          <a href="/" onClick={(e) => { e.preventDefault(); navigate('/'); }} className="flex items-center gap-2.5" aria-label="VLUX Loyalty, inicio">
            <img src="/brand/vlux-isotipo.png" alt="" width="30" height="31" className="h-[30px] w-auto" />
            <span className="font-display text-[17px] tracking-wide">VLUX Loyalty</span>
          </a>
          <a href="/" onClick={(e) => { e.preventDefault(); navigate('/'); }} className="text-[13px] text-white/70 hover:text-white">Volver al inicio</a>
        </div>
      </header>
      <main className="relative flex-1 mx-auto w-full max-w-[1240px] px-5 py-8">
        <Studio publicMode />
      </main>
    </div>
  );
}
