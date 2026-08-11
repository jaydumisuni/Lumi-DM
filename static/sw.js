const CACHE_NAME = 'LUMIDM-static-v2';
const CORE = [
  '/',
  '/static/index.html',
  '/static/app.css',
  '/static/technician-workspaces.css',
  '/static/operating-systems.css',
  '/static/ttg-shell.css',
  '/static/ttg-theme.css',
  '/static/main-ui.css',
  '/static/lumi-approved-ui.css',
  '/static/lumi-clear-glass.css',
  '/static/app.js',
  '/static/app-hardening.js',
  '/static/technician-workspaces.js',
  '/static/operating-systems.js',
  '/static/ttg-shell.js',
  '/static/lumi-theme.js',
  '/static/main-ui.js',
  '/static/main-ui-core.js',
  '/static/main-ui-views.js',
  '/static/main-ui-settings.js',
  '/static/main-ui-shell.js',
  '/static/main-ui-download.js',
  '/static/main-ui-fixes.js',
  '/static/lumi-ui.js',
  '/static/manifest.webmanifest',
  '/static/favicon-32.png',
  '/static/favicon-96.png',
  '/static/favicon-192.png',
  '/static/favicon-256.png',
  '/static/favicon-512.png'
];

self.addEventListener('install', (evt) => {
  self.skipWaiting();
  evt.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE)).catch(() => {})
  );
});

self.addEventListener('activate', (evt) => {
  evt.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(k => { if (k !== CACHE_NAME) return caches.delete(k); })
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (evt) => {
  if (evt.request.method !== 'GET') return;
  evt.respondWith(
    caches.match(evt.request).then(res => res || fetch(evt.request).then(fetchRes => {
      try {
        if (fetchRes && fetchRes.status === 200) {
          caches.open(CACHE_NAME).then(cache => cache.put(evt.request, fetchRes.clone()));
        }
      } catch (_) {}
      return fetchRes;
    }).catch(() => evt.request.mode === 'navigate'
      ? caches.match('/static/index.html')
      : Response.error()))
  );
});
