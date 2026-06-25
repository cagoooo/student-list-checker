// Service Worker 註冊 + 更新偵測（雙線：SW lifecycle 事件 + activate postMessage）。
// 採 prompt-to-refresh：偵測到新版時呼叫 onUpdate，由 UI 顯示「立刻更新」提示，
// 使用者點了才 skipWaiting → controllerchange → reload。

let waitingWorker: ServiceWorker | null = null
let updating = false

export function registerServiceWorker(onUpdate: () => void) {
  if (import.meta.env.DEV) return
  if (!('serviceWorker' in navigator)) return

  const swUrl = `${import.meta.env.BASE_URL}sw.js`

  // 只有在使用者主動按下更新後（updating=true）才 reload，避免首次安裝時誤觸。
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updating) window.location.reload()
  })

  // 線 B：新 SW 在背景 activate 後主動通知（補捉 updatefound 沒抓到的情況）。
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'SW_ACTIVATED' && navigator.serviceWorker.controller) {
      onUpdate()
    }
  })

  // updateViaCache: 'none' → 繞過瀏覽器 HTTP 快取，確保每次都從網路抓 sw.js。
  navigator.serviceWorker
    .register(swUrl, { updateViaCache: 'none' })
    .then((registration) => {
      const watch = (worker: ServiceWorker | null) => {
        worker?.addEventListener('statechange', () => {
          // state=installed 且已有舊 controller = 這是「更新」而非首次安裝。
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            waitingWorker = worker
            onUpdate()
          }
        })
      }

      // 重整後新版可能已在 waiting，初次就要偵測（否則提示永遠不出現）。
      if (registration.waiting && navigator.serviceWorker.controller) {
        waitingWorker = registration.waiting
        onUpdate()
      }

      if (registration.installing) watch(registration.installing)
      registration.addEventListener('updatefound', () => watch(registration.installing))
    })
    .catch((error) => console.warn('[SW] 註冊失敗（本機開發可忽略）:', error))
}

export function applyServiceWorkerUpdate() {
  updating = true
  if (waitingWorker) {
    waitingWorker.postMessage({ type: 'SKIP_WAITING' })
  } else {
    window.location.reload()
  }
}
