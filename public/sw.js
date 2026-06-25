// Service Worker for 學生名單校對平台.
// finalize-build.mjs replaces this placeholder in dist/sw.js.
const BUILD_VERSION = '__BUILD_VERSION__'
const CACHE_NAME = `refine-${BUILD_VERSION}`

self.addEventListener('install', () => {
  // Keep the new worker waiting so the app can show a prompt-to-refresh banner.
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
      .then(() =>
        self.clients.matchAll({ includeUncontrolled: true }).then((clients) => {
          clients.forEach((client) => client.postMessage({ type: 'SW_ACTIVATED', version: BUILD_VERSION }))
        }),
      ),
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  const url = new URL(event.request.url)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return
  if (url.origin !== self.location.origin) return

  if (url.pathname.endsWith('/version.json') || url.pathname.endsWith('version.json')) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }).catch(() => caches.match(event.request)))
    return
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
          }
          return response
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html'))),
    )
    return
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
          }
          return response
        })
        .catch(() => cached)

      return cached || network
    }),
  )
})
