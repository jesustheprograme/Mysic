// Caché única del detalle de álbum, playlist y artista.
//
// Reúne en un solo sitio lo que antes estaba repartido (precarga por cursor, clic y menús pedían cada uno por su lado):
//  - Peticiones en vuelo compartidas: la precarga al pasar el cursor y el clic posterior esperan la misma promesa.
//  - Memoria con frescura: dentro de `freshMs` se responde sin red.
//  - Persistencia (stale-while-revalidate): pasada la frescura pero dentro de `staleMs` se responde AL INSTANTE con lo
//    guardado y se actualiza por detrás; la siguiente apertura ya ve lo nuevo. Si la red falla, se usa lo guardado.
//  - Por alcance (usuario de Mysic + cuenta de YouTube vinculada o no): nada de una cuenta aparece en otra.
//
// Lógica pura: la petición y el almacenamiento se inyectan (api.js crea la instancia real).
import { persistedCache } from '../../lib/persistedCache.js'

const MINUTE = 60_000
/** Cuánto se considera fresco (sin red) y hasta cuándo se puede mostrar mientras se actualiza. */
export const DETAIL_POLICY = {
  album: { freshMs: 30 * MINUTE, staleMs: 24 * 60 * MINUTE },
  artist: { freshMs: 10 * MINUTE, staleMs: 6 * 60 * MINUTE },
  playlist: { freshMs: 2 * MINUTE, staleMs: 30 * MINUTE },
}
const MAX_MEMORY = 80
const MAX_PERSISTED = 80
const INDEX_KEY = 'youtube-detail:index'

const abortError = (signal) => signal.reason ?? new DOMException('Solicitud cancelada', 'AbortError')

/** Espera una promesa compartida sin cancelarla: abortar solo suelta a quien esperaba. */
function waitShared(promise, signal) {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(abortError(signal))
  return new Promise((resolve, reject) => {
    const abort = () => reject(abortError(signal))
    signal.addEventListener('abort', abort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

export function createDetailCache({ fetcher, now = Date.now, persisted = persistedCache, policy = DETAIL_POLICY } = {}) {
  const memory = new Map() // clave -> { data, savedAt }
  const inflight = new Map() // clave -> promesa de la petición
  let scope = 'anon'
  // Sube al borrar un alcance: una petición que ya estaba en vuelo no debe volver a guardar lo que se acaba de borrar.
  let generation = 0

  const keyOf = (kind, id) => `${scope}|${kind}:${id}`
  const storeKey = (key) => `youtube-detail:${key}`

  function remember(key, entry) {
    memory.delete(key)
    memory.set(key, entry)
    while (memory.size > MAX_MEMORY) memory.delete(memory.keys().next().value)
  }

  function readIndex() {
    const index = persisted.read(INDEX_KEY)
    return Array.isArray(index) ? index : []
  }

  function persist(key, entry) {
    if (!persisted.write(storeKey(key), entry)) return
    const index = [key, ...readIndex().filter((item) => item !== key)]
    for (const old of index.splice(MAX_PERSISTED)) persisted.remove(storeKey(old))
    persisted.write(INDEX_KEY, index)
  }

  /** Lo guardado para esa clave (memoria primero, después disco) o null. */
  function stored(key) {
    const inMemory = memory.get(key)
    if (inMemory) return inMemory
    const entry = persisted.read(storeKey(key))
    if (entry && typeof entry.savedAt === 'number' && entry.data != null) {
      remember(key, entry)
      return entry
    }
    return null
  }

  /** Petición compartida: si ya hay una en vuelo para esa clave, se reutiliza. */
  function load(key, path) {
    const pending = inflight.get(key)
    if (pending) return pending
    const startedIn = generation
    const request = Promise.resolve()
      .then(() => fetcher(path))
      .then((data) => {
        if (startedIn === generation) {
          const entry = { data, savedAt: now() }
          remember(key, entry)
          persist(key, entry)
        }
        return data
      })
      .finally(() => {
        if (inflight.get(key) === request) inflight.delete(key)
      })
    request.catch(() => {}) // una precarga abandonada nunca queda sin gestionar
    inflight.set(key, request)
    return request
  }

  return {
    /**
     * Detalle de `kind` (album | artist | playlist). Devuelve datos frescos, o lo guardado (e inicia la
     * actualización) si está dentro de la ventana de "caducado pero usable", o espera a la red.
     */
    get(kind, id, path, signal) {
      if (signal?.aborted) return Promise.reject(abortError(signal))
      const { freshMs, staleMs } = policy[kind] ?? policy.album
      const key = keyOf(kind, id)
      const entry = stored(key)
      const age = entry ? now() - entry.savedAt : Infinity
      if (entry && age >= 0 && age < freshMs) return Promise.resolve(entry.data)
      if (entry && age >= 0 && age < staleMs) {
        load(key, path).catch(() => {}) // se actualiza por detrás; si falla, se sigue con lo guardado
        return Promise.resolve(entry.data)
      }
      const request = load(key, path)
      return waitShared(request, signal).catch((error) => {
        if (entry && error?.name !== 'AbortError') return entry.data // sin red: lo último guardado aunque sea viejo
        throw error
      })
    },
    /** Alcance actual: usuario de Mysic y cuenta de YouTube. Cambiarlo no borra nada, solo separa. */
    setScope(next) {
      scope = next || 'anon'
    },
    /** Borra el detalle guardado de un alcance (al vincular, desvincular o cambiar de cuenta). */
    clearScope(target = scope) {
      generation += 1
      const prefix = `${target}|`
      for (const key of [...memory.keys()]) if (key.startsWith(prefix)) memory.delete(key)
      for (const key of [...inflight.keys()]) if (key.startsWith(prefix)) inflight.delete(key)
      const index = readIndex()
      for (const key of index.filter((item) => item.startsWith(prefix))) persisted.remove(storeKey(key))
      persisted.write(INDEX_KEY, index.filter((item) => !item.startsWith(prefix)))
    },
    get size() {
      return memory.size
    },
  }
}
