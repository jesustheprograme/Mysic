/**
 * Caché en memoria con caducidad (TTL), límite de tamaño (LRU) y deduplicación
 * de cargas simultáneas. Solo guarda valores distintos de null/undefined, de modo
 * que una ausencia o un error nunca queda fijado en caché.
 */
function createTtlCache({ ttlMs, maxSize = 500, now = Date.now } = {}) {
  if (!(ttlMs > 0)) throw new Error('ttlMs debe ser un número positivo.')

  const entries = new Map()
  const inflight = new Map()

  function get(key) {
    const entry = entries.get(key)
    if (!entry) return undefined
    if (now() >= entry.expiresAt) {
      entries.delete(key)
      return undefined
    }
    // Reinsertar mueve la clave al final: el primero del Map es siempre el menos usado.
    entries.delete(key)
    entries.set(key, entry)
    return entry.value
  }

  function set(key, value) {
    if (value === null || value === undefined) return
    entries.delete(key)
    entries.set(key, { value, expiresAt: now() + ttlMs })
    while (entries.size > maxSize) entries.delete(entries.keys().next().value)
  }

  async function getOrLoad(key, load) {
    const cached = get(key)
    if (cached !== undefined) return cached

    if (!inflight.has(key)) {
      const task = Promise.resolve()
        .then(load)
        .then((value) => {
          set(key, value)
          return value
        })
        .finally(() => inflight.delete(key))
      inflight.set(key, task)
    }
    return inflight.get(key)
  }

  return {
    clear: () => entries.clear(),
    delete: (key) => entries.delete(key),
    get,
    getOrLoad,
    set,
    get size() { return entries.size },
  }
}

module.exports = { createTtlCache }
