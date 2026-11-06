/** Origen (esquema + host) de una URL absoluta, o null si es relativa o inválida. */
export function originOf(url) {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.origin : null
  } catch {
    return null
  }
}

/** Orígenes a los que conviene abrir la conexión (DNS + TLS) antes de la primera petición. */
export function preconnectTargets(apiUrl) {
  const apiOrigin = originOf(apiUrl)
  return [
    ...(apiOrigin ? [{ origin: apiOrigin, credentials: true }] : []),
    { origin: 'https://www.youtube.com', credentials: false },
    { origin: 'https://i.ytimg.com', credentials: false },
    { origin: 'https://yt3.googleusercontent.com', credentials: false },
  ]
}

function addPreconnect({ origin, credentials }) {
  if (document.head.querySelector(`link[rel="preconnect"][href="${origin}"]`)) return
  const link = document.createElement('link')
  link.rel = 'preconnect'
  link.href = origin
  // Las peticiones de la API van con cookies (credentials: 'include'): usan otro pool de conexiones.
  if (credentials) link.crossOrigin = 'use-credentials'
  document.head.append(link)
}

function whenIdle(callback, timeout = 2500) {
  if (typeof window.requestIdleCallback === 'function') {
    return window.requestIdleCallback(callback, { timeout })
  }
  return window.setTimeout(callback, 1200)
}

/**
 * Calienta lo que la aplicación casi seguro va a necesitar: conexiones a la API y a YouTube
 * y los chunks del reproductor y de la sección YouTube Music, que son lazy y de otro modo
 * no se descargan hasta el primer clic. No hace nada con ahorro de datos activado.
 */
export function startWarmup({ apiUrl, loaders = [] }) {
  preconnectTargets(apiUrl).forEach(addPreconnect)

  if (navigator.connection?.saveData) return
  whenIdle(() => {
    loaders.forEach((load) => {
      // Un fallo de red aquí no importa: el chunk se pedirá de nuevo cuando haga falta.
      load().catch(() => {})
    })
  })
}
