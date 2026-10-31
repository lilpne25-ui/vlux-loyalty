// Panel del empleado: identificar tarjeta, registrar visita, canjear premio e historial.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScanLine, Keyboard, Users, Search, Coffee, Gift, CheckCircle2, FlaskConical, ShieldAlert, Camera, ImageUp, History, ChevronRight, Ticket } from 'lucide-react';
import { State, Command, Result, customerOf, progressOf, normalizeCardInput, relativeTime, formatDateTime, OP_LABELS, opsOf, availableRewardOf } from '../domain/model';
import { Button, Badge, SampleBadge, Switch, inputCls, useToast, cx } from '../components/ui';
import { StampGrid } from '../components/LoyaltyCard';
import { decodeQrFromFile } from '../lib/qr';

type Props = { state: State; run: (c: Command) => Result };
// El modo de prueba se conserva al cambiar de vista durante la demo.
let testModeMemory = false;

export function EmployeeView({ state, run }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(state.myCardId);
  const [mode, setMode] = useState<'scan' | 'manual' | 'list'>(state.myCardId ? 'list' : 'list');
  const [testMode, setTestModeState] = useState(testModeMemory);
  const setTestMode = (v: boolean) => {
    testModeMemory = v;
    setTestModeState(v);
  };
  const toast = useToast();

  useEffect(() => {
    run({ type: 'demoFlag', flag: 'visitedEmployee' });
  }, [run]);

  const card = selectedId ? state.cards.find((c) => c.id === selectedId) || null : null;

  const select = (id: string) => {
    const norm = normalizeCardInput(id);
    const found = state.cards.find((c) => c.id === norm);
    if (!found) {
      toast('bad', `No encontramos la tarjeta ${norm || id}. Revisa el identificador.`);
      return false;
    }
    setSelectedId(found.id);
    toast('info', `Tarjeta de ${customerOf(state, found).name} identificada.`);
    return true;
  };

  return (
    <div className="dash-bg min-h-full">
      <div className="mx-auto w-full max-w-[1120px] gutter py-6 sm:py-8 flex flex-col gap-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[12px] uppercase tracking-[0.14em] text-slate2">{state.business.name} · Caja</div>
            <h1 className="text-[24px] sm:text-[28px] font-semibold tracking-tight text-ink">Panel del empleado</h1>
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-white border border-line px-3 py-2">
            <Switch id="test-mode" checked={testMode} onChange={setTestMode} label={<span className="inline-flex items-center gap-1.5"><FlaskConical size={14} /> Modo de prueba</span>} />
          </div>
        </header>

        <div className="rounded-xl border border-[#FEDF89] bg-[#FFFAEB] px-4 py-2.5 text-[12.5px] text-[#93370D] flex gap-2 leading-snug">
          <ShieldAlert size={15} className="shrink-0 mt-[1px]" />
          <span>Controles de demostración. En producción cada empleado inicia sesión, el servidor valida cada sello con un token firmado y bloquea duplicados y fraudes.</span>
        </div>

        <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)] items-start">
          <section className="panel p-4 sm:p-5 flex flex-col gap-4 min-w-0">
            <h2 className="text-[15px] font-semibold text-ink">Identificar cliente</h2>
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-[#F1F3F6] p-1" role="tablist">
              {([
                ['scan', 'Escanear', <ScanLine size={15} key="s" />],
                ['manual', 'Escribir ID', <Keyboard size={15} key="k" />],
                ['list', 'Clientes', <Users size={15} key="u" />],
              ] as const).map(([k, label, icon]) => (
                <button key={k} role="tab" aria-selected={mode === k} onClick={() => setMode(k)} className={cx('h-9 rounded-lg text-[12.5px] font-medium inline-flex items-center justify-center gap-1.5 transition', mode === k ? 'bg-white shadow-sm text-ink' : 'text-slate2 hover:text-ink')}>
                  {icon} {label}
                </button>
              ))}
            </div>
            {mode === 'scan' && <ScanPanel onCode={select} />}
            {mode === 'manual' && <ManualPanel onSubmit={select} />}
            {mode === 'list' && <ListPanel state={state} selectedId={selectedId} onPick={(id) => setSelectedId(id)} />}
          </section>

          <div className="flex flex-col gap-5 min-w-0">
            {card ? <CardPanel state={state} run={run} cardId={card.id} testMode={testMode} /> : <EmptyCard />}
            <RedeemCodeCheck state={state} onFound={(cardId) => setSelectedId(cardId)} />
          </div>
        </div>

        <HistoryTable state={state} cardId={selectedId} />
      </div>
    </div>
  );
}

function EmptyCard() {
  return (
    <section className="panel p-8 flex flex-col items-center text-center gap-2 text-slate2">
      <div className="h-12 w-12 rounded-full bg-[#F1F3F6] inline-flex items-center justify-center"><ScanLine size={22} /></div>
      <div className="text-[15px] font-medium text-ink">Escanea o elige una tarjeta</div>
      <p className="text-[13px] max-w-[320px]">Aquí verás los sellos del cliente y podrás registrar su visita.</p>
    </section>
  );
}

function ScanPanel({ onCode }: { onCode: (code: string) => boolean }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    setMsg(null);
    try {
      const text = await decodeQrFromFile(f);
      if (!text) setMsg('No encontramos un QR en la imagen. Acércate más o usa “Escribir ID”.');
      else if (!text.toUpperCase().startsWith('VLUXLOYALTY:CARD:')) setMsg('Ese QR no es una tarjeta de VLUX Loyalty.');
      else onCode(text);
    } catch {
      setMsg('No pudimos leer la imagen.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="relative rounded-2xl bg-ink text-white/80 aspect-[4/3] max-w-full flex flex-col items-center justify-center gap-3 overflow-hidden">
        <div className="scan-frame absolute inset-8 rounded-xl" />
        <Camera size={26} className="opacity-70" />
        <p className="text-[12.5px] text-center px-8 leading-snug">Toma o sube una foto del QR del cliente. En el teléfono se abre la cámara.</p>
      </div>
      <input ref={inputRef} id="scan-file" type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
      <Button variant="primary" onClick={() => inputRef.current?.click()} disabled={busy}>
        <ImageUp size={16} /> {busy ? 'Leyendo…' : 'Tomar o subir foto del QR'}
      </Button>
      {msg && <p className="text-[12.5px] text-[#B42318]">{msg}</p>}
      <p className="text-[11.5px] text-slate2 leading-snug">El escaneo en vivo con cámara necesita permisos que esta demo no tiene. La versión productiva lo hará directo; mientras tanto, la foto o el ID funcionan igual.</p>
    </div>
  );
}

function ManualPanel({ onSubmit }: { onSubmit: (code: string) => boolean }) {
  const [v, setV] = useState('');
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); if (onSubmit(v)) setV(''); }}>
      <label htmlFor="manual-id" className="text-[13px] font-medium text-ink">Identificador de la tarjeta</label>
      <input id="manual-id" className={cx(inputCls, 'font-mono tracking-wider uppercase')} placeholder="CDT-XXXX-XXXX" value={v} onChange={(e) => setV(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} />
      <Button type="submit" disabled={v.trim().length < 6}>Buscar tarjeta</Button>
      <p className="text-[11.5px] text-slate2">Acepta el ID con o sin guiones. El cliente lo ve debajo de su QR.</p>
    </form>
  );
}

function ListPanel({ state, selectedId, onPick }: { state: State; selectedId: string | null; onPick: (id: string) => void }) {
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const all = [...state.cards].sort((a, b) => Number(a.isSample) - Number(b.isSample) || Date.parse(b.lastOperationAt || b.createdAt) - Date.parse(a.lastOperationAt || a.createdAt));
    const s = q.trim().toLowerCase();
    return all.filter((c) => !s || customerOf(state, c).name.toLowerCase().includes(s) || c.id.toLowerCase().includes(s));
  }, [state, q]);
  return (
    <div className="flex flex-col gap-3 min-w-0">
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#98A2B3]" />
        <input id="list-search" className={cx(inputCls, 'pl-9 h-10 text-[14px]')} placeholder="Buscar por nombre o ID" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="flex flex-col max-h-[340px] overflow-y-auto -mx-1 px-1">
        {rows.map((c) => {
          const cu = customerOf(state, c);
          const p = progressOf(state, c);
          const mine = c.id === state.myCardId;
          return (
            <button key={c.id} onClick={() => onPick(c.id)} className={cx('flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition', selectedId === c.id ? 'bg-[#EEF8FA] ring-1 ring-[#BFE6EC]' : 'hover:bg-[#F6F7F9]')}>
              <span className="h-8 w-8 shrink-0 rounded-full bg-[#F1F3F6] inline-flex items-center justify-center text-[12px] font-semibold text-[#475467]">{cu.name.slice(0, 1)}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-[13.5px] font-medium text-ink truncate">{cu.name} {mine && <Badge tone="info">Tu demo</Badge>} {c.isSample && <SampleBadge />}</span>
                <span className="block text-[11.5px] font-mono text-slate2">{c.id}</span>
              </span>
              <span className="shrink-0 text-[12px] tabular-nums text-slate2">{p.reward ? <Badge tone="gold">Premio</Badge> : `${p.shown}/${p.required}`}</span>
              <ChevronRight size={15} className="text-[#C0C6CF]" />
            </button>
          );
        })}
        {!rows.length && <p className="text-[13px] text-slate2 px-3 py-4">Sin resultados.</p>}
      </div>
    </div>
  );
}

function CardPanel({ state, run, cardId, testMode }: Props & { cardId: string; testMode: boolean }) {
  const card = state.cards.find((c) => c.id === cardId)!;
  const cu = customerOf(state, card);
  const p = progressOf(state, card);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [lastStampAnim, setLastStampAnim] = useState<number | null>(null);
  const lock = useRef(false);

  useEffect(() => {
    setConfirm(false);
    setLastStampAnim(null);
  }, [cardId]);

  const stamp = (opts: { simulated?: boolean } = {}) => {
    if (lock.current) return; // evita doble toque mientras se procesa
    lock.current = true;
    setBusy(true);
    const before = p.shown;
    const r = run({ type: 'addStamp', cardId, testMode: testMode || !!opts.simulated });
    setTimeout(() => {
      lock.current = false;
      setBusy(false);
    }, 700);
    if (!r.ok) {
      toast('bad', r.message!);
      return;
    }
    setLastStampAnim(before);
    setFlash((n) => n + 1);
    if (r.data?.unlocked) toast('good', `¡${cu.name} completó su tarjeta! Recompensa desbloqueada.`);
    else toast('good', `Sello agregado a ${cu.name}.`);
  };

  const fill = () => {
    const nextP = progressOf(state, card);
    if (nextP.reward) return toast('info', 'Esta tarjeta ya tiene una recompensa disponible.');
    let s = state;
    let count = 0;
    for (let i = 0; i < nextP.remaining; i++) {
      const r = run({ type: 'addStamp', cardId, testMode: true });
      if (!r.ok) break;
      s = r.state;
      count++;
    }
    setLastStampAnim(nextP.shown);
    setFlash((n) => n + 1);
    toast('good', `${count} visitas simuladas. Recompensa desbloqueada para ${cu.name}.`);
    void s;
  };

  const redeem = () => {
    if (!p.reward) return;
    const r = run({ type: 'redeemReward', rewardId: p.reward.id });
    setConfirm(false);
    if (!r.ok) return toast('bad', r.message!);
    setLastStampAnim(null);
    toast('good', `Canje confirmado. ${cu.name} inicia un nuevo ciclo.`);
  };

  return (
    <section className="panel overflow-hidden">
      <div className="p-4 sm:p-5 flex flex-wrap items-start justify-between gap-3 border-b border-line">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-[19px] font-semibold text-ink truncate">{cu.name}</h2>
            {card.isSample ? <SampleBadge /> : <Badge tone="info">En vivo</Badge>}
          </div>
          <div className="mt-0.5 text-[12.5px] text-slate2 flex flex-wrap gap-x-3 gap-y-0.5">
            <span className="font-mono">{card.id}</span>
            <span>Ciclo {card.cycle}</span>
            <span>Última operación: {relativeTime(card.lastOperationAt)}</span>
          </div>
        </div>
        {p.reward ? <Badge tone="gold"><Gift size={12} /> Recompensa disponible</Badge> : <Badge tone="neutral">Faltan {p.remaining} {p.remaining === 1 ? 'sello' : 'sellos'}</Badge>}
      </div>

      <div className="p-4 sm:p-5 grid gap-5 md:grid-cols-[minmax(0,1fr)_260px] items-start">
        <div className="flex flex-col gap-4 min-w-0">
          <div className="rounded-2xl p-4 sm:p-5 text-[color:var(--cream)]" style={{ background: 'var(--brand)' }} key={flash}>
            <div className="flex items-baseline justify-between mb-4">
              <span className="text-[12px] uppercase tracking-[0.14em] opacity-60">Sellos acumulados</span>
              <span className="font-display text-[22px] tabular-nums">{p.shown}<span className="opacity-50"> / {p.required}</span></span>
            </div>
            <StampGrid total={p.required} filled={p.shown} animateFrom={lastStampAnim} />
            {p.extra > 0 && <div className="mt-3 text-[12px] opacity-70">+{p.extra} para el siguiente ciclo</div>}
          </div>
          <dl className="grid grid-cols-3 gap-2 text-[12.5px]">
            <div className="rounded-xl bg-[#F6F7F9] px-3 py-2"><dt className="text-slate2">Visitas totales</dt><dd className="text-[16px] font-semibold text-ink tabular-nums">{card.totalVisits}</dd></div>
            <div className="rounded-xl bg-[#F6F7F9] px-3 py-2"><dt className="text-slate2">Canjes</dt><dd className="text-[16px] font-semibold text-ink tabular-nums">{state.rewards.filter((r) => r.cardId === card.id && r.status === 'redeemed').length}</dd></div>
            <div className="rounded-xl bg-[#F6F7F9] px-3 py-2 min-w-0"><dt className="text-slate2">Recompensa</dt><dd className="text-[12.5px] font-medium text-ink truncate">{state.business.rewardDescription}</dd></div>
          </dl>
        </div>

        <div className="flex flex-col gap-3">
          {p.reward ? (
            <div className="rounded-2xl border-2 border-[#EBD7B0] bg-[#FDF8EF] p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2 text-[14px] font-semibold text-[#5C4314]"><Gift size={17} /> Recompensa disponible</div>
              <div className="text-[13px] text-[#7A5A1F]">{p.reward.description}<br /><span className="font-mono tracking-wider">{p.reward.code}</span></div>
              {!confirm ? (
                <Button variant="primary" onClick={() => setConfirm(true)}>Confirmar canje</Button>
              ) : (
                <div className="flex flex-col gap-2 anim-fade">
                  <p className="text-[12.5px] text-[#5C4314]">¿Ya entregaste “{p.reward.description.toLowerCase()}” a {cu.name}?</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setConfirm(false)}>Cancelar</Button>
                    <Button variant="primary" size="sm" onClick={redeem}><CheckCircle2 size={15} /> Sí, canjear</Button>
                  </div>
                </div>
              )}
            </div>
          ) : null}
          <Button variant="primary" size="lg" className="w-full" onClick={() => stamp()} disabled={busy}>
            <Coffee size={18} /> {busy ? 'Registrando…' : 'Registrar visita y agregar sello'}
          </Button>
          <p className="text-[11.5px] text-slate2 leading-snug">Un sello por compra válida. Si se toca dos veces, el sistema bloquea el duplicado durante 60 segundos.</p>
          {testMode && (
            <div className="rounded-xl border border-dashed border-[#C9CED6] p-3 flex flex-col gap-2 anim-fade">
              <div className="text-[12px] font-medium text-ink inline-flex items-center gap-1.5"><FlaskConical size={13} /> Modo de prueba</div>
              <Button variant="secondary" size="sm" onClick={() => stamp({ simulated: true })} disabled={busy}>Simular visita adicional</Button>
              <Button variant="secondary" size="sm" onClick={fill} disabled={!!p.reward}>Completar hasta la recompensa</Button>
              <p className="text-[11px] text-slate2">Las visitas simuladas se marcan como “prueba” en el historial.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function RedeemCodeCheck({ state, onFound }: { state: State; onFound: (cardId: string) => void }) {
  const [code, setCode] = useState('');
  const [result, setResult] = useState<null | { tone: 'good' | 'bad' | 'warn'; text: string }>(null);
  const check = (e: React.FormEvent) => {
    e.preventDefault();
    let c = code.trim().toUpperCase().replace(/^VLUXLOYALTY:REWARD:/, '');
    if (/^R[2-9A-Z]{6}$/.test(c)) c = `R-${c.slice(1)}`;
    const r = state.rewards.find((x) => x.code === c);
    if (!r) return setResult({ tone: 'bad', text: 'Código no encontrado.' });
    const cu = customerOf(state, state.cards.find((x) => x.id === r.cardId)!);
    onFound(r.cardId);
    if (r.status === 'redeemed') setResult({ tone: 'warn', text: `Ya canjeado el ${formatDateTime(r.redeemedAt!)} por ${cu.name}. No puede usarse otra vez.` });
    else setResult({ tone: 'good', text: `Válido: ${r.description} para ${cu.name}. Confírmalo arriba.` });
  };
  return (
    <form onSubmit={check} className="panel p-4 sm:p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2 text-[14px] font-semibold text-ink"><Ticket size={16} /> Validar código de canje</div>
      <div className="flex gap-2">
        <input id="redeem-code" className={cx(inputCls, 'font-mono uppercase tracking-wider h-10 text-[14px]')} placeholder="R-XXXXXX" value={code} onChange={(e) => { setCode(e.target.value); setResult(null); }} autoComplete="off" spellCheck={false} />
        <Button type="submit" variant="secondary" className="h-10 shrink-0" disabled={code.trim().length < 6}>Validar</Button>
      </div>
      {result && (
        <p className={cx('text-[12.5px] rounded-lg px-3 py-2', result.tone === 'good' ? 'bg-[#ECFDF3] text-[#067647]' : result.tone === 'warn' ? 'bg-[#FFFAEB] text-[#93370D]' : 'bg-[#FEF3F2] text-[#B42318]')}>{result.text}</p>
      )}
    </form>
  );
}

export function HistoryTable({ state, cardId, limit = 12, title = 'Historial reciente', includeSample = true }: { state: State; cardId?: string | null; limit?: number; title?: string; includeSample?: boolean }) {
  const [onlyCard, setOnlyCard] = useState(false);
  const ops = (onlyCard && cardId ? opsOf(state, cardId) : state.operations)
    .filter((o) => o.type !== 'review_link_opened' && (includeSample || !o.isSample))
    .slice(-limit)
    .reverse();
  return (
    <section className="panel overflow-hidden">
      <div className="px-4 sm:px-5 py-3.5 flex flex-wrap items-center justify-between gap-2 border-b border-line">
        <h2 className="text-[15px] font-semibold text-ink inline-flex items-center gap-2"><History size={16} /> {title}</h2>
        {cardId !== undefined && cardId && <Switch id="hist-only" checked={onlyCard} onChange={setOnlyCard} label="Solo esta tarjeta" />}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] min-w-[560px]">
          <thead>
            <tr className="text-left text-[11.5px] uppercase tracking-[0.08em] text-slate2 bg-[#FAFBFC]">
              <th className="font-medium px-4 sm:px-5 py-2.5">Cliente</th>
              <th className="font-medium px-3 py-2.5">Operación</th>
              <th className="font-medium px-3 py-2.5">Fecha</th>
              <th className="font-medium px-3 py-2.5 text-right">Sellos</th>
              <th className="font-medium px-4 sm:px-5 py-2.5 text-right">Origen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {ops.map((o) => {
              const card = o.cardId ? state.cards.find((c) => c.id === o.cardId) : null;
              const cu = card ? customerOf(state, card) : null;
              return (
                <tr key={o.id} className="row-in">
                  <td className="px-4 sm:px-5 py-2.5 text-ink font-medium whitespace-nowrap">{cu ? cu.name : <span className="text-slate2 font-normal">Dueño</span>}</td>
                  <td className="px-3 py-2.5 text-[#344054] whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <OpDot type={o.type} /> {OP_LABELS[o.type]}
                      {o.note && <span className="text-slate2">({o.note})</span>}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-slate2 tabular-nums whitespace-nowrap">{formatDateTime(o.at)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink">{o.stamps ? `+${o.stamps}` : o.type === 'reward_redeemed' ? '1 canje' : '–'}</td>
                  <td className="px-4 sm:px-5 py-2.5 text-right whitespace-nowrap">{o.isSample ? <SampleBadge /> : o.testMode ? <Badge tone="warn">Prueba</Badge> : <Badge tone="info">En vivo</Badge>}</td>
                </tr>
              );
            })}
            {!ops.length && (
              <tr><td colSpan={5} className="px-5 py-6 text-center text-slate2">Aún no hay operaciones.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function OpDot({ type }: { type: string }) {
  const color = type === 'stamp' ? '#2E90A0' : type === 'reward_redeemed' ? '#12B76A' : type === 'reward_unlocked' ? '#C9A15B' : type === 'card_created' ? '#7A5AF8' : '#98A2B3';
  return <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />;
}
