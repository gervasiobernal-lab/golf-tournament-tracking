// sw.js — Service worker: guarda la app en el celular para que abra sin señal.
// Archivos de la app: primero intenta la red (así siempre toma la última
// versión publicada) y, si no hay señal, usa la copia guardada.
// Si cambiás algún archivo de la app, subí igual el número de versión.
const VERSION = "ryder-v5";
const SHELL = [
  "./", "index.html", "styles.css", "app.js", "golf.js", "data.js", "firebase-config.js",
  "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-180.png"
];
const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c =>
    // cache: "reload" evita que el navegador use copias viejas al instalar.
    c.addAll(SHELL.map(u => new Request(u, { cache: "reload" })))
      .then(() => c.addAll(["firebase-app.js", "firebase-firestore.js", "firebase-auth.js"].map(f => SDK + f)).catch(() => {}))));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))));
  self.clients.claim();
});

// Espera la red como máximo `ms` milisegundos (con poca señal no queremos colgarnos).
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  const ours = url.origin === location.origin;
  const cdn = url.href.startsWith(SDK) || url.host === "fonts.googleapis.com" || url.host === "fonts.gstatic.com";
  if (!ours && !cdn) return; // Firestore y Auth manejan su propia red

  e.respondWith(caches.open(VERSION).then(async cache => {
    if (ours) {
      // Archivos de la app: red primero, copia guardada si no hay señal.
      try {
        const r = await withTimeout(fetch(e.request, { cache: "no-cache" }), 4000);
        if (r.ok) cache.put(e.request, r.clone());
        return r;
      } catch (err) {
        return (await cache.match(e.request, { ignoreSearch: true })) || Response.error();
      }
    }
    // Librerías y tipografías (no cambian): copia guardada primero.
    const cached = await cache.match(e.request);
    if (cached) return cached;
    const r = await fetch(e.request);
    if (r.ok) cache.put(e.request, r.clone());
    return r;
  }));
});
