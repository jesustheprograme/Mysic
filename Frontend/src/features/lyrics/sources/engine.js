// Motor de letras: modo Automático, consulta de un proveedor concreto y caché en memoria.
//
// Automático (como Limusic): los proveedores arrancan escalonados cada 300 ms (los dos primeros a la vez), en el orden de preferencia, y sus
// respuestas se leen en ese mismo orden. Gana la primera letra sincronizada; si ninguna lo está, la primera en
// texto plano. En cuanto hay ganador, los que aún no habían arrancado ya no arrancan.
import { PROVIDERS, providerById } from './providers.js'

export const STAGGER_MS = 300
export const PROVIDER_BUDGET_MS = 9000
export const GRACE_MS = 1000
const CACHE_LIMIT = 80

const sleep = (ms, signal) => new Promise((resolve) => {
  if (signal?.aborted) { resolve(); return }
  const timer = setTimeout(resolve, ms)
  signal?.addEventListener('abort', () => { clearTimeout(timer); resolve() }, { once: true })
})

function withBudget(promise, ms) {
  let timer
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('TIMEOUT')), ms) }),
  ])
}

/** Clave de una canción (y de una búsqueda manual): misma canción y misma consulta → mismo resultado. */
export function songKey(req) {
  // La duración forma parte de la clave: lo buscado sin conocerla (canción restaurada en pausa) se repite al
  // conocerla, porque los proveedores emparejan por duración.
  const base = `${req.videoId || `${req.title}|${req.artist}`}|d:${Math.round(req.duration || 0)}`
  return req.searched ? `${base}|q:${req.title.toLocaleLowerCase()}|${req.artist.toLocaleLowerCase()}` : base
}

export function createLyricsEngine({ ctx, providers = PROVIDERS, stagger = STAGGER_MS, budget = PROVIDER_BUDGET_MS, grace = GRACE_MS } = {}) {
  const cache = new Map()
  const inflight = new Map()

  const remember = (key, value) => {
    cache.delete(key)
    cache.set(key, value)
    while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value)
  }

  /** Un proveedor concreto. Devuelve { provider, synced, lines, plain } o null; lanza si está inaccesible. */
  function fromProvider(id, req) {
    const key = `${id}|${songKey(req)}`
    if (cache.has(key)) return Promise.resolve(cache.get(key))
    if (inflight.has(key)) return inflight.get(key)
    const provider = providerById(id)
    if (!provider) return Promise.resolve(null)
    const task = withBudget(Promise.resolve().then(() => provider.get(req, ctx)), budget)
      .then((result) => {
        const value = result ? { provider: id, ...result } : null
        remember(key, value)
        return value
      })
      .finally(() => inflight.delete(key))
    inflight.set(key, task)
    return task
  }

  /** Modo Automático. Resuelve con el ganador o null; rechaza solo si TODOS los proveedores fallaron por red. */
  function auto(req, order = providers.map((provider) => provider.id)) {
    const key = `auto|${order.join(',')}|${songKey(req)}`
    if (cache.has(key)) return Promise.resolve(cache.get(key))
    if (inflight.has(key)) return inflight.get(key)
    const controller = new AbortController()
    const task = (async () => {
      const outcomes = new Array(order.length)
      let wake = () => {}
      const attempts = order.map((id, index) => (async () => {
        // Los dos primeros arrancan juntos (los preferidos y rápidos); del tercero en adelante, escalonados.
        if (index > 1) await sleep((index - 1) * stagger, controller.signal)
        if (controller.signal.aborted) return
        try { outcomes[index] = { value: await fromProvider(id, req) } } catch (error) { outcomes[index] = { error } }
        wake()
      })())
      const allDone = Promise.all(attempts)
      let graceUntil = Infinity
      // Ganador: la primera sincronizada en orden con todo lo anterior ya resuelto. Si una posterior ya la tiene, las
      // anteriores que sigan sin responder tienen como mucho GRACE_MS más (un proveedor colgado no retrasa la letra).
      for (;;) {
        const firstSynced = outcomes.findIndex((outcome) => outcome?.value?.synced)
        if (firstSynced >= 0) {
          // Bucle explícito: `outcomes` tiene huecos (proveedores sin responder) y `some` se los salta.
          let pendingBefore = false
          for (let index = 0; index < firstSynced; index += 1) if (!outcomes[index]) pendingBefore = true
          if (!pendingBefore || Date.now() >= graceUntil) { controller.abort(); return outcomes[firstSynced].value }
          if (graceUntil === Infinity) graceUntil = Date.now() + grace
        }
        if (outcomes.filter(Boolean).length === order.length) break
        const waitMs = graceUntil === Infinity ? null : Math.max(0, graceUntil - Date.now())
        await new Promise((resolve) => {
          wake = resolve
          if (waitMs !== null) setTimeout(resolve, waitMs)
          allDone.then(resolve)
        })
      }
      const plain = outcomes.find((outcome) => outcome?.value)?.value ?? null
      if (!plain && outcomes.every((outcome) => outcome?.error)) throw new Error('UNREACHABLE')
      return plain
    })()
      .then((value) => { remember(key, value); return value })
      .finally(() => { controller.abort(); inflight.delete(key) })
    inflight.set(key, task)
    return task
  }

  return { auto, fromProvider, clear: () => cache.clear() }
}
