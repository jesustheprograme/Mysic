const SHELL_CACHE = 'mysic-shell-v2'
const STATIC_CACHE = 'mysic-static-v2'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(['/', '/manifest.webmanifest', '/favicon.svg'])))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => ![SHELL_CACHE, STATIC_CACHE].includes(key))
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'CACHE_URLS' || !Array.isArray(event.data.urls)) return
  const urls = event.data.urls.filter((url) => new URL(url, self.location.origin).origin === self.location.origin)
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(urls)))
})

async function cacheResponse(cacheName, request, response) {
  if (!response.ok) return response
  const copy = response.clone()
  const cache = await caches.open(cacheName)
  await cache.put(request, copy)
  return response
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request)
        return await cacheResponse(SHELL_CACHE, '/', response)
      } catch {
        return caches.match('/')
      }
    })())
    return
  }

  event.respondWith((async () => {
    const cached = await caches.match(request)
    if (cached) return cached
    const response = await fetch(request)
    return cacheResponse(STATIC_CACHE, request, response)
  })())
})
