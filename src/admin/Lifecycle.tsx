// V0.4.5 · Ciclo de vida del negocio en el Control Center: archivar, restaurar y eliminación segura en pasos.
// La eliminación nunca es un solo clic: vista previa con conteos → (datos sintéticos) → respaldo → nombre + motivo + 2FA.
import React, { useEffect, useState } from 'react';
import { AlertTriangle, Archive, Download, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useToast } from '../components/ui';
import { CButton, CField, CModal, Pill, Skeleton, num } from './kit';

type Biz = { id: string; name: string; slug: string; status: 'active' | 'suspended' | 'archived'; isDemo: boolean };

export function ArchiveModal({ open, business: b, onClose, onDone }: { open: boolean; business: Biz; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    try {
      const r = await api<{ sessionsRevoked: number; invitationsRevoked: number }>('POST', `/admin/businesses/${b.id}/archive`, { reason, confirm: true });
      toast('good', `Negocio archivado. Se cerraron ${r.sessionsRevoked} sesiones y se revocaron ${r.invitationsRevoked} invitaciones.`);
      setReason(''); setTyped(''); onDone();
    } catch (x) { setErr((x as ApiError).message); }
  };
  return (
    <CModal open={open} onClose={onClose} title="Archivar negocio" labelledBy="cc-archive-title">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-[13px] cc-muted">Retira <strong className="text-white">{b.name}</strong> de la operación: el personal pierde el acceso, se revocan las invitaciones pendientes, la página de registro y las tarjetas dejan de responder y deja de contar en las métricas activas. <strong className="text-white">No se borra ningún dato</strong> y se puede restaurar.</p>
        <CField label="Motivo" htmlFor="ar-reason"><input id="ar-reason" className="cc-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej. cerró el local, demo vencida" /></CField>
        <CField label={<>Escribe <span className="font-mono text-white">{b.name}</span> para confirmar</>} htmlFor="ar-confirm"><input id="ar-confirm" className="cc-input" value={typed} onChange={(e) => setTyped(e.target.value)} /></CField>
        {err && <p className="text-[12.5px] text-[#FDA29B]" role="alert">{err}</p>}
        <div className="flex justify-end gap-2">
          <CButton type="button" variant="ghost" onClick={onClose}>Cancelar</CButton>
          <CButton type="submit" variant="danger" disabled={reason.trim().length < 3 || typed.trim() !== b.name}><Archive size={14} /> Archivar</CButton>
        </div>
      </form>
    </CModal>
  );
}

export function RestoreModal({ open, business: b, onClose, onDone }: { open: boolean; business: Biz; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    try { await api('POST', `/admin/businesses/${b.id}/restore`, { reason }); toast('good', 'Negocio restaurado como suspendido. Reactívalo cuando esté listo.'); setReason(''); onDone(); }
    catch (x) { setErr((x as ApiError).message); }
  };
  return (
    <CModal open={open} onClose={onClose} title="Restaurar negocio" labelledBy="cc-restore-title">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-[13px] cc-muted">El negocio sale del archivo en estado <strong className="text-white">suspendido</strong>. Así la reactivación del servicio sigue siendo una decisión aparte. Las invitaciones revocadas no se reactivan: emite nuevas si hacen falta.</p>
        <CField label="Motivo" htmlFor="rs-reason"><input id="rs-reason" className="cc-input" value={reason} onChange={(e) => setReason(e.target.value)} /></CField>
        {err && <p className="text-[12.5px] text-[#FDA29B]" role="alert">{err}</p>}
        <div className="flex justify-end gap-2"><CButton type="button" variant="ghost" onClick={onClose}>Cancelar</CButton><CButton type="submit" variant="primary" disabled={reason.trim().length < 3}><RotateCcw size={14} /> Restaurar</CButton></div>
      </form>
    </CModal>
  );
}

type Preview = {
  business: { id: string; slug: string; name: string; status: string; isDemo: boolean; syntheticDeclaredAt: string | null };
  counts: { customers: number; cards: number; visits: number; purchases: number; rewards: number; stampEvents: number; auditEvents: number; staff: number; invitations: number; pendingInvitations: number };
  staff: { email: string; displayName: string; role: string; sharedWithOtherBusinesses: boolean }[];
  backup: { sha256: string; at: string } | null;
  canDelete: boolean; blockers: string[]; requiresSyntheticDeclaration: boolean; confirmationText: string; backupWindowMinutes: number;
};

export function DeleteModal({ open, business: b, onClose, onDeleted, onChanged }: { open: boolean; business: Biz; onClose: () => void; onDeleted: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [p, setP] = useState<Preview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [backupSha, setBackupSha] = useState<string | null>(null);
  const [phrase, setPhrase] = useState('');
  const [f, setF] = useState({ confirmSlug: '', reason: '', code: '' });

  const load = async () => {
    setErr(null);
    try { const r = await api<Preview>('GET', `/admin/businesses/${b.id}/deletion-preview`); setP(r); setBackupSha(r.backup?.sha256 ?? null); }
    catch (x) { setErr((x as ApiError).message); }
  };
  useEffect(() => { if (open) { setP(null); setF({ confirmSlug: '', reason: '', code: '' }); setPhrase(''); load(); } }, [open, b.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const download = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/admin/businesses/${b.id}/export`, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: '{}' });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error?.message ?? 'No se pudo generar el respaldo.');
      const sha = res.headers.get('x-content-sha256');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `vlux-respaldo-${b.slug}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      setBackupSha(sha);
      toast('good', 'Respaldo descargado. Guárdalo en un lugar seguro: contiene datos de clientes.');
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  const declare = async () => {
    setBusy(true); setErr(null);
    try { await api('POST', `/admin/businesses/${b.id}/declare-synthetic`, { phrase, code: f.code }); setF({ ...f, code: '' }); toast('good', 'Datos declarados como de prueba.'); onChanged(); await load(); }
    catch (x) { setErr((x as ApiError).message); } finally { setBusy(false); }
  };
  const remove = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const r = await api<{ counts: Record<string, number> }>('POST', `/admin/businesses/${b.id}/delete`, { ...f, backupSha256: backupSha });
      toast('good', `Negocio eliminado. Personal conservado por tener otros negocios: ${r.counts.usersKept ?? 0}.`);
      onDeleted();
    } catch (x) { setErr((x as ApiError).message); } finally { setBusy(false); }
  };

  const c = p?.counts;
  return (
    <CModal open={open} onClose={onClose} title={<span className="inline-flex items-center gap-2"><Trash2 size={15} /> Eliminar negocio</span>} labelledBy="cc-delete-title" wide>
      {!p ? (err ? <p className="text-[12.5px] text-[#FDA29B]" role="alert">{err}</p> : <Skeleton className="h-40" />) : (
        <div className="flex flex-col gap-5" data-testid="delete-flow">
          <div className="cc-raised px-4 py-3 text-[13px] flex gap-3">
            <AlertTriangle size={18} className="shrink-0 text-[#FDA29B] mt-0.5" />
            <div><strong className="text-white">Esta operación no se puede deshacer.</strong> Se borran el negocio, sus clientes, tarjetas, compras, sellos, premios, bitácora interna, personal sin otros negocios e invitaciones. Queda una constancia en la bitácora de VLUX (solo conteos, sin datos personales).</div>
          </div>
          <section>
            <div className="flex flex-wrap items-center gap-2 mb-2"><span className="text-[14px] font-medium">{p.business.name}</span><span className="font-mono text-[12px] cc-faint">/{p.business.slug}</span>{p.business.isDemo ? <Pill dot={false}>Demo</Pill> : p.business.syntheticDeclaredAt ? <Pill dot={false}>Datos de prueba</Pill> : <Pill tone="amber">Negocio real</Pill>}</div>
            <dl className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-[12.5px]" data-testid="delete-counts">
              {[['Clientes', c!.customers], ['Tarjetas', c!.cards], ['Compras', c!.purchases], ['Premios', c!.rewards], ['Movimientos', c!.stampEvents], ['Visitas', c!.visits], ['Personal', c!.staff], ['Invitaciones', c!.invitations], ['Bitácora', c!.auditEvents]].map(([k, v]) => (
                <div key={k as string} className="cc-panel px-3 py-2"><dt className="cc-faint text-[11px]">{k}</dt><dd className="tabular-nums text-[15px]">{num(v as number)}</dd></div>
              ))}
            </dl>
            {p.staff.length > 0 && (
              <ul className="mt-3 text-[12.5px] flex flex-col gap-1">
                {p.staff.map((s) => <li key={s.email} className="flex flex-wrap gap-2"><span>{s.displayName}</span><span className="cc-faint break-all">{s.email}</span>{s.sharedWithOtherBusinesses ? <Pill tone="green">Se conserva (tiene otros negocios)</Pill> : <Pill tone="silver">Se elimina</Pill>}</li>)}
              </ul>
            )}
          </section>

          {p.blockers.length > 0 && (
            <div className="flex flex-col gap-3">
              <ul className="text-[13px] text-[#FDA29B] list-disc pl-5" data-testid="delete-blockers">{p.blockers.map((x) => <li key={x}>{x}</li>)}</ul>
              {p.requiresSyntheticDeclaration && p.business.status === 'archived' && (
                <div className="cc-panel p-4 flex flex-col gap-3">
                  <p className="text-[12.5px] cc-muted">Solo si este negocio fue una <strong className="text-white">prueba interna de VLUX</strong> y ningún cliente real se registró: declara sus datos como de prueba. Queda registrado con tu nombre.</p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <CField label={<>Escribe <span className="font-mono text-white">DATOS DE PRUEBA</span></>} htmlFor="del-phrase"><input id="del-phrase" className="cc-input" value={phrase} onChange={(e) => setPhrase(e.target.value)} /></CField>
                    <CField label="Código 2FA" htmlFor="del-code1"><input id="del-code1" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="cc-input tabular-nums" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.replace(/\D/g, '') })} /></CField>
                  </div>
                  <CButton type="button" disabled={busy || phrase.trim().toUpperCase() !== 'DATOS DE PRUEBA' || f.code.length !== 6} onClick={declare}><ShieldCheck size={14} /> Declarar datos de prueba</CButton>
                </div>
              )}
            </div>
          )}

          {p.canDelete && (
            <form onSubmit={remove} className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3 cc-panel p-4">
                <div className="text-[12.5px]"><div className="font-medium text-[13px]">1. Respaldo</div><div className="cc-muted">{backupSha ? <>Descargado · huella <span className="font-mono">{backupSha.slice(0, 12)}…</span> (vale {p.backupWindowMinutes} min)</> : 'Obligatorio antes de eliminar. Archivo JSON con todos los datos del negocio.'}</div></div>
                <CButton type="button" onClick={download} disabled={busy}><Download size={14} /> {backupSha ? 'Descargar de nuevo' : 'Descargar respaldo'}</CButton>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <CField label={<>2. Escribe <span className="font-mono text-white">{p.confirmationText}</span></>} htmlFor="del-slug"><input id="del-slug" className="cc-input font-mono" value={f.confirmSlug} onChange={(e) => setF({ ...f, confirmSlug: e.target.value })} /></CField>
                <CField label="3. Motivo" htmlFor="del-reason"><input id="del-reason" className="cc-input" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></CField>
                <CField label="4. Código 2FA nuevo" htmlFor="del-code" hint="Se pide otra vez aunque ya hayas entrado."><input id="del-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="cc-input tabular-nums" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.replace(/\D/g, '') })} /></CField>
              </div>
              <div className="flex justify-end gap-2">
                <CButton type="button" variant="ghost" onClick={onClose}>Cancelar</CButton>
                <CButton type="submit" variant="danger" disabled={busy || !backupSha || f.confirmSlug.trim() !== p.confirmationText || f.reason.trim().length < 3 || f.code.length !== 6}><Trash2 size={14} /> Eliminar definitivamente</CButton>
              </div>
            </form>
          )}
          {err && <p className="text-[12.5px] text-[#FDA29B]" role="alert">{err}</p>}
        </div>
      )}
    </CModal>
  );
}
