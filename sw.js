const CACHE = 'emojicle-b7e2d418';
// Production and the /staging/ preview share one origin, so cache names are
// namespaced by SW scope and cleanup only ever touches this scope's caches —
// otherwise the two workers would delete each other's caches on activate.
const SCOPED_CACHE = CACHE + '::' + self.registration.scope;
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './minigames.js',
  './safari.js',
  './runner.js',
  './jam.js',
  './parts-data.js',
  './manifest.json',
  './vendor/bulma.min.css',
  './icons/icon.svg',
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
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
