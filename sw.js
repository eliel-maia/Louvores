const CACHE_NAME = 'louvores-pwa-v19';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './icone.png'
];

self.addEventListener('install', (event) => {

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );

});

self.addEventListener('activate', (event) => {

  event.waitUntil(
    Promise.all([
      caches.keys().then(names =>
        Promise.all(
          names
            .filter(name => name !== CACHE_NAME)
            .map(name => caches.delete(name))
        )
      ),
      self.clients.claim()
    ])
  );

});

self.addEventListener('fetch', (event) => {

  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (!url.protocol.startsWith('http')) return;

  // Supabase
  if (url.hostname.includes('supabase.co')) {

    event.respondWith(

      fetch(request)
        .catch(() =>
          new Response(
            JSON.stringify({
              offline: true
            }),
            {
              status: 503,
              headers: {
                'Content-Type': 'application/json'
              }
            }
          )
        )

    );

    return;
  }

  // Arquivos críticos
  const arquivoCritico =
    url.pathname.endsWith('/index.html') ||
    url.pathname.endsWith('index.html') ||
    url.pathname.endsWith('script.js') ||
    url.pathname.endsWith('style.css') ||
    url.pathname.endsWith('manifest.json');

  if (arquivoCritico) {

    event.respondWith(

      fetch(request)
        .then(response => {

          const clone = response.clone();

          caches.open(CACHE_NAME)
            .then(cache => cache.put(request, clone));

          return response;

        })
        .catch(() => caches.match(request))

    );

    return;
  }

  // Navegação
  if (request.mode === 'navigate') {

    event.respondWith(

      fetch(request)
        .then(response => {

          const clone = response.clone();

          caches.open(CACHE_NAME)
            .then(cache => cache.put(request, clone));

          return response;

        })
        .catch(async () => {

          const fallback =
            await caches.match('./index.html') ||
            await caches.match('./');

          return fallback;

        })

    );

    return;
  }

  // Demais arquivos
  event.respondWith(

    caches.match(request)
      .then(cached => {

        const networkFetch = fetch(request)
          .then(response => {

            if (response.status === 200) {

              const clone = response.clone();

              caches.open(CACHE_NAME)
                .then(cache => cache.put(request, clone));

            }

            return response;

          });

        return cached || networkFetch;

      })

  );

});

self.addEventListener('message', (event) => {

  if (
    event.data &&
    event.data.type === 'SKIP_WAITING'
  ) {
    self.skipWaiting();
  }

});
