const CACHE_NAME = 'aurelia-arena-v4';
const CORE_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_SHELL)).catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never intercept API calls, Firebase/Google auth & Firestore traffic, or Vite dev/source modules
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/node_modules/') ||
    url.pathname.startsWith('/@') ||
    url.pathname.endsWith('.ts') ||
    url.pathname.endsWith('.tsx') ||
    url.pathname.endsWith('.jsx') ||
    (url.hostname.includes('googleapis.com') && url.hostname !== 'fonts.googleapis.com') ||
    url.hostname.includes('firebaseapp.com') ||
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('google.com')
  ) {
    return;
  }

  // Network-first for HTML navigations so fresh builds load immediately, falling back to cached shell offline
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok && url.origin === self.location.origin) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => undefined);
          }
          return response;
        })
        .catch(async () => {
          const cached = (await caches.match('/index.html')) || (await caches.match('/'));
          return cached || Response.error();
        })
    );
    return;
  }

  // Cache only production built assets, icons, images, and Google Fonts
  const isCacheableStatic =
    (url.origin === self.location.origin &&
      (url.pathname.startsWith('/assets/') ||
        /\.(png|jpg|jpeg|webp|svg|ico|woff2?|css)$/i.test(url.pathname) ||
        url.pathname === '/manifest.json')) ||
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com';

  if (isCacheableStatic) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkFetch = fetch(request)
          .then((response) => {
            if (response && (response.ok || response.type === 'opaque')) {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => undefined);
            }
            return response;
          })
          .catch(() => cached || Response.error());
        return cached || networkFetch;
      })
    );
  }
});
