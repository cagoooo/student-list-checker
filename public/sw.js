// Service Worker for 學生名單校對平台.
// finalize-build.mjs replaces this placeholder in dist/sw.js.
const BUILD_VERSION = '__BUILD_VERSION__'
// 同一網域（cagoooo.github.io）的所有工具共用快取空間，只能清除自己這個前綴的快取
const CACHE_PREFIX = 'student-list-checker-'
const CACHE_NAME = `${CACHE_PREFIX}${BUILD_VERSION}`
// 舊版用過的快取名稱：refine-<commit>-<建置時間>（部署流程注入），也算自己的快取
const LEGACY_CACHE_RE = /^refine-[0-9a-f]{7,12}-\d{8}T?\d{4}$/
const isOwnCache = (key) => key.startsWith(CACHE_PREFIX) || LEGACY_CACHE_RE.test(key)

self.addEventListener('install', () => {
  // Keep the new worker waiting so the app can show a prompt-to-refresh banner.
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => isOwnCache(key) && key !== CACHE_NAME).map((key) => caches.delete(key))))
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
