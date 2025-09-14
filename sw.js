// sw.js — Progressive Web App Service Worker
// Offline-first with versioned precache + stale-while-revalidate runtime cache

/* ====== CONFIG ====== */
const VERSION = 'v1.0.0-' + (self.registration?.scope || '') + Date.now();
const PRECACHE = `precache-${VERSION}`;
const RUNTIME  = `runtime-${VERSION}`;

// List everything you want guaranteed offline.
// Keep paths relative to the SW scope.
const PRECACHE_URLS = [
    './',                          // start_url
    './index.html',                // if you deploy as "index.html"
    './styles.css',
    './app.js',
    './data/course.index.json',
    './manifest.webmanifest',
    './assets/PNG/tab_icon.png',
    './assets/SVG/app_logo.svg',
    './assets/SVG/Bashalinka_top_left.svg',
    './assets/SVG/welcome.svg',
    './assets/SVG/failed.svg',
    './assets/SVG/next_lession.svg',
    // README is not needed in the app shell; add it if you really want it:
    // './README.md'
];

/* ====== INSTALL ====== */
self.addEventListener('install', event => {
  // Activate this SW immediately on next load
  self.skipWaiting();

  event.waitUntil((async () => {
    const cache = await caches.open(PRECACHE);
    // Use {cache: 'reload'} for HTML to avoid stale index during first load
    const requests = PRECACHE_URLS.map(url =>
      url.match(/\.html?$|^\.\/$/) ? new Request(url, { cache: 'reload' }) : url
    );
    await cache.addAll(requests);
  })());
});

/* ====== ACTIVATE ====== */
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Clean up old caches
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(key => key !== PRECACHE && key !== RUNTIME)
        .map(key => caches.delete(key))
    );

    // Navigation Preload can speed up navigations
    if ('navigationPreload' in self.registration) {
      try { await self.registration.navigationPreload.enable(); } catch {}
    }

    // Take control of open clients immediately
    await self.clients.claim();
  })());
});

/* ====== FETCH ====== */
self.addEventListener('fetch', event => {
   const { request } = event;

  // Only handle same-origin GETs
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
    return; // let the network handle it
  }

  // 1) Handle navigations (SPA/MPA): network first, then cache, then fallback to index
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        // Use navigation preload response if available
        const preload = await event.preloadResponse;
        if (preload) return preload;

        const networkResponse = await fetch(request);
        // Optionally cache a copy of the response for offline navigations
        const cache = await caches.open(RUNTIME);
        cache.put(request, networkResponse.clone());
        return networkResponse;
      } catch (err) {
        // Offline: serve precached app shell (prefer explicit index.html, else root)
        const cache = await caches.open(PRECACHE);
        return (
          (await cache.match('./index.html')) ||
          (await cache.match('./')) ||
          new Response('Offline', { status: 503, statusText: 'Offline' })
        );
      }
    })());
    return;
  }

  // 2) For static assets (CSS/JS/JSON/images): stale-while-revalidate
  event.respondWith((async () => {
    const cache = await caches.open(RUNTIME);

    const cached = await caches.match(request);
    const fetchPromise = fetch(request)
      .then(response => {
        // Only cache successful, basic (same-origin) responses
        if (response && response.status === 200 && response.type === 'basic') {
          cache.put(request, response.clone()).catch(() => {});
        }
        return response;
      })
      .catch(() => undefined);

    // Return cached immediately if present; otherwise wait for network
    return cached || (await fetchPromise) || fallbackFor(request);
  })());
});

/* ====== MESSAGE (for skipWaiting) ====== */
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/* ====== HELPERS ====== */
async function fallbackFor(request) {
  // If the request was for an image, serve a tiny empty SVG placeholder
  if (request.destination === 'image') {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>`;
    return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml' } });
  }
  // Default: try the precache (last resort)
  const cache = await caches.open(PRECACHE);
  const hit =
      (await cache.match(request)) ||
      (await cache.match('./index.html'));
  return hit || new Response('Offline', { status: 503, statusText: 'Offline' });
}
