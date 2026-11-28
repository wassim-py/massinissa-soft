// Classty Service Worker - App Shell + Immutable Static Bundle Caching
// Deliberately NO offline write queue or API/RSC caching so live data stays authoritative.

// Auto-unregister immediately in local development environments
if (
  typeof location !== 'undefined' &&
  (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
) {
  self.registration?.unregister();
}

const CACHE_NAME = 'classty-shell-v3';

const PRECACHE_ASSETS = [
  '/manifest.webmanifest',
  '/favicon.ico',
  '/logo.png',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/apple-touch-icon.png',
  '/icons/apple-splash.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(PRECACHE_ASSETS).catch((err) => {
          console.warn('[SW] Pre-caching partial failure, proceeding:', err);
        });
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              console.log('[SW] Removing old cache:', key);
              return caches.delete(key);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // In development/localhost, bypass SW completely so hot reloads always hit the server
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    return;
  }

  // Only handle GET requests on same-origin
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  // Always bypass API, tRPC, RSC flight requests, and Clerk auth API endpoints
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/trpc/') ||
    (url.pathname.startsWith('/__clerk/') && !url.pathname.startsWith('/__clerk/npm/')) ||
    request.headers.get('RSC') === '1'
  ) {
    return;
  }

  // 1. Immutable content-hashed Next.js static chunks, versioned Clerk JS bundle, and static media: Cache-First
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/__clerk/npm/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.woff2')
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // 2. Navigation requests: Network-First (online priority, fallback to cache if network drops)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(request).then((cached) => {
            if (cached) return cached;
            return caches.match('/logo.png');
          });
        })
    );
  }
});
