// V0.2.2 · Soporte PWA en el navegador: service worker, detección de plataforma, instalación y
// metadatos por negocio (manifiesto e ícono). Nada de esto guarda tokens: el acceso a la tarjeta
// sigue siendo la cookie HttpOnly que pone el servidor.
import { useEffect, useState } from 'react';

// ---------- Plataforma ----------
export type InstallPlatform = 'ios-safari' | 'ios-other' | 'android' | 'desktop';

export function detectPlatform(ua = navigator.userAgent, maxTouch = navigator.maxTouchPoints || 0): InstallPlatform {
  // iPadOS se presenta como Mac con pantalla táctil.
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouch > 1);
  if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua) ? 'ios-other' : 'ios-safari';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

export function isStandalone() {
  return (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches)
    || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

// ---------- Evento de instalación (Chrome, Edge, Samsung Internet) ----------
interface BeforeInstallPromptEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function initInstallCapture() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // mostramos nuestro botón en lugar del aviso automático
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    try { localStorage.setItem('vlux:installed', '1'); } catch { /* sin almacenamiento */ }
    notify();
  });
}

export function useInstallState() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return {
    canPrompt: !!deferred,
    installed: installed || isStandalone(),
    async prompt(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
      if (!deferred) return 'unavailable';
      const ev = deferred;
      deferred = null;
      await ev.prompt();
      const { outcome } = await ev.userChoice;
      if (outcome === 'accepted') installed = true;
      notify();
      return outcome;
    },
  };
}

// ---------- Service worker ----------
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (!secure) return;
  const hadController = !!navigator.serviceWorker.controller;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((reg) => {
      // Busca actualizaciones al volver a la app (una app instalada puede quedar abierta días).
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => undefined); });
    }).catch(() => undefined);
  });
  // Nueva versión activa: en la tarjeta del cliente recargamos para no mostrar una versión vieja.
  // En caja o panel no se recarga solo (podría interrumpir una operación); toma efecto al navegar.
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    if (location.pathname.startsWith('/n/')) { reloaded = true; location.reload(); }
  });
}

// ---------- Metadatos por negocio ----------
function setTag(selector: string, create: () => HTMLElement, attr: string, value: string) {
  let el = document.head.querySelector(selector) as HTMLElement | null;
  if (!el) { el = create(); document.head.appendChild(el); }
  el.setAttribute(attr, value);
}
const link = (rel: string, extra: Record<string, string> = {}) => () => { const l = document.createElement('link'); l.rel = rel; Object.entries(extra).forEach(([k, v]) => l.setAttribute(k, v)); return l; };
const meta = (name: string) => () => { const m = document.createElement('meta'); m.name = name; return m; };

/** Pone el manifiesto, el ícono de iPhone y el color del negocio en <head>. Solo datos públicos. */
export function applyBusinessAppHead(slug: string, name: string, color: string) {
  setTag('link[rel="manifest"]', link('manifest'), 'href', `/api/pwa/${slug}/manifest.webmanifest`);
  setTag('link[rel="apple-touch-icon"]', link('apple-touch-icon', { sizes: '180x180' }), 'href', `/api/pwa/${slug}/icon/180.png`);
  setTag('meta[name="theme-color"]', meta('theme-color'), 'content', color);
  setTag('meta[name="apple-mobile-web-app-capable"]', meta('apple-mobile-web-app-capable'), 'content', 'yes');
  setTag('meta[name="mobile-web-app-capable"]', meta('mobile-web-app-capable'), 'content', 'yes');
  setTag('meta[name="apple-mobile-web-app-title"]', meta('apple-mobile-web-app-title'), 'content', name.length > 14 ? name.split(' ')[0] : name);
  setTag('meta[name="apple-mobile-web-app-status-bar-style"]', meta('apple-mobile-web-app-status-bar-style'), 'content', 'default');
  document.title = `${name} · Tarjeta`;
}

// ---------- Conexión ----------
export function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}
