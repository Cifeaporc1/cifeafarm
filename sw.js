// Guarda la "carcasa" de la app para que abra rápido y se pueda instalar.
// Los datos siempre se piden a Supabase (no se guardan en el móvil).
const CACHE = 'cifeafarm-v0.5.1';
const ARCHIVOS = [
  './', 'index.html', 'css/estilos.css', 'js/config.js', 'js/logica.js', 'js/app.js', 'manifest.webmanifest',
  'img/logo.jpg', 'img/logo-mini.jpg', 'img/icono-192.png', 'img/icono-512.png', 'img/rumi.jpg', 'img/rumi-logo.jpg', 'img/porc.png',
  'porc/', 'porc/index.html', 'porc/css/estilos.css', 'porc/js/logica.js', 'porc/js/app.js', 'porc/img/logo.jpg', 'porc/img/logo-mini.jpg',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // Supabase y fuentes: siempre a la red
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then((r) => { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
