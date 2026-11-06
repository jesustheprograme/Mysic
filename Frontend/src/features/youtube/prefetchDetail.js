import { api, fetchJson } from './lib/api.js'
import { createIntentPrefetcher, defaultCanRun } from './intentPrefetch.js'

const prefetcher = createIntentPrefetcher({ canRun: defaultCanRun })

const tasks = {
  // Artista: caché en memoria del cliente generado. Álbum y playlist: la respuesta queda en la caché HTTP.
  album: (id) => () => fetchJson(`/album/${encodeURIComponent(id)}`),
  artist: (id) => () => api.prefetchArtist(id),
  playlist: (id) => () => fetchJson(`/playlist/${encodeURIComponent(id)}`),
}

/** Devuelve el par de manejadores (intención / fin de intención) para una tarjeta de ese tipo. */
export function prefetchHandlers(kind, id) {
  const build = tasks[kind]
  if (!build || !id) return {}
  const key = `${kind}:${id}`
  return {
    start: () => prefetcher.schedule(key, build(id)),
    stop: () => prefetcher.cancel(key),
  }
}
