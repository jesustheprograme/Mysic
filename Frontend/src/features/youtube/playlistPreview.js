import { useEffect, useState } from 'react'

// Vista previa de playlists (sus primeras canciones) para el bloque "De la comunidad".
// Reglas para no saturar: se pide solo cuando la tarjeta es visible, como mucho 2 a la vez, con
// caché de 5 minutos y sin repetir peticiones en vuelo.

const TTL_MS = 5 * 60 * 1000
const MAX_CONCURRENT = 2

/** Cola con límite de concurrencia: `run(task)` devuelve una promesa con el resultado de `task`. */
export function createLimiter(limit) {
  let running = 0
  const waiting = []
  const pump = () => {
    while (running < limit && waiting.length) {
      const { task, resolve, reject } = waiting.shift()
      running += 1
      Promise.resolve().then(task).then(resolve, reject).finally(() => {
        running -= 1
        pump()
      })
    }
  }
  return (task) => new Promise((resolve, reject) => {
    waiting.push({ reject, resolve, task })
    pump()
  })
}

const limiter = createLimiter(MAX_CONCURRENT)
const cache = new Map() // id -> { at, value } | { promise }

// El cliente de la API se importa al usarlo: así este módulo se puede probar sin el entorno del navegador.
const defaultLoad = (playlistId) => import('./lib/api.js').then(({ api }) => api.playlist(playlistId))

export function loadPlaylistPreview(id, { now = Date.now, load = defaultLoad } = {}) {
  const hit = cache.get(id)
  if (hit?.promise) return hit.promise
  if (hit && now() - hit.at < TTL_MS) return Promise.resolve(hit.value)
  const promise = limiter(() => load(id)).then(
    (value) => {
      cache.set(id, { at: now(), value })
      return value
    },
    (error) => {
      cache.delete(id)
      throw error
    },
  )
  cache.set(id, { promise })
  return promise
}

/** Datos de la playlist cuando `enabled` pasa a true. Devuelve `{ data, error, loading }`. */
export function usePlaylistPreview(id, enabled) {
  const [state, setState] = useState({ data: null, error: false })

  useEffect(() => {
    if (!enabled || !id) return undefined
    let cancelled = false
    loadPlaylistPreview(id)
      .then((data) => { if (!cancelled) setState({ data, error: false }) })
      .catch(() => { if (!cancelled) setState({ data: null, error: true }) })
    return () => { cancelled = true }
  }, [enabled, id])

  return { ...state, loading: enabled && !state.data && !state.error }
}
