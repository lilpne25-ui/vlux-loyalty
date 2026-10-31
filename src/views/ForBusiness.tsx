// "Para tu negocio": explicación comercial para dueños que prueban la demo.
import React, { useState } from 'react';
import { Gift, BarChart3, Star, QrCode, Coffee, CheckCircle2, ArrowRight } from 'lucide-react';
import { State, Command, Result } from '../domain/model';
import { Button, Field, inputCls, VluxMark, useToast, cx } from '../components/ui';

type Props = { state: State; run: (c: Command) => Result; goTo: (v: 'cliente' | 'empleado' | 'dueno') => void };

export function ForBusinessView({ state, run, goTo }: Props) {
  const toast = useToast();
  const [form, setForm] = useState({ businessName: '', category: 'Cafetería', contact: '', city: 'Toluca', message: '' });
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setError(null);
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const r = run({ type: 'submitDemoRequest', request: form });
    if (!r.ok) return setError(r.message!);
    setSent(true);
    toast('good', 'Solicitud guardada en este dispositivo.');
  };

  return (
    <div className="biz-bg min-h-full">
      <div className="mx-auto w-full max-w-[1040px] gutter py-10 sm:py-14 flex flex-col gap-12">
        <header className="max-w-[720px]">
          <VluxMark className="text-[#475467]" />
          <div className="mt-5 text-[12px] uppercase tracking-[0.16em] text-slate2">Para tu negocio</div>
          <h1 className="mt-2 text-[32px] sm:text-[44px] leading-[1.05] font-semibold tracking-tight text-ink text-balance">Haz que tus clientes tengan una razón más para regresar.</h1>
          <p className="mt-4 text-[16px] text-[#475467] leading-relaxed max-w-[600px]">Tu tarjeta de sellos de siempre, ahora en el teléfono de tus clientes. Sin app que descargar y sin cartoncitos que se pierden.</p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button onClick={() => document.getElementById('demo-form')?.scrollIntoView({ behavior: 'smooth' })}>Solicitar una demostración <ArrowRight size={16} /></Button>
            <Button variant="secondary" onClick={() => goTo('cliente')}>Probar como cliente</Button>
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
              { icon: <Coffee size={18} />, t: 'Caja agrega el sello', d: 'Tu barista escanea la tarjeta del cliente y registra la visita en segundos.' },
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
            <button className="underline underline-offset-4 text-ink" onClick={() => goTo('empleado')}>Ver el panel del empleado</button>
            <span className="text-slate2">·</span>
            <button className="underline underline-offset-4 text-ink" onClick={() => goTo('dueno')}>Ver el panel del dueño</button>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] items-start" id="demo-form">
          <div className="rounded-2xl bg-ink text-white p-6 sm:p-7 flex flex-col gap-4 price-card">
            <div className="text-[12px] uppercase tracking-[0.16em] text-white/50">Propuesta de prueba</div>
            <div className="text-[22px] font-semibold">VLUX Loyalty</div>
            <div className="flex items-baseline gap-2">
              <span className="text-white/60 text-[14px]">Desde</span>
              <span className="text-[40px] font-semibold tracking-tight tabular-nums">$299</span>
              <span className="text-white/60 text-[14px]">MXN mensuales</span>
            </div>
            <p className="text-[13.5px] text-white/70">Instalación y personalización disponibles.</p>
            <ul className="flex flex-col gap-2 text-[13.5px] text-white/85">
              {['Tarjeta con tu nombre, colores y premio', 'Panel para caja y panel para el dueño', 'QR para tu mostrador', 'Invitación a reseñas en Google'].map((t) => (
                <li key={t} className="flex gap-2"><CheckCircle2 size={16} className="shrink-0 mt-[2px] text-[#67C7D3]" /> {t}</li>
              ))}
            </ul>
            <p className="text-[11.5px] text-white/45 leading-snug">Precio de referencia para pilotos en Toluca y Metepec. Pases en Apple Wallet y Google Wallet en preparación.</p>
          </div>

          <div className="panel p-5 sm:p-6">
            {sent ? (
              <div className="flex flex-col items-start gap-3 py-4">
                <div className="h-11 w-11 rounded-full bg-[#ECFDF3] text-[#067647] inline-flex items-center justify-center"><CheckCircle2 size={22} /></div>
                <h3 className="text-[18px] font-semibold text-ink">Gracias, {form.businessName}.</h3>
                <p className="text-[13.5px] text-[#475467] leading-relaxed">Tu solicitud quedó guardada en este dispositivo para la demostración. Todavía no se envía a ningún sistema externo, así que el equipo de VLUX la registra contigo en persona.</p>
                <p className="text-[12.5px] text-slate2">Solicitudes guardadas en este dispositivo: {state.demoRequests.length}</p>
                <Button variant="secondary" onClick={() => { setSent(false); setForm({ businessName: '', category: 'Cafetería', contact: '', city: 'Toluca', message: '' }); }}>Registrar otra</Button>
              </div>
            ) : (
              <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
                <h3 className="text-[18px] font-semibold text-ink">Solicitar una demostración</h3>
                <Field label="Nombre del negocio" htmlFor="dr-name">
                  <input id="dr-name" className={inputCls} value={form.businessName} onChange={(e) => set('businessName', e.target.value)} placeholder="Ej. Barbería Centro" />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Giro" htmlFor="dr-cat">
                    <select id="dr-cat" className={inputCls} value={form.category} onChange={(e) => set('category', e.target.value)}>
                      {['Cafetería', 'Restaurante', 'Barbería', 'Estética', 'Panadería', 'Otro'].map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </Field>
                  <Field label="Municipio" htmlFor="dr-city">
                    <select id="dr-city" className={inputCls} value={form.city} onChange={(e) => set('city', e.target.value)}>
                      {['Toluca', 'Metepec', 'Zinacantepec', 'Lerma', 'Otro'].map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="WhatsApp o correo" htmlFor="dr-contact">
                  <input id="dr-contact" className={inputCls} value={form.contact} onChange={(e) => set('contact', e.target.value)} placeholder="722 000 0000" />
                </Field>
                <Field label={<span>Comentarios <span className="font-normal text-slate2">(opcional)</span></span>} htmlFor="dr-msg">
                  <textarea id="dr-msg" rows={3} className={cx(inputCls, 'h-auto py-2.5 resize-y')} value={form.message} onChange={(e) => set('message', e.target.value)} placeholder="¿Cuántas sucursales tienes? ¿Qué premio te gustaría dar?" />
                </Field>
                {error && <p className="text-[13px] text-[#B42318]">{error}</p>}
                <Button type="submit" size="lg">Solicitar una demostración</Button>
                <p className="text-[11.5px] text-slate2">Demostración: los datos se guardan solo en este navegador y no se envían a ningún servicio.</p>
              </form>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
