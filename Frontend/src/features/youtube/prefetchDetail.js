import { api } from './lib/api.js'
import { createIntentPrefetcher, defaultCanRun } from './intentPrefetch.js'

const prefetcher = createIntentPrefetcher({ canRun: defaultCanRun })

const tasks = {
  // Álbum, artista y playlist pasan por la misma caché que el clic (detailCache): la precarga y la apertura
  // comparten la petición en vuelo y el resultado. Canción: solo resuelve la URL firmada; el audio espera al clic.
  album: (id) => () => api.prefetchAlbum(id),
  artist: (id) => () => api.prefetchArtist(id),
  playlist: (id) => () => api.prefetchPlaylist(id),
  song: (id) => () => api.warmStream(id),
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
