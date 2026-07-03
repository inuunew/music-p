const CACHE_NAME = "piringan-shell-v2"; // versi dinaikkan supaya cache lama (yang mungkin rusak) dibersihkan
const APP_SHELL = ["/", "/index.html", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// PENTING: jangan pernah sentuh request audio (byte-range), request lintas-origin
// (mis. link download lagu dari CDN eksternal), atau panggilan API — hanya
// tangani file "app shell" milik situs sendiri. Kalau ini dilanggar, audio
// streaming bisa rusak karena response partial (206) ke-cache secara salah.
self.addEventListener("fetch", (event) => {
  const req = event.request;

  if (req.method !== "GET") return;
  if (!req.url.startsWith(self.location.origin)) return; // request ke domain lain (mis. CDN audio) — biarkan lewat native
  if (req.headers.has("range")) return; // request streaming/byte-range — JANGAN pernah di-cache
  if (req.url.includes("/api/")) return; // panggilan API dinamis — jangan di-cache

  event.respondWith(
    fetch(req)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req))
  );
});
