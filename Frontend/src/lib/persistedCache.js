const DEFAULT_PREFIX = 'mysic:cache:v1:'
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const DEFAULT_MAX_BYTES = 1_500_000

function browserStorage() {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/**
 * Caché persistente para pintar datos al instante y revalidarlos después
 * (stale-while-revalidate). Guarda { savedAt, data } en localStorage.
 *
 * Todo fallo (almacenamiento bloqueado, cuota llena, JSON dañado) se trata como
 * "no hay dato": la app debe funcionar igual sin esta caché.
 */
export function createPersistedCache({
  storage = browserStorage(),
  prefix = DEFAULT_PREFIX,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
  maxBytes = DEFAULT_MAX_BYTES,
  now = Date.now,
} = {}) {
  function read(key) {
    try {
      const raw = storage?.getItem(prefix + key)
      if (!raw) return null
      const entry = JSON.parse(raw)
      if (!entry || typeof entry.savedAt !== 'number' || now() - entry.savedAt > maxAgeMs) {
        storage.removeItem(prefix + key)
        return null
      }
      return entry.data ?? null
    } catch {
      return null
    }
  }

  function write(key, data) {
    if (!storage) return false
    try {
      const raw = JSON.stringify({ savedAt: now(), data })
      if (raw.length > maxBytes) {
        // Demasiado grande para localStorage: mejor no tener caché que llenarlo.
        storage.removeItem(prefix + key)
        return false
      }
      storage.setItem(prefix + key, raw)
      return true
    } catch {
      return false
    }
  }

  function remove(key) {
    try {
      storage?.removeItem(prefix + key)
    } catch {
      // Sin almacenamiento disponible: nada que borrar.
    }
  }

  return { read, remove, write }
}

export const persistedCache = createPersistedCache()
