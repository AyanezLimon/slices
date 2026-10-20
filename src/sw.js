/* Slices · service worker. Plantilla: vite.config.js reemplaza la versión y la lista de precache en cada build. */
const VERSION = __VERSION__;
const PRECACHE = __PRECACHE__;
const CACHE = 'slices-' + VERSION;
const FONTS = 'slices-fonts';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('slices-') && key !== CACHE && key !== FONTS) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'version' && event.source) event.source.postMessage({ type: 'version', version: VERSION });
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // La app siempre intenta la versión más nueva; sin red usa la guardada.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('./', copy)); return res; })
        .catch(() => caches.match('./'))
    );
    return;
  }

  if (url.origin === self.location.origin) {
    if (url.pathname.endsWith('/version.json')) return; // siempre a la red
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      }))
    );
    return;
  }

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(caches.open(FONTS).then(async (c) => {
      const hit = await c.match(req);
      const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
  }
  // Supabase y demás: directo a la red.
});

// Cada push SIEMPRE muestra una notificación (iOS revoca la suscripción si no).
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { title: 'Slices', body: event.data ? event.data.text() : '' }; }
  const show = self.registration.showNotification(d.title || 'Slices', {
    body: d.body || '',
    tag: d.tag,
    renotify: Boolean(d.tag),
    icon: 'icons/icon-192.png',
    badge: 'icons/badge-96.png',
    data: { url: d.url || '#/hoy' }
  });
  const ack = d.ack
    ? self.registration.pushManager.getSubscription().then((s) => s && fetch(d.ack.url, {
        method: 'POST',
        headers: { apikey: d.ack.key, Authorization: 'Bearer ' + d.ack.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_endpoint: s.endpoint })
      })).catch(() => {})
    : Promise.resolve();
  event.waitUntil(Promise.all([show, ack]));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '#/hoy', self.registration.scope).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (w.url.startsWith(self.registration.scope)) {
        await w.focus();
        w.postMessage({ type: 'open', url: target });
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});
