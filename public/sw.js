// TOMNAP PWA Development Service Worker
// Geliştirme ortamında HMR'ı (Hot Module Reload) engellemeden PWA kurulum kriterlerini karşılar.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Geliştirme ortamında tüm istekleri doğrudan ağ üzerinden geçirir
  event.respondWith(fetch(event.request));
});
