/* VLUX Loyalty · Service Worker (V0.2.2)
 * Reglas de seguridad:
 *  - Solo guarda en caché recursos PÚBLICOS y estáticos: index.html (sin datos), /assets/* con hash.
 *  - NUNCA guarda /api/*, /t*, /restablecer ni nada con datos del cliente, sesiones o tokens.
 *  - Solo atiende peticiones GET del mismo origen. Los POST (sellos, canjes, registro) van directo a la red.
 *  - Sin conexión: se muestra la app con un aviso; los datos vienen siempre del servidor (no hay sellado offline).
 * El identificador de build y la lista de archivos se insertan al compilar (vite.config.ts).
 */
const BUILD_ID = '__BUILD_ID__';
const CACHE = `vlux-shell-${BUILD_ID}`;
const PRECACHE = __PRECACHE__;
const SHELL = '/index.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll([SHELL, ...PRECACHE].map((u) => new Request(u, { cache: 'reload', credentials: 'same-origin' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('vlux-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const isPrivatePath = (p) => p.startsWith('/api/') || p === '/api' || p === '/t' || p.startsWith('/t/') || p === '/restablecer' || p === '/sw.js';

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (isPrivatePath(url.pathname)) return; // red directa, sin caché

  // Navegación (abrir la app o cambiar de página): red primero; sin conexión, la app desde caché.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.open(CACHE).then((c) => c.match(SHELL)).then((r) => r || Response.error())),
    );
    return;
  }

  // Archivos con hash (inmutables): caché primero.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(CACHE).then((cache) => cache.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok && res.type === 'basic') cache.put(req, res.clone());
        return res;
      }))),
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data === 'vlux:version') event.source && event.source.postMessage({ type: 'vlux:version', build: BUILD_ID });
});

/* V0.4.6 · Notificaciones Web Push. El servidor envía un mensaje cifrado (título, texto y una ruta de ESTE sitio).
 * Solo se abren rutas del mismo origen: un mensaje nunca puede llevar al cliente a otro sitio. */
const safePath = (u) => (typeof u === 'string' && /^\/[^/\\]/.test(u) && u.length <= 200 ? u : '/');
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }
  const title = typeof data.title === 'string' && data.title ? data.title.slice(0, 60) : 'VLUX Loyalty';
  const options = {
    body: typeof data.body === 'string' ? data.body.slice(0, 180) : '',
    icon: typeof data.icon === 'string' && data.icon.startsWith('/api/pwa/') ? data.icon : undefined,
    tag: typeof data.tag === 'string' ? data.tag.slice(0, 40) : undefined,
    data: { url: safePath(data.url) },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(safePath(event.notification.data && event.notification.data.url), self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url === target && 'focus' in c) return c.focus();
      }
      return self.clients.openWindow ? self.clients.openWindow(target) : undefined;
    }),
  );
});
