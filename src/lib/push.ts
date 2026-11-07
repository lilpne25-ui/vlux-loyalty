// V0.4.6 · Web Push en el navegador del cliente. Reglas:
// - Nunca se pide permiso al cargar la página: solo después de que el cliente lee la explicación y toca "Activar".
// - Si el permiso está bloqueado, no se vuelve a pedir: se explica cómo cambiarlo en los ajustes del teléfono.
// - En iPhone/iPad solo funciona desde la app agregada a la pantalla de inicio (iOS/iPadOS 16.4 o posterior).
import { detectPlatform, isStandalone } from './pwa';

export type PushSupport =
  | { ok: true }
  | { ok: false; reason: 'insecure' | 'no-sw' | 'no-push' | 'ios-install-first' | 'ios-old' };

export function pushSupport(): PushSupport {
  if (typeof window === 'undefined') return { ok: false, reason: 'no-sw' };
  if (!window.isSecureContext) return { ok: false, reason: 'insecure' };
  const platform = detectPlatform();
  const ios = platform === 'ios-safari' || platform === 'ios-other';
  if (ios && !isStandalone()) return { ok: false, reason: 'ios-install-first' };
  if (!('serviceWorker' in navigator)) return { ok: false, reason: 'no-sw' };
  if (!('PushManager' in window) || !('Notification' in window)) return { ok: false, reason: ios ? 'ios-old' : 'no-push' };
  return { ok: true };
}

export type PermissionState = 'granted' | 'denied' | 'default' | 'unsupported';
export function permissionState(): PermissionState {
  return typeof Notification === 'undefined' ? 'unsupported' : (Notification.permission as PermissionState);
}

export function platformTag(): 'ios' | 'android' | 'desktop' | 'otro' {
  const p = detectPlatform();
  return p.startsWith('ios') ? 'ios' : p === 'android' ? 'android' : p === 'desktop' ? 'desktop' : 'otro';
}

function keyBytes(b64url: string) {
  const pad = '='.repeat((4 - (b64url.length % 4)) % 4);
  const raw = atob((b64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
}

async function registration(timeoutMs = 6000): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (existing?.active) return existing;
  return Promise.race([navigator.serviceWorker.ready, new Promise<null>((r) => setTimeout(() => r(null), timeoutMs))]);
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await registration(3000);
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Debe llamarse desde un toque del cliente. Devuelve la suscripción o el motivo por el que no se pudo. */
export async function requestSubscription(publicKey: string): Promise<{ sub: PushSubscription } | { error: 'denied' | 'dismissed' | 'no-sw' | 'failed' }> {
  const perm = await Notification.requestPermission();
  if (perm === 'denied') return { error: 'denied' };
  if (perm !== 'granted') return { error: 'dismissed' };
  const reg = await registration();
  if (!reg) return { error: 'no-sw' };
  try {
    const existing = await reg.pushManager.getSubscription();
    if (existing) return { sub: existing };
    return { sub: await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }) };
  } catch {
    return { error: 'failed' };
  }
}

export function subscriptionBody(sub: PushSubscription) {
  const j = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  return { endpoint: j.endpoint ?? sub.endpoint, keys: { p256dh: j.keys?.p256dh ?? '', auth: j.keys?.auth ?? '' } };
}
