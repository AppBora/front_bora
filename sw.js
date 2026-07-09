// Service worker do BoraHapp (PWA): cache leve de estáticos; API sempre na rede.
const CACHE = 'borahapp-v1';
const ESTATICOS = ['/assets/css/styles.css?v=20260623', '/assets/img/icone-bora.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ESTATICOS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api') || url.pathname.startsWith('/auth')
      || url.pathname.startsWith('/public') || url.pathname.startsWith('/admin-bora')) {
    return; // API: sempre rede (dados ao vivo)
  }
  // estáticos: rede primeiro, cache como fallback (offline básico)
  e.respondWith(
    fetch(e.request).then(r => {
      if (r.ok && url.origin === location.origin) {
        const cp = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, cp)).catch(() => {});
      }
      return r;
    }).catch(() => caches.match(e.request))
  );
});
