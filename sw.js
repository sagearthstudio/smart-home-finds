/* Smart Home Finds — sw.js (PWA)
   Cache static assets for offline start.
   Do NOT aggressively cache GitHub API responses.
*/
const CACHE = 'shf-cache-v1';
const ASSETS = [
  './',
  './index.html',
  './privacy.html',
  './assets/css/style.css',
  './assets/js/app.js',
  './manifest.webmanifest',
  './assets/img/favicon.svg',
  './assets/img/icon-192.png',
  './assets/img/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k === CACHE ? null : caches.delete(k))))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // For same-origin static files: cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        // update cache for GET
        if (req.method === 'GET' && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached || caches.match('./index.html')))
    );
    return;
  }

  // For external requests (GitHub API etc.): network-first, no cache
  event.respondWith(fetch(req).catch(() => new Response('', { status: 504 })));
});
