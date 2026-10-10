// sw.js — Service worker: guarda la app en el celular para que abra sin señal.
// Si cambiás algún archivo de la app, subí el número de versión para que
// los celulares descarguen la versión nueva.
const VERSION = "ryder-v3";
const SHELL = [
  "./", "index.html", "styles.css", "app.js", "golf.js", "data.js", "firebase-config.js",
  "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-180.png"
];
const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)
    .then(() => c.addAll(["firebase-app.js", "firebase-firestore.js", "firebase-auth.js"].map(f => SDK + f)).catch(() => {}))));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  const ours = url.origin === location.origin;
  const cdn = url.href.startsWith(SDK) || url.host === "fonts.googleapis.com" || url.host === "fonts.gstatic.com";
  if (!ours && !cdn) return; // Firestore y Auth manejan su propia red

  // Primero lo guardado (rápido y offline); en paralelo, actualizamos el cache.
  e.respondWith(caches.open(VERSION).then(async cache => {
    const cached = await cache.match(e.request, { ignoreSearch: ours });
    const net = fetch(e.request).then(r => { if (r.ok) cache.put(e.request, r.clone()); return r; }).catch(() => cached);
    return cached || net;
  }));
});
