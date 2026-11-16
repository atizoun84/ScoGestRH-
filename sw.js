/* ============================================
   ScoGestRH — Service Worker
   Cache-First (assets) · Network-First (HTML)
   Exclut Firebase RTDB et Auth
   ============================================ */

const CACHE_VERSION = 'scogestrh-v0.4.0';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './logo.png'
];

// URLs à NE JAMAIS mettre en cache (Firebase + APIs externes)
const NEVER_CACHE = [
  'firebaseio.com',
  'firebasedatabase.app',
  'googleapis.com/identitytoolkit',
  'firebaseapp.com',
  'securetoken.googleapis.com',
  'gstatic.com/firebasejs'
];

function isNeverCache(url) {
  return NEVER_CACHE.some(pattern => url.includes(pattern));
}

/* ---------- Installation : précache des assets de base ---------- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] precache erreur :', err?.message))
  );
});

/* ---------- Activation : nettoyage des anciens caches ---------- */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_VERSION)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ---------- Fetch : stratégie hybride ---------- */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Ignore : méthodes non-GET, websockets, chrome-extension
  if (req.method !== 'GET') return;
  if (!req.url.startsWith('http')) return;

  // Exclure Firebase et autres APIs
  if (isNeverCache(req.url)) return;

  const isHTML = req.headers.get('accept')?.includes('text/html')
              || req.url.endsWith('/')
              || req.url.endsWith('.html');

  if (isHTML) {
    // Network-First pour le HTML (toujours la version la plus récente si online)
    event.respondWith(
      fetch(req)
        .then(res => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then(c => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then(cached => cached || caches.match('./index.html')))
    );
    return;
  }

  // Cache-First pour les assets (JS, CSS, images)
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
    })
  );
});

/* ---------- Message : forcer la mise à jour ---------- */
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
