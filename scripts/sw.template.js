/*
 * NEXORA POS service worker.
 * This file is a TEMPLATE. `npm run build` runs scripts/build-sw.mjs, which injects the
 * list of every exported file and writes the result to out/sw.js.
 *
 * Strategy
 *  - install:   precache the whole app shell (every page, JS, CSS, icon, manifest).
 *  - navigate:  serve the precached page (works offline), else network, else the dashboard shell.
 *  - assets:    precache first, then runtime cache, then network.
 *  - update:    a new worker waits until the user chooses "Reload" (never swaps code mid-sale).
 *  Business data is NOT cached here — it lives in IndexedDB.
 */
const VERSION = '__VERSION__';
const PRECACHE = `nexora-precache-${VERSION}`;
const RUNTIME = 'nexora-runtime-v1';
const ASSETS = __ASSETS__;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(PRECACHE).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('nexora-precache-') && k !== PRECACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

// '/checkout' and '/checkout/?sale=1' → '/checkout/'
function pageKey(url) {
  let p = url.pathname;
  if (!p.endsWith('/') && !/\.[a-z0-9]+$/i.test(p)) p += '/';
  return p;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Next.js also sends HEAD probes for each <Link>; answer those from the cache as well.
  if (req.method !== 'GET' && req.method !== 'HEAD') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const precache = await caches.open(PRECACHE);

      if (req.method === 'HEAD') {
        const hit =
          (await precache.match(pageKey(url), { ignoreSearch: true, ignoreMethod: true })) ||
          (await precache.match(req, { ignoreSearch: true, ignoreMethod: true }));
        if (hit) return new Response(null, { status: hit.status, statusText: hit.statusText, headers: hit.headers });
        try {
          return await fetch(req);
        } catch {
          return Response.error();
        }
      }

      if (req.mode === 'navigate') {
        const hit = await precache.match(pageKey(url), { ignoreSearch: true });
        if (hit) return hit;
        try {
          return await fetch(req);
        } catch {
          return (await precache.match('/', { ignoreSearch: true })) || (await precache.match('/404.html')) || Response.error();
        }
      }

      // ignoreSearch: Next appends ?_rsc=… to client-navigation payload requests.
      const cached = (await precache.match(req, { ignoreSearch: true })) || (await caches.match(req, { ignoreSearch: true }));
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res.ok) (await caches.open(RUNTIME)).put(req, res.clone());
        return res;
      } catch {
        return Response.error();
      }
    })(),
  );
});
