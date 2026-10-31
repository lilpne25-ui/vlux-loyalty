// Estado compartido de las tres vistas. Una sola fuente de verdad, persistida en localStorage.
// En producción esto se reemplaza por llamadas a la API (mismos comandos) y una caché local.
import { useCallback, useRef, useState } from 'react';
import { Command, execute, Result, State } from '../domain/model';
import { seedState } from '../domain/seed';

const KEY = 'vlux-loyalty:v0.1:state';
const SEEN_KEY = 'vlux-loyalty:v0.1:seen';

export function loadState(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.schemaVersion === 1 && Array.isArray(parsed.cards)) return parsed as State;
    }
  } catch {
    /* almacenamiento no disponible: seguimos en memoria */
  }
  return seedState();
}

function saveState(s: State) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

export function storageAvailable() {
  try {
    const k = '__vlux_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

export function useStore() {
  const [state, setState] = useState<State>(loadState);
  const ref = useRef(state);
  const run = useCallback((cmd: Command): Result => {
    const r = execute(ref.current, cmd);
    if (r.ok && r.state !== ref.current) {
      ref.current = r.state;
      setState(r.state);
      saveState(r.state);
    }
    return r;
  }, []);
  const reset = useCallback(() => {
    const fresh = seedState();
    ref.current = fresh;
    setState(fresh);
    saveState(fresh);
    try {
      localStorage.removeItem(SEEN_KEY);
    } catch {}
  }, []);
  return { state, run, reset };
}

// Sellos que el cliente ya vio en pantalla (para animar solo los nuevos).
export function getSeen(cardId: string): number | null {
  try {
    const m = JSON.parse(localStorage.getItem(SEEN_KEY) || '{}');
    return typeof m[cardId] === 'number' ? m[cardId] : null;
  } catch {
    return null;
  }
}
export function setSeen(cardId: string, n: number) {
  try {
    const m = JSON.parse(localStorage.getItem(SEEN_KEY) || '{}');
    m[cardId] = n;
    localStorage.setItem(SEEN_KEY, JSON.stringify(m));
  } catch {}
}
