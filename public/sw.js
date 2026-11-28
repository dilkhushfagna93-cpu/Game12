const CACHE_NAME = 'aurelia-arena-v5';
const CORE_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon.svg',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_SHELL))
      .catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Strictly bypass API routes, Firebase/Firestore/Google Auth traffic, and Vite dev/HMR modules
  if (
    url.protocol !== 'http:' &&
    url.protocol !== 'https:'
  ) {
    return;
  }

  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/node_modules/') ||
    url.pathname.startsWith('/@') ||
    url.pathname.startsWith('/__') ||
    url.searchParams.has('t') ||
    url.searchParams.has('v') ||
    url.pathname.endsWith('.ts') ||
    url.pathname.endsWith('.tsx') ||
    url.pathname.endsWith('.jsx') ||
    (url.hostname.includes('googleapis.com') && url.hostname !== 'fonts.googleapis.com') ||
    (url.hostname.includes('gstatic.com') && url.hostname !== 'fonts.gstatic.com') ||
    url.hostname.includes('firebaseapp.com') ||
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('firebase.com') ||
    url.hostname.includes('identitytoolkit') ||
    url.hostname.includes('securetoken') ||
    url.hostname.includes('google.com')
  ) {
    return;
  }

  // Network-first for HTML navigations so fresh builds load immediately with offline fallback
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
          const cached = (await caches.match(request)) || (await caches.match('/index.html')) || (await caches.match('/'));
          return cached || Response.error();
        })
    );
    return;
  }

  // Network-first for manifest, built production assets, icons, and fonts
  const isCacheableStatic =
    (url.origin === self.location.origin &&
      (url.pathname.startsWith('/assets/') ||
        /\.(png|jpg|jpeg|webp|svg|ico|woff2?|css)$/i.test(url.pathname) ||
        url.pathname === '/manifest.webmanifest' ||
        url.pathname === '/manifest.json')) ||
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com';

  if (isCacheableStatic) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && (response.ok || response.type === 'opaque')) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => undefined);
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || Response.error();
        })
    );
  }
});
