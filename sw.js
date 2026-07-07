const CACHE = 'emojicle-4c81f39a';
// Production and the /staging/ preview share one origin, so cache names are
// namespaced by SW scope and cleanup only ever touches this scope's caches —
// otherwise the two workers would delete each other's caches on activate.
const SCOPED_CACHE = CACHE + '::' + self.registration.scope;
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './games-common.js',
  './games.js',
  './minigames.js',
  './safari.js',
  './runner.js',
  './jam.js',
  './parts-data.js',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-maskable.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(SCOPED_CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(k => (k.endsWith('::' + self.registration.scope) && k !== SCOPED_CACHE) ||
                     (k.startsWith('emojicle-') && !k.includes('::')))   // pre-scoping caches
        .map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Navigations carry share params (?e=…&d=…, ?j=…) that aren't part of the
  // cache key for './' — without ignoreSearch a shared link misses the cache
  // and dies offline.
  e.respondWith(
    caches.match(e.request, { ignoreSearch: e.request.mode === 'navigate' })
      .then(cached => cached || fetch(e.request))
  );
});
