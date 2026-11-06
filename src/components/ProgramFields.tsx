// V0.4.5 · Editor del programa (motor común). Un solo componente para el alta del Control Center (tema oscuro)
// y el panel del dueño (tema claro). Plantillas por giro: sugerencias editables, nunca restricciones.
import React, { useState } from 'react';
import { ShieldAlert, X } from 'lucide-react';
import { HEALTH_NOTICE, PLANNED_PROGRAM_TYPES, PROGRAM_TYPE_INFO, PROGRAM_TYPES, verticalInfo, type ProgramType } from '../../shared/catalog';
import { LIMITS } from '../../shared/rules';
import { formFromTemplate, type ProgramForm } from '../lib/program-form';

type Theme = 'light' | 'cc';
const S = {
  light: {
    input: 'w-full h-11 rounded-xl border border-line bg-white px-3 text-[14px] text-ink outline-none focus:border-ink',
    label: 'text-[13px] font-medium text-ink', hint: 'text-[12px] text-slate2 leading-snug',
    choice: (on: boolean) => `text-left rounded-xl border px-3 py-2.5 transition ${on ? 'border-ink bg-[#F6F7F9]' : 'border-line hover:border-[#C9CED6]'}`,
    chip: (on: boolean) => `inline-flex items-center gap-1 rounded-full border px-2.5 h-8 text-[12.5px] ${on ? 'border-ink text-ink bg-[#F6F7F9]' : 'border-line text-slate2'}`,
    note: 'rounded-xl bg-[#FFF8EB] border border-[#F5D9A8] px-3.5 py-3 text-[12.5px] text-[#7A4B00] flex gap-2 leading-snug',
    sub: 'text-slate2',
  },
  cc: {
    input: 'cc-input', label: 'text-[12.5px] font-medium text-[#C5CBD3]', hint: 'text-[11.5px] cc-faint',
    choice: () => 'cc-choice', chip: (on: boolean) => `inline-flex items-center gap-1 rounded-full border px-2.5 h-8 text-[12.5px] ${on ? 'border-[#67C7D3] text-white' : 'border-white/15 cc-muted'}`,
    note: 'rounded-lg border border-[#F5B544]/40 px-3.5 py-3 text-[12.5px] text-[#F5C971] flex gap-2 leading-snug',
    sub: 'cc-muted',
  },
} as const;

function F({ t, id, label, hint, children, wide }: { t: Theme; id: string; label: string; hint?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`flex flex-col gap-1.5 min-w-0 ${wide ? 'sm:col-span-2' : ''}`}>
      <label htmlFor={id} className={S[t].label}>{label}</label>
      {children}
      {hint && <p className={S[t].hint}>{hint}</p>}
    </div>
  );
}

export function ProgramFields({ value: f, onChange, vertical, theme: t = 'light', idPrefix, lockedFamily }: {
  value: ProgramForm; onChange: (f: ProgramForm) => void; vertical: string; theme?: Theme; idPrefix: string;
  /** Si hay tarjetas con saldo, no se puede cambiar entre sellos y puntos (el servidor también lo impide). */
  lockedFamily?: 'stamps' | 'points' | null;
}) {
  const s = S[t];
  const v = verticalInfo(vertical);
  const [svc, setSvc] = useState('');
  const set = <K extends keyof ProgramForm>(k: K, x: ProgramForm[K]) => onChange({ ...f, [k]: x });
  const id = (x: string) => `${idPrefix}-${x}`;
  const type = f.programType;
  const points = type === 'points';
  const unit = PROGRAM_TYPE_INFO[type].unit;
  const setType = (pt: ProgramType) => {
    if (pt === type) return;
    const tpl = v.templates.find((x) => x.programType === pt);
    if (tpl) return onChange(formFromTemplate(tpl, f));
    onChange({ ...f, programType: pt, stampsRequired: pt === 'points' ? 500 : Math.min(Math.max(f.stampsRequired, LIMITS.stampsRequired.min), LIMITS.stampsRequired.max), maxStampsPerPurchase: pt === 'points' ? 500 : Math.min(f.maxStampsPerPurchase, 10) || 1 });
  };
  const addService = () => {
    const x = svc.trim().slice(0, 40);
    if (!x || f.eligibleServices.includes(x) || f.eligibleServices.length >= 20) return;
    set('eligibleServices', [...f.eligibleServices, x]); setSvc('');
  };
  const ordered = [...v.recommended, ...PROGRAM_TYPES.filter((p) => !v.recommended.includes(p))];

  return (
    <div className="grid sm:grid-cols-2 gap-4" data-testid="program-fields" data-program-type={type}>
      {v.regulated && (
        <div className={`${s.note} sm:col-span-2`} data-testid="health-notice"><ShieldAlert size={15} className="shrink-0 mt-[1px]" /><span>{HEALTH_NOTICE}</span></div>
      )}
      {v.templates.length > 0 && (
        <div className="sm:col-span-2 flex flex-col gap-2">
          <span className={s.label}>Plantillas sugeridas para {v.label.toLowerCase()}</span>
          <div className="flex flex-wrap gap-2">
            {v.templates.map((tpl) => {
              const fam = PROGRAM_TYPE_INFO[tpl.programType].family;
              const disabled = !!lockedFamily && fam !== lockedFamily;
              return (
                <button key={tpl.id} type="button" disabled={disabled} className={s.chip(f.programName === tpl.name && f.programType === tpl.programType)} onClick={() => onChange(formFromTemplate(tpl, f))} data-testid={`template-${tpl.id}`} title={disabled ? 'No disponible mientras haya tarjetas con saldo' : tpl.conditions}>
                  {tpl.name} · {PROGRAM_TYPE_INFO[tpl.programType].short}
                </button>
              );
            })}
          </div>
          <p className={s.hint}>{v.example} Es un punto de partida: todo se puede editar.</p>
        </div>
      )}
      <div className="sm:col-span-2 flex flex-col gap-2">
        <span className={s.label}>Tipo de programa</span>
        <div className="grid sm:grid-cols-3 gap-2" role="radiogroup" aria-label="Tipo de programa">
          {ordered.map((pt) => {
            const info = PROGRAM_TYPE_INFO[pt];
            const disabled = !!lockedFamily && info.family !== lockedFamily;
            return (
              <button key={pt} type="button" role="radio" aria-checked={type === pt} aria-pressed={type === pt} disabled={disabled} className={s.choice(type === pt)} onClick={() => setType(pt)} data-testid={`ptype-${pt}`}>
                <div className="text-[13.5px] font-medium">{info.label}{v.recommended[0] === pt && <span className={`ml-1 text-[11px] ${s.sub}`}>· sugerido</span>}</div>
                <div className={`mt-1 text-[12px] ${s.sub}`}>{disabled ? 'Bloqueado: hay tarjetas con saldo.' : info.how}</div>
              </button>
            );
          })}
        </div>
        <p className={s.hint}>Próximamente: {PLANNED_PROGRAM_TYPES.map((p) => p.label.toLowerCase()).join(', ')}.</p>
      </div>

      <F t={t} id={id('stamps')} label={points ? 'Puntos para la recompensa' : `${unit[1].charAt(0).toUpperCase()}${unit[1].slice(1)} para la recompensa`} hint={points ? `Entre ${LIMITS.pointsRequired.min} y ${LIMITS.pointsRequired.max.toLocaleString('es-MX')}.` : `Entre ${LIMITS.stampsRequired.min} y ${LIMITS.stampsRequired.max}. Los premios ya ganados se respetan.`}>
        <input id={id('stamps')} type="number" inputMode="numeric" className={`${s.input} tabular-nums`} value={f.stampsRequired} onChange={(e) => set('stampsRequired', Number(e.target.value))} />
      </F>
      <F t={t} id={id('reward')} label="Recompensa"><input id={id('reward')} className={s.input} maxLength={80} value={f.rewardDescription} onChange={(e) => set('rewardDescription', e.target.value)} /></F>

      {points && (
        <>
          <F t={t} id={id('ppp')} label="Pesos de consumo por 1 punto" hint="La caja escribe el monto de la cuenta. No se conecta al punto de venta.">
            <input id={id('ppp')} type="number" min={1} step="1" inputMode="decimal" className={`${s.input} tabular-nums`} value={f.pesosPerPoint} onChange={(e) => set('pesosPerPoint', Number(e.target.value))} />
          </F>
          <F t={t} id={id('max')} label="Tope de puntos por operación" hint="Protege contra montos capturados por error.">
            <input id={id('max')} type="number" min={1} className={`${s.input} tabular-nums`} value={f.maxStampsPerPurchase} onChange={(e) => set('maxStampsPerPurchase', Number(e.target.value))} />
          </F>
        </>
      )}
      {(type === 'stamps_purchase' || type === 'custom') && (
        <>
          <F t={t} id={id('mode')} label="¿Cuándo se gana?">
            <select id={id('mode')} className={s.input} value={f.stampMode} onChange={(e) => set('stampMode', e.target.value as ProgramForm['stampMode'])}>
              <option value="per_purchase">1 por compra</option>
              <option value="per_item">1 por artículo (con tope)</option>
            </select>
          </F>
          {f.stampMode === 'per_item' && (
            <F t={t} id={id('max')} label="Tope por compra"><input id={id('max')} type="number" min={1} max={10} className={`${s.input} tabular-nums`} value={f.maxStampsPerPurchase} onChange={(e) => set('maxStampsPerPurchase', Number(e.target.value))} /></F>
          )}
        </>
      )}
      {type === 'stamps_service' && (
        <>
          <div className="sm:col-span-2 flex flex-col gap-1.5">
            <label htmlFor={id('svc')} className={s.label}>Servicios participantes</label>
            <div className="flex flex-wrap gap-1.5" data-testid="service-list">
              {f.eligibleServices.map((x) => (
                <span key={x} className={s.chip(true)}>{x}<button type="button" aria-label={`Quitar ${x}`} onClick={() => set('eligibleServices', f.eligibleServices.filter((y) => y !== x))}><X size={12} /></button></span>
              ))}
            </div>
            <div className="flex gap-2">
              <input id={id('svc')} className={s.input} maxLength={40} placeholder="Ej. Corte" value={svc} onChange={(e) => setSvc(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addService(); } }} />
              <button type="button" className={s.chip(false)} onClick={addService}>Agregar</button>
            </div>
            <p className={s.hint}>Solo el nombre del servicio. No registres diagnósticos, tratamientos ni datos de salud.</p>
          </div>
          <F t={t} id={id('max')} label="Servicios que suman por visita"><input id={id('max')} type="number" min={1} max={10} className={`${s.input} tabular-nums`} value={f.maxStampsPerPurchase} onChange={(e) => set('maxStampsPerPurchase', Number(e.target.value))} /></F>
        </>
      )}
      <F t={t} id={id('window')} label="Una visita dura hasta" hint="Operaciones dentro de este tiempo cuentan como la misma visita.">
        <select id={id('window')} className={s.input} value={f.visitWindowMinutes} onChange={(e) => set('visitWindowMinutes', Number(e.target.value))}>
          {Array.from(new Set([30, 60, 120, 240, 480, f.visitWindowMinutes])).sort((a, b) => a - b).map((m) => <option key={m} value={m}>{m < 60 ? `${m} minutos` : `${m / 60} ${m === 60 ? 'hora' : 'horas'}`}</option>)}
        </select>
      </F>

      <details className="sm:col-span-2 group" data-testid="program-advanced">
        <summary className={`cursor-pointer select-none ${s.label}`}>Opciones avanzadas (nombre, condiciones, límites, vigencia)</summary>
        <div className="mt-3 grid sm:grid-cols-2 gap-4">
          <F t={t} id={id('pname')} label="Nombre del programa (opcional)"><input id={id('pname')} className={s.input} maxLength={60} value={f.programName} onChange={(e) => set('programName', e.target.value)} /></F>
          <F t={t} id={id('limit')} label="Máximo de operaciones con premio por día" hint="Vacío = sin límite. Ayuda a evitar abusos.">
            <input id={id('limit')} type="number" min={1} max={20} className={`${s.input} tabular-nums`} value={f.maxAwardsPerDay ?? ''} onChange={(e) => set('maxAwardsPerDay', e.target.value === '' ? null : Number(e.target.value))} />
          </F>
          <F t={t} id={id('unit1')} label="Unidad en singular (opcional)" hint={`Por defecto: ${unit[0]}.`}><input id={id('unit1')} className={s.input} maxLength={24} value={f.unitSingular} onChange={(e) => set('unitSingular', e.target.value)} /></F>
          <F t={t} id={id('unit2')} label="Unidad en plural (opcional)" hint={`Por defecto: ${unit[1]}.`}><input id={id('unit2')} className={s.input} maxLength={24} value={f.unitPlural} onChange={(e) => set('unitPlural', e.target.value)} /></F>
          <F t={t} id={id('valid')} label="Vigente hasta (opcional)" hint="Después de esta fecha no se suman nuevas unidades; los premios ganados se respetan."><input id={id('valid')} type="date" className={s.input} value={f.validUntil} onChange={(e) => set('validUntil', e.target.value)} /></F>
          <F t={t} id={id('cond')} label="Condiciones que ve el cliente" wide><textarea id={id('cond')} rows={2} maxLength={300} className={`${s.input} h-auto py-2`} value={f.conditions} onChange={(e) => set('conditions', e.target.value)} /></F>
        </div>
      </details>
    </div>
  );
}
