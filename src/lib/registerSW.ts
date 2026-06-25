let waitingWorker: ServiceWorker | null = null
let updating = false
let updateNotified = false

function appVersion() {
  return document.querySelector<HTMLMetaElement>('meta[name="app-version"]')?.content || 'dev'
}

function notifyUpdate(onUpdate: () => void) {
  if (updateNotified) return
  updateNotified = true
  onUpdate()
}

async function checkVersion(onUpdate: () => void) {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, {
      cache: 'no-store',
    })
    if (!response.ok) return
    const data = (await response.json()) as { version?: string }
    if (data.version && data.version !== appVersion()) {
      notifyUpdate(onUpdate)
    }
  } catch {
    // Version polling is only a fallback; SW lifecycle events remain the primary signal.
  }
}

export function registerServiceWorker(onUpdate: () => void) {
  if (import.meta.env.DEV) return
  if (!('serviceWorker' in navigator)) return

  const swUrl = `${import.meta.env.BASE_URL}sw.js`

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updating) window.location.reload()
  })

  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'SW_ACTIVATED' && navigator.serviceWorker.controller) {
      notifyUpdate(onUpdate)
    }
  })

  navigator.serviceWorker
    .register(swUrl, { updateViaCache: 'none' })
    .then((registration) => {
      const watch = (worker: ServiceWorker | null) => {
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            waitingWorker = worker
            notifyUpdate(onUpdate)
          }
        })
      }

      if (registration.waiting && navigator.serviceWorker.controller) {
        waitingWorker = registration.waiting
        notifyUpdate(onUpdate)
      }

      if (registration.installing) watch(registration.installing)
      registration.addEventListener('updatefound', () => watch(registration.installing))

      const runVersionCheck = () => checkVersion(onUpdate)
      window.addEventListener('focus', runVersionCheck)
      window.addEventListener('online', runVersionCheck)
      window.addEventListener('pageshow', runVersionCheck)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') runVersionCheck()
      })
      window.setTimeout(runVersionCheck, 8000)
      window.setInterval(runVersionCheck, 180000)
    })
    .catch((error) => console.warn('[SW] registration failed; app can still run without offline cache.', error))
}

export function applyServiceWorkerUpdate() {
  updating = true
  if (waitingWorker) {
    waitingWorker.postMessage({ type: 'SKIP_WAITING' })
  } else {
    window.location.reload()
  }
}
