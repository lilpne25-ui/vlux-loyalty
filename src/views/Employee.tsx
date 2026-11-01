// Caja (empleado y dueño): identificar tarjeta, registrar compra, canjear premio e historial.
// V0.2: toda operación la autoriza el servidor con la sesión del empleado; la interfaz solo la solicita.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScanLine, Keyboard, Users, Search, Gift, CheckCircle2, Camera, ImageUp, History, ChevronRight, ShoppingBag, Minus, Plus, CameraOff, ShieldCheck, Link2 } from 'lucide-react';
import { api, ApiError, HistoryItem, newIdempotencyKey, Program, StaffCard } from '../lib/api';
import { formatDateTime, relativeTime, plural } from '../lib/format';
import { usePolling } from '../lib/usePolling';
import { cameraSupported, decodeQrFromFile, startCameraScanner } from '../lib/qr';
import { navigate } from '../lib/router';
import { Button, Badge, inputCls, useToast, cx, Modal, QRCode, CopyButton } from '../components/ui';
import { StampGrid } from '../components/LoyaltyCard';
import { ErrorBox } from '../components/Brand';

const CARD_POLL_MS = 5000;

export function EmployeeView({ businessName, initialCode }: { businessName: string; initialCode: string | null }) {
  const [cardId, setCardId] = useState<string | null>(null);
  const [mode, setMode] = useState<'scan' | 'manual' | 'list'>('scan');
  const toast = useToast();

  const identify = useCallback(async (raw: string) => {
    try {
      const r = await api<{ cardId: string; matchedBy: 'card' | 'reward' }>('POST', '/staff/cards/lookup', { code: raw });
      setCardId(r.cardId);
      toast('info', r.matchedBy === 'reward' ? 'Código de recompensa identificado.' : 'Tarjeta identificada.');
      return true;
    } catch (e) {
      const err = e as ApiError;
      toast('bad', err.status === 404 ? 'No encontramos esa tarjeta en este negocio.' : err.message);
      return false;
    }
  }, [toast]);

  // Si se escaneó el QR con la cámara del teléfono, llega como /caja?tarjeta=XXXX-XXXX.
  useEffect(() => {
    if (initialCode) {
      identify(initialCode);
      navigate('/caja', { replace: true });
    }
  }, [initialCode, identify]);

  return (
    <div className="dash-bg min-h-full">
      <div className="mx-auto w-full max-w-[1120px] gutter py-6 sm:py-8 flex flex-col gap-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[12px] uppercase tracking-[0.14em] text-slate2 truncate">{businessName} · Caja</div>
            <h1 className="text-[24px] sm:text-[28px] font-semibold tracking-tight text-ink">Panel del empleado</h1>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[12px] text-[#067647]"><ShieldCheck size={14} /> Operaciones validadas por el servidor</span>
        </header>

        <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)] items-start">
          <section className="panel p-4 sm:p-5 flex flex-col gap-4 min-w-0">
            <h2 className="text-[15px] font-semibold text-ink">Identificar cliente</h2>
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-[#F1F3F6] p-1" role="tablist">
              {([
                ['scan', 'Escanear', <ScanLine size={15} key="s" />],
                ['manual', 'Escribir', <Keyboard size={15} key="k" />],
                ['list', 'Buscar', <Users size={15} key="u" />],
              ] as const).map(([k, label, icon]) => (
                <button key={k} role="tab" aria-selected={mode === k} onClick={() => setMode(k)} className={cx('h-9 rounded-lg text-[12.5px] font-medium inline-flex items-center justify-center gap-1.5 transition', mode === k ? 'bg-white shadow-sm text-ink' : 'text-slate2 hover:text-ink')}>
                  {icon} {label}
                </button>
              ))}
            </div>
            {mode === 'scan' && <ScanPanel onCode={identify} />}
            {mode === 'manual' && <ManualPanel onSubmit={identify} />}
            {mode === 'list' && <ListPanel selectedId={cardId} onPick={setCardId} />}
          </section>

          <div className="flex flex-col gap-5 min-w-0">
            {cardId ? <CardPanel key={cardId} cardId={cardId} /> : <EmptyCard />}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyCard() {
  return (
    <section className="panel p-8 flex flex-col items-center text-center gap-2 text-slate2">
      <div className="h-12 w-12 rounded-full bg-[#F1F3F6] inline-flex items-center justify-center"><ScanLine size={22} /></div>
      <div className="text-[15px] font-medium text-ink">Escanea o busca una tarjeta</div>
      <p className="text-[13px] max-w-[320px]">Aquí verás los sellos del cliente y podrás registrar su compra o canjear su recompensa.</p>
    </section>
  );
}

function ScanPanel({ onCode }: { onCode: (code: string) => Promise<boolean> }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stopRef = useRef<null | (() => void)>(null);
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const stop = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
    setLive(false);
  }, []);
  useEffect(() => stop, [stop]);

  const start = async () => {
    setMsg(null);
    if (!cameraSupported()) return setMsg('Este navegador no permite usar la cámara aquí. Usa “Tomar foto” o escribe el código.');
    try {
      setLive(true);
      stopRef.current = await startCameraScanner(videoRef.current!, async (text) => {
        stop();
        if (navigator.vibrate) navigator.vibrate(60);
        await onCode(text);
      });
    } catch (e) {
      setLive(false);
      const name = (e as DOMException)?.name;
      setMsg(name === 'NotAllowedError' ? 'Permiso de cámara denegado. Actívalo en el navegador o usa “Tomar foto”.' : 'No se pudo abrir la cámara. Usa “Tomar foto” o escribe el código.');
    }
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    setMsg(null);
    try {
      const text = await decodeQrFromFile(f);
      if (!text) setMsg('No encontramos un QR en la imagen. Acércate más o escribe el código.');
      else await onCode(text);
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
        <video ref={videoRef} className={cx('absolute inset-0 h-full w-full object-cover', !live && 'hidden')} muted playsInline aria-label="Vista de la cámara" data-testid="scanner-video" />
        <div className="scan-frame absolute inset-8 rounded-xl pointer-events-none" />
        {!live && (<><Camera size={26} className="opacity-70" /><p className="text-[12.5px] text-center px-8 leading-snug">Apunta la cámara al QR de la tarjeta o de la recompensa del cliente.</p></>)}
      </div>
      {live ? (
        <Button variant="secondary" onClick={stop}><CameraOff size={16} /> Detener cámara</Button>
      ) : (
        <Button variant="primary" onClick={start}><Camera size={16} /> Escanear con cámara</Button>
      )}
      <input ref={inputRef} id="scan-file" type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
      <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()} disabled={busy}><ImageUp size={15} /> {busy ? 'Leyendo…' : 'Tomar o subir foto del QR'}</Button>
      {msg && <p className="text-[12.5px] text-[#B42318]" role="alert">{msg}</p>}
      <p className="text-[11.5px] text-slate2 leading-snug">La cámara requiere HTTPS y permiso del navegador. El QR solo identifica la tarjeta; tú autorizas cada sello.</p>
    </div>
  );
}

function ManualPanel({ onSubmit }: { onSubmit: (code: string) => Promise<boolean> }) {
  const [v, setV] = useState('');
  return (
    <form className="flex flex-col gap-3" onSubmit={async (e) => { e.preventDefault(); if (await onSubmit(v)) setV(''); }}>
      <label htmlFor="manual-id" className="text-[13px] font-medium text-ink">Código de tarjeta o de recompensa</label>
      <input id="manual-id" className={cx(inputCls, 'font-mono tracking-wider uppercase')} placeholder="XXXX-XXXX o R-XXXXXX" value={v} onChange={(e) => setV(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} />
      <Button type="submit" disabled={v.trim().length < 6}>Buscar tarjeta</Button>
      <p className="text-[11.5px] text-slate2">Acepta el código con o sin guion. El cliente lo ve debajo de su QR.</p>
    </form>
  );
}

function ListPanel({ selectedId, onPick }: { selectedId: string | null; onPick: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<{ id: string; publicCode: string; customerName: string; balance: number; hasReward: boolean }[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      api('GET', `/staff/cards?q=${encodeURIComponent(q.trim())}`).then((r) => { setRows(r.cards); setErr(null); }).catch((e: ApiError) => setErr(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="flex flex-col gap-3 min-w-0">
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#98A2B3]" />
        <input id="list-search" className={cx(inputCls, 'pl-9 h-10 text-[14px]')} placeholder="Buscar por nombre o código" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {err && <ErrorBox message={err} />}
      <div className="flex flex-col max-h-[340px] overflow-y-auto -mx-1 px-1">
        {rows.map((c) => (
          <button key={c.id} onClick={() => onPick(c.id)} className={cx('flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition', selectedId === c.id ? 'bg-[#EEF8FA] ring-1 ring-[#BFE6EC]' : 'hover:bg-[#F6F7F9]')}>
            <span className="h-8 w-8 shrink-0 rounded-full bg-[#F1F3F6] inline-flex items-center justify-center text-[12px] font-semibold text-[#475467]">{c.customerName.slice(0, 1)}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-medium text-ink truncate">{c.customerName}</span>
              <span className="block text-[11.5px] font-mono text-slate2">{c.publicCode}</span>
            </span>
            <span className="shrink-0 text-[12px] tabular-nums text-slate2">{c.hasReward ? <Badge tone="gold">Premio</Badge> : `${c.balance} sellos`}</span>
            <ChevronRight size={15} className="text-[#C0C6CF]" />
          </button>
        ))}
        {!rows.length && !err && <p className="text-[13px] text-slate2 px-3 py-4">Sin resultados.</p>}
      </div>
    </div>
  );
}

type CardData = { card: StaffCard; program: Pick<Program, 'stampsRequired' | 'stampMode' | 'maxStampsPerPurchase' | 'rewardDescription'>; history: HistoryItem[] };

function CardPanel({ cardId }: { cardId: string }) {
  const toast = useToast();
  const { data, error, refresh, setData } = usePolling(() => api<CardData>('GET', `/staff/cards/${cardId}`), CARD_POLL_MS, [cardId]);
  const [items, setItems] = useState(1);
  const [busy, setBusy] = useState(false);
  const [confirmRedeem, setConfirmRedeem] = useState(false);
  const [dupPrompt, setDupPrompt] = useState<string | null>(null);
  const [newLink, setNewLink] = useState<string | null>(null);
  const [confirmLink, setConfirmLink] = useState(false);
  const [animFrom, setAnimFrom] = useState<number | null>(null);
  // Si la red falla, el reintento reutiliza la misma llave: el servidor no duplica la compra.
  const pendingKey = useRef<string | null>(null);

  if (error && !data) return <ErrorBox message={error.message} onRetry={refresh} />;
  if (!data) return <section className="panel p-8 text-center text-slate2 text-[13px]">Cargando tarjeta…</section>;
  const { card, program } = data;
  const reward = card.reward;
  const goal = reward ? reward.stampsCost : program.stampsRequired;
  const shown = Math.min(card.balance, goal);
  const remaining = Math.max(0, goal - card.balance);
  const extra = reward ? Math.max(0, card.balance - reward.stampsCost) : 0;
  const perItem = program.stampMode === 'per_item';

  const purchase = async (confirmDuplicate = false) => {
    if (busy) return;
    setBusy(true);
    if (!pendingKey.current) pendingKey.current = newIdempotencyKey();
    const before = shown;
    try {
      const r = await api('POST', `/staff/cards/${cardId}/purchases`, { itemCount: perItem ? items : 1, idempotencyKey: pendingKey.current, confirmDuplicate });
      pendingKey.current = null;
      setDupPrompt(null);
      setAnimFrom(before);
      setItems(1);
      setData({ ...data, card: r.card });
      refresh();
      toast('good', r.rewardUnlocked ? `¡${card.customerName} completó su tarjeta! Recompensa desbloqueada.` : `${plural(r.stampsAwarded, 'sello agregado', 'sellos agregados')} a ${card.customerName}.`);
    } catch (e) {
      const err = e as ApiError;
      if (err.code === 'possible_duplicate') {
        pendingKey.current = null;
        setDupPrompt(err.message);
      } else {
        if (err.status !== 0) pendingKey.current = null;
        toast('bad', err.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const redeem = async () => {
    if (!reward || busy) return;
    setBusy(true);
    try {
      const r = await api('POST', `/staff/rewards/${reward.id}/redeem`);
      setConfirmRedeem(false);
      setAnimFrom(null);
      setData({ ...data, card: r.card });
      refresh();
      toast('good', `Canje confirmado. ${card.customerName} inicia un nuevo ciclo.`);
    } catch (e) {
      setConfirmRedeem(false);
      toast('bad', (e as ApiError).message);
      refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section className="panel overflow-hidden" data-testid="card-panel">
        <div className="p-4 sm:p-5 flex flex-wrap items-start justify-between gap-3 border-b border-line">
          <div className="min-w-0">
            <h2 className="text-[19px] font-semibold text-ink truncate">{card.customerName}</h2>
            <div className="mt-0.5 text-[12.5px] text-slate2 flex flex-wrap gap-x-3 gap-y-0.5">
              <span className="font-mono">{card.publicCode}</span>
              <span>Ciclo {card.cycle}</span>
              <span>Última compra: {relativeTime(card.lastPurchaseAt)}</span>
              <button className="text-[12.5px] font-medium underline underline-offset-2 inline-flex items-center gap-1" onClick={() => setConfirmLink(true)}><Link2 size={12} /> Nuevo enlace</button>
            </div>
          </div>
          {reward ? <Badge tone="gold"><Gift size={12} /> Recompensa disponible</Badge> : <Badge tone="neutral">Faltan {plural(remaining, 'sello', 'sellos')}</Badge>}
        </div>

        <div className="p-4 sm:p-5 grid gap-5 md:grid-cols-[minmax(0,1fr)_260px] items-start">
          <div className="flex flex-col gap-4 min-w-0">
            <div className="rounded-2xl p-4 sm:p-5 text-[color:var(--cream)]" style={{ background: 'var(--brand)' }} key={card.balance + ':' + card.cycle}>
              <div className="flex items-baseline justify-between mb-4">
                <span className="text-[12px] uppercase tracking-[0.14em] opacity-60">Sellos acumulados</span>
                <span className="font-display text-[22px] tabular-nums" data-testid="staff-stamp-count">{shown}<span className="opacity-50"> / {goal}</span></span>
              </div>
              <StampGrid total={goal} filled={shown} animateFrom={animFrom} />
              {extra > 0 && <div className="mt-3 text-[12px] opacity-70">+{extra} para el siguiente ciclo</div>}
            </div>
            <dl className="grid grid-cols-3 gap-2 text-[12.5px]">
              <div className="rounded-xl bg-[#F6F7F9] px-3 py-2"><dt className="text-slate2">Visitas</dt><dd className="text-[16px] font-semibold text-ink tabular-nums">{card.visits}</dd></div>
              <div className="rounded-xl bg-[#F6F7F9] px-3 py-2"><dt className="text-slate2">Compras</dt><dd className="text-[16px] font-semibold text-ink tabular-nums">{card.purchases}</dd></div>
              <div className="rounded-xl bg-[#F6F7F9] px-3 py-2"><dt className="text-slate2">Canjes</dt><dd className="text-[16px] font-semibold text-ink tabular-nums">{card.redeemed}</dd></div>
            </dl>
          </div>

          <div className="flex flex-col gap-3">
            {reward && (
              <div className="rounded-2xl border-2 border-[#EBD7B0] bg-[#FDF8EF] p-4 flex flex-col gap-3">
                <div className="flex items-center gap-2 text-[14px] font-semibold text-[#5C4314]"><Gift size={17} /> Recompensa disponible</div>
                <div className="text-[13px] text-[#7A5A1F]">{reward.description}<br /><span className="font-mono tracking-wider">{reward.code}</span></div>
                <Button variant="primary" onClick={() => setConfirmRedeem(true)} disabled={busy}>Confirmar canje</Button>
              </div>
            )}
            {perItem && (
              <div className="flex items-center justify-between rounded-xl border border-line px-3 py-2">
                <span className="text-[13px] text-ink">Artículos válidos</span>
                <div className="flex items-center gap-2">
                  <button type="button" aria-label="Menos artículos" className="h-9 w-9 rounded-lg border border-line inline-flex items-center justify-center" onClick={() => setItems((n) => Math.max(1, n - 1))}><Minus size={15} /></button>
                  <span className="w-6 text-center tabular-nums font-semibold" data-testid="item-count">{items}</span>
                  <button type="button" aria-label="Más artículos" className="h-9 w-9 rounded-lg border border-line inline-flex items-center justify-center" onClick={() => setItems((n) => Math.min(50, n + 1))}><Plus size={15} /></button>
                </div>
              </div>
            )}
            <Button variant="primary" size="lg" className="w-full" onClick={() => purchase(false)} disabled={busy}>
              <ShoppingBag size={18} /> {busy ? 'Registrando…' : 'Registrar compra'}
            </Button>
            <p className="text-[11.5px] text-slate2 leading-snug">
              {perItem ? `1 sello por artículo válido, hasta ${program.maxStampsPerPurchase} por compra.` : '1 sello por compra válida, sin importar cuántos artículos lleve.'} Varias compras seguidas cuentan como una sola visita.
            </p>
          </div>
        </div>
      </section>

      <HistoryTable items={data.history} title="Movimientos de esta tarjeta" />

      <Modal open={confirmRedeem} onClose={() => setConfirmRedeem(false)} title="Confirmar canje" labelledBy="redeem-title">
        <p className="text-[14px] text-[#475467]">¿Ya entregaste “{reward?.description}” a {card.customerName}? El canje no se puede deshacer.</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => setConfirmRedeem(false)}>Cancelar</Button>
          <Button variant="primary" onClick={redeem} disabled={busy}><CheckCircle2 size={15} /> Sí, canjear</Button>
        </div>
      </Modal>

      <Modal open={confirmLink} onClose={() => { setConfirmLink(false); setNewLink(null); }} title="Nuevo enlace de tarjeta" labelledBy="link-title">
        {!newLink ? (
          <>
            <p className="text-[14px] text-[#475467]">Úsalo si {card.customerName} cambió de teléfono o perdió su enlace. El enlace anterior y los teléfonos donde estaba abierta la tarjeta dejarán de tener acceso. Los sellos no cambian.</p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setConfirmLink(false)}>Cancelar</Button>
              <Button variant="primary" onClick={async () => {
                try { setNewLink((await api<{ personalLink: string }>('POST', `/staff/cards/${cardId}/link`)).personalLink); }
                catch (e) { toast('bad', (e as ApiError).message); setConfirmLink(false); }
              }}><Link2 size={15} /> Generar</Button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <p className="text-[14px] text-[#475467] text-center">Que {card.customerName} escanee este código con la cámara de su teléfono.</p>
            <QRCode value={newLink} size={180} label="Código del nuevo enlace de la tarjeta" />
            <span className="text-[11px] font-mono text-slate2 break-all select-all text-center" data-testid="new-card-link">{newLink}</span>
            <CopyButton text={newLink} />
          </div>
        )}
      </Modal>

      <Modal open={!!dupPrompt} onClose={() => setDupPrompt(null)} title="¿Otra compra?" labelledBy="dup-title">
        <p className="text-[14px] text-[#475467]">{dupPrompt}</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => setDupPrompt(null)}>No, fue un doble toque</Button>
          <Button variant="primary" onClick={() => purchase(true)} disabled={busy}>Sí, registrar otra</Button>
        </div>
      </Modal>
    </>
  );
}

const KIND_LABEL: Record<HistoryItem['kind'], string> = {
  card_created: 'Tarjeta creada',
  purchase: 'Compra',
  purchase_voided: 'Compra anulada',
  reward_unlocked: 'Recompensa desbloqueada',
  reward_redeemed: 'Recompensa canjeada',
};

export function HistoryTable({ items, title = 'Historial reciente', showCustomer = false, onVoid }: { items: HistoryItem[]; title?: string; showCustomer?: boolean; onVoid?: (item: HistoryItem) => void }) {
  return (
    <section className="panel overflow-hidden">
      <div className="px-4 sm:px-5 py-3.5 flex items-center justify-between gap-2 border-b border-line">
        <h2 className="text-[15px] font-semibold text-ink inline-flex items-center gap-2"><History size={16} /> {title}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] min-w-[520px]">
          <thead>
            <tr className="text-left text-[11.5px] uppercase tracking-[0.08em] text-slate2 bg-[#FAFBFC]">
              {showCustomer && <th className="font-medium px-4 sm:px-5 py-2.5">Cliente</th>}
              <th className={cx('font-medium py-2.5', showCustomer ? 'px-3' : 'px-4 sm:px-5')}>Operación</th>
              <th className="font-medium px-3 py-2.5">Fecha</th>
              <th className="font-medium px-3 py-2.5 text-right">Sellos</th>
              <th className="font-medium px-4 sm:px-5 py-2.5 text-right">Registró</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.map((o, i) => (
              <tr key={o.kind + o.at + i} className="row-in">
                {showCustomer && <td className="px-4 sm:px-5 py-2.5 text-ink font-medium whitespace-nowrap">{o.customerName}</td>}
                <td className={cx('py-2.5 text-[#344054] whitespace-nowrap', showCustomer ? 'px-3' : 'px-4 sm:px-5')}>
                  <span className="inline-flex items-center gap-1.5"><OpDot kind={o.kind} /> <span className={o.kind === 'purchase' && o.voided ? 'line-through text-slate2' : undefined}>{KIND_LABEL[o.kind]}</span>{o.kind === 'purchase' && o.items && o.items > 1 ? <span className="text-slate2">({o.items} artículos)</span> : null}{o.kind === 'purchase' && o.voided ? <span className="text-slate2">(anulada)</span> : null}</span>
                </td>
                <td className="px-3 py-2.5 text-slate2 tabular-nums whitespace-nowrap">{formatDateTime(o.at)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-ink">{o.stamps > 0 ? `+${o.stamps}` : o.stamps < 0 ? o.stamps : '–'}</td>
                <td className="px-4 sm:px-5 py-2.5 text-right text-slate2 whitespace-nowrap">
                  {o.staffName ?? '–'}
                  {onVoid && o.kind === 'purchase' && !o.voided && o.purchaseId && (
                    <button onClick={() => onVoid(o)} className="ml-2 text-[12px] font-medium text-[#B42318] hover:underline" aria-label={`Anular compra de ${o.customerName ?? 'cliente'}`}>Anular</button>
                  )}
                </td>
              </tr>
            ))}
            {!items.length && (<tr><td colSpan={showCustomer ? 5 : 4} className="px-5 py-6 text-center text-slate2">Aún no hay operaciones.</td></tr>)}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function OpDot({ kind }: { kind: string }) {
  const color = kind === 'purchase' ? '#2E90A0' : kind === 'purchase_voided' ? '#B42318' : kind === 'reward_redeemed' ? '#12B76A' : kind === 'reward_unlocked' ? '#C9A15B' : kind === 'card_created' ? '#7A5AF8' : '#98A2B3';
  return <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />;
}
