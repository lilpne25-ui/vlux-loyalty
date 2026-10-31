// "Para tu negocio": explicación comercial para dueños que prueban la demo.
import React from 'react';
import { Gift, BarChart3, Star, QrCode, ScanLine, CheckCircle2, ArrowRight } from 'lucide-react';
import { Button, VluxMark } from '../components/ui';

type Props = { goTo: (path: string) => void };

export function ForBusinessView({ goTo }: Props) {
  return (
    <div className="biz-bg min-h-full">
      <div className="mx-auto w-full max-w-[1040px] gutter py-10 sm:py-14 flex flex-col gap-12">
        <header className="max-w-[720px]">
          <VluxMark className="text-[#475467]" />
          <div className="mt-5 text-[12px] uppercase tracking-[0.16em] text-slate2">Para tu negocio</div>
          <h1 className="mt-2 text-[32px] sm:text-[44px] leading-[1.05] font-semibold tracking-tight text-ink text-balance">Haz que tus clientes tengan una razón más para regresar.</h1>
          <p className="mt-4 text-[16px] text-[#475467] leading-relaxed max-w-[600px]">Tu tarjeta de sellos de siempre, ahora en el teléfono de tus clientes. Sin app que descargar y sin cartoncitos que se pierden.</p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button onClick={() => document.getElementById('demo-form')?.scrollIntoView({ behavior: 'smooth' })}>Probar la demostración <ArrowRight size={16} /></Button>
            <Button variant="secondary" onClick={() => goTo('/acceso')}>Acceso para negocios</Button>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-3">
          {[
            { icon: <Gift size={18} />, t: 'Recompensa a tus clientes frecuentes', d: 'Cada compra suma un sello. Al completar la tarjeta, el cliente recibe el premio que tú eliges.' },
            { icon: <BarChart3 size={18} />, t: 'Conoce cuántos regresan', d: 'Ves cuántos clientes tienes, cuántos volvieron y cuántos premios entregaste, sin hojas de cálculo.' },
            { icon: <Star size={18} />, t: 'Facilita que compartan su experiencia en Google', d: 'Desde su segunda visita, la tarjeta invita a dejar una opinión. Siempre voluntaria y sin premios a cambio.' },
          ].map((x) => (
            <div key={x.t} className="panel p-5 flex flex-col gap-3">
              <div className="h-10 w-10 rounded-xl bg-ink text-white inline-flex items-center justify-center">{x.icon}</div>
              <h3 className="text-[16px] font-semibold text-ink leading-snug">{x.t}</h3>
              <p className="text-[13.5px] text-[#475467] leading-relaxed">{x.d}</p>
            </div>
          ))}
        </section>

        <section>
          <h2 className="text-[20px] font-semibold text-ink">Así funciona en tu mostrador</h2>
          <ol className="mt-5 grid gap-4 sm:grid-cols-3">
            {[
              { icon: <QrCode size={18} />, t: 'El cliente escanea', d: 'Un QR impreso en caja abre su tarjeta. Solo pide su nombre.' },
              { icon: <ScanLine size={18} />, t: 'Caja agrega el sello', d: 'Tu equipo escanea la tarjeta del cliente con su teléfono y registra la compra en segundos.' },
              { icon: <Gift size={18} />, t: 'Se entrega el premio', d: 'Al completar los sellos, caja confirma el canje y empieza un ciclo nuevo.' },
            ].map((x, i) => (
              <li key={x.t} className="flex gap-4">
                <span className="h-9 w-9 shrink-0 rounded-full border border-line bg-white inline-flex items-center justify-center text-[13px] font-semibold text-ink tabular-nums">{i + 1}</span>
                <div>
                  <div className="text-[15px] font-medium text-ink inline-flex items-center gap-2">{x.t}</div>
                  <p className="text-[13.5px] text-[#475467] mt-1 leading-relaxed">{x.d}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-6 flex flex-wrap gap-2 text-[13px]">
            <span className="text-slate2">El QR del cliente solo identifica su tarjeta: cada sello lo autoriza una persona de tu equipo con su propia cuenta.</span>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] items-start" id="demo-form">
          <div className="rounded-2xl bg-ink text-white p-6 sm:p-7 flex flex-col gap-4 price-card">
            <div className="text-[12px] uppercase tracking-[0.16em] text-white/50">Propuesta de prueba</div>
            <div className="text-[22px] font-semibold">VLUX Loyalty</div>
            <div className="flex items-baseline gap-2">
              <span className="text-white/60 text-[14px]">Desde</span>
              <span className="text-[40px] font-semibold tracking-tight tabular-nums">$299</span><span className="sr-only">(precio de referencia)</span>
              <span className="text-white/60 text-[14px]">MXN mensuales</span>
            </div>
            <p className="text-[13.5px] text-white/70">Instalación y personalización disponibles.</p>
            <ul className="flex flex-col gap-2 text-[13.5px] text-white/85">
              {['Tarjeta con tu nombre, colores y premio', 'Panel para caja y panel para el dueño', 'QR para tu mostrador', 'Invitación a reseñas en Google'].map((t) => (
                <li key={t} className="flex gap-2"><CheckCircle2 size={16} className="shrink-0 mt-[2px] text-[#67C7D3]" /> {t}</li>
              ))}
            </ul>
            <p className="text-[11.5px] text-white/45 leading-snug">Precio de referencia para pilotos en Toluca y Metepec, sujeto a confirmación. Pases en Apple Wallet y Google Wallet en preparación.</p>
          </div>

          <div className="panel p-5 sm:p-6 flex flex-col gap-4">
            <h3 className="text-[18px] font-semibold text-ink">Pruébalo en tu teléfono</h3>
            <p className="text-[13.5px] text-[#475467] leading-relaxed">Estos negocios son de demostración y usan datos sintéticos. Abre la tarjeta en un teléfono y la caja en otro: verás el sello llegar en segundos.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="secondary" onClick={() => goTo('/n/cafe-demo-toluca')}>Tarjeta · Café Demo Toluca</Button>
              <Button variant="secondary" onClick={() => goTo('/n/barberia-demo-metepec')}>Tarjeta · Barbería Demo Metepec</Button>
            </div>
            <Button onClick={() => goTo('/acceso')}>Acceso para negocios <ArrowRight size={16} /></Button>
            <p className="text-[11.5px] text-slate2">Para contratar o pedir una demostración guiada, contacta a tu asesor de VLUX.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
