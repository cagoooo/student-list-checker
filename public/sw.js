// Service Worker — 學生名單校對平台
// BUILD_VERSION 由 CI（deploy-pages.yml）在部署時以 sed 替換；本機開發保留 __BUILD_VERSION__ 原樣。
const BUILD_VERSION = '__BUILD_VERSION__'
const CACHE_NAME = `refine-${BUILD_VERSION}`

self.addEventListener('install', () => {
  // 不呼叫 skipWaiting — 採 prompt-to-refresh，不打斷正在使用的人。
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

  // HTML 導覽：network-first，永遠拿最新 index.html（避免 hash 過的 chunk 對不上）。
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
        .catch(() => caches.match(event.request).then((cached) => cached || Response.error())),
    )
  }
  // 其餘資源（Vite 已對 JS/CSS 加 hash 自動 cache-bust）走預設網路，不額外攔截。
})
