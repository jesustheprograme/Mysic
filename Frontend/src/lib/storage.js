export function readStorage(key, fallback) {
  try {
    const saved = localStorage.getItem(key)
    return saved !== null ? JSON.parse(saved) : fallback
  } catch {
    return fallback
  }
}

// Cachés que se pueden volver a pedir a la red (detalle de álbumes/playlists/artistas e Inicio/Explorar). Si el
// almacenamiento local (~5 MB) se llena, se sacrifican antes que perder datos del usuario (favoritas, accesos directos,
// historial): un guardado que falla en silencio es mucho peor que una caché fría.
const EVICTABLE_PREFIXES = ['mysic:cache:v1:youtube-detail:', 'mysic:cache:v1:youtube-landing:']

/** Borra las cachés prescindibles. Devuelve cuántas claves quitó. */
export function freeStorageSpace(storage = localStorage) {
  let removed = 0
  try {
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
    for (const key of keys) {
      if (key && EVICTABLE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        storage.removeItem(key)
        removed += 1
      }
    }
  } catch {
    // Almacenamiento no disponible.
  }
  return removed
}

/** Guarda un texto; si no cabe, libera las cachés prescindibles y lo intenta una vez más. Devuelve si se guardó. */
export function setItemSafe(key, raw, storage = localStorage) {
  try {
    storage.setItem(key, raw)
    return true
  } catch {
    try {
      if (!freeStorageSpace(storage)) return false
      storage.setItem(key, raw)
      return true
    } catch {
      return false
    }
  }
}

export function writeStorage(key, value) {
  try {
    return setItemSafe(key, JSON.stringify(value))
  } catch {
    // El almacenamiento puede no estar disponible en modo privado.
    return false
  }
}
