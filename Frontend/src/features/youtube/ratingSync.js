// Favoritos en las dos direcciones entre Mysic y la cuenta de YouTube Music vinculada.
//
//  - Mysic → YouTube: al marcar o desmarcar una canción (Me gusta), un álbum (guardado en la biblioteca) o un artista
//    (suscripción), el cambio se aplica al instante en Mysic y se reenvía al servidor (PUT/DELETE de
//    /library/rating/...). Si YouTube lo rechaza, Mysic deshace la marca y avisa. Un servidor sin esa ruta (versión
//    anterior) o una cuenta sin vincular no son errores: la marca se queda solo en Mysic, como siempre.
//  - YouTube → Mysic: cada sincronización de la biblioteca trae lo nuevo y lo quitado en YouTube. Lo que Mysic acaba
//    de cambiar vale más que lo que YouTube dice durante un rato (`recent`), para que una sincronización que sale a la
//    vez no deshaga el clic.

export const RECENT_MS = 2 * 60_000
const RETRY_DELAY_MS = 2500

const keyOf = (kind, id) => `${kind}:${id}`

/** ¿La respuesta es "esta ruta no existe en el servidor" (versión anterior) y no un 404 propio de la ruta? */
export const isUnsupportedRating = (error) => error?.status === 404 && !error?.code
/** Cuenta sin vincular: no hay nada que reenviar. */
export const isUnlinked = (error) => error?.status === 409 || error?.code === 'YOUTUBE_NOT_LINKED'
const isTransient = (error) => [502, 503, 504].includes(error?.status) || error?.name === 'TypeError'

// El módulo de red toca window al cargarse: se importa al enviar, no al arrancar (así las pruebas no lo necesitan).
async function requestRating(kind, id, on) {
  const { API_BASE } = await import('./lib/api.js')
  const response = await fetch(`${API_BASE}/library/rating/${kind}/${encodeURIComponent(id)}`, { credentials: 'include', method: on ? 'PUT' : 'DELETE' })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw Object.assign(new Error(body.error || `Error ${response.status}`), { code: body.code, status: response.status })
  }
  return response.json().catch(() => ({}))
}

/**
 * Estado de las marcas recientes y el reenvío. `request`, `now` y `wait` se inyectan para probarlo sin red.
 * `push` devuelve 'synced' | 'local' (no hay a dónde reenviar) | 'failed'.
 */
export function createRatingSync({ now = Date.now, request = requestRating, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  const recent = new Map()

  const prune = () => {
    const current = now()
    for (const [key, entry] of recent) if (entry.until <= current) recent.delete(key)
  }

  return {
    /** Lo último que el usuario marcó en Mysic para este elemento (true/false), o undefined si no hay marca reciente. */
    recent(kind, id) {
      prune()
      return recent.get(keyOf(kind, id))?.on
    },
    /** Anota la marca y la reenvía. Un reintento si el fallo parece pasajero. */
    async push(kind, id, on) {
      recent.set(keyOf(kind, id), { on, until: now() + RECENT_MS })
      for (let attempt = 0; ; attempt += 1) {
        try {
          await request(kind, id, on)
          return 'synced'
        } catch (error) {
          if (isUnsupportedRating(error) || isUnlinked(error)) {
            recent.delete(keyOf(kind, id))
            return 'local'
          }
          if (attempt === 0 && isTransient(error)) {
            await wait(RETRY_DELAY_MS)
            continue
          }
          recent.delete(keyOf(kind, id))
          return 'failed'
        }
      }
    },
  }
}

export const ratingSync = createRatingSync()

/**
 * Qué cambiar en Mysic para parecerse a YouTube.
 *  - `remote`: ids que YouTube tiene ahora. `complete`: si ese listado llega hasta el final (sin más páginas); solo
 *    entonces se puede afirmar que algo ya no está.
 *  - `previous`: ids que YouTube tenía en la sincronización anterior (null si no se conoce). Solo se quita lo que
 *    estaba ahí antes y ya no está: lo que se marcó solo en Mysic nunca se borra por no figurar en YouTube.
 *  - `recent(id)`: marca reciente hecha en Mysic (true/false/undefined) que manda sobre YouTube.
 * Devuelve { add, remove } con ids.
 */
export function reconcileFavorites({ remote, previous = null, complete = false, local, recent = () => undefined }) {
  const remoteSet = new Set(remote)
  const add = [...remoteSet].filter((id) => !local.has(id) && recent(id) !== false)
  const remove = complete && previous
    ? [...previous].filter((id) => !remoteSet.has(id) && local.has(id) && recent(id) !== true)
    : []
  return { add, remove }
}
