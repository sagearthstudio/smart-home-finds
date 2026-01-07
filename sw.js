// ✅ Safe SW: caches static assets, but ALWAYS fetches products.json fresh.
const CACHE = "shf-cache-v3";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./assets/styles.css",
  "./assets/app.js",
  "./manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => (k === CACHE ? null : caches.delete(k)))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // 🚫 Never cache products JSON — always network
  if (url.pathname.endsWith("/data/products.json")) {
    event.respondWith(fetch(event.request, { cache: "no-store" }));
    return;
  }

  // Default: cache-first for static
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
