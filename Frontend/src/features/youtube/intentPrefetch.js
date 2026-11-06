// Precarga por intención: al pasar el puntero, enfocar o tocar una tarjeta se calienta la caché del
// detalle (álbum, artista, playlist) para que al hacer clic ya esté listo.
//
// Reglas para no saturar: espera breve (si el puntero solo pasa de largo no se pide nada), no repite
// lo ya pedido durante unos minutos, como mucho 2 peticiones a la vez, y se omite con ahorro de datos,
// sin conexión o con la ventana oculta.

const DEFAULTS = { delayMs: 150, ttlMs: 5 * 60 * 1000, maxConcurrent: 2, maxRemembered: 200 }

export function createIntentPrefetcher({
  canRun = () => true,
  delayMs = DEFAULTS.delayMs,
  maxConcurrent = DEFAULTS.maxConcurrent,
  maxRemembered = DEFAULTS.maxRemembered,
  now = Date.now,
  ttlMs = DEFAULTS.ttlMs,
} = {}) {
  const done = new Map() // clave -> instante en que se pidió
  const timers = new Map() // clave -> temporizador de espera
  const waiting = [] // { key, task } listas para ejecutar
  let running = 0

  function pump() {
    while (running < maxConcurrent && waiting.length) {
      const { key, task } = waiting.shift()
      running += 1
      Promise.resolve()
        .then(task)
        .catch(() => done.delete(key)) // un fallo permite reintentar en la siguiente intención
        .finally(() => {
          running -= 1
          pump()
        })
    }
  }

  function remember(key) {
    done.delete(key)
    done.set(key, now())
    while (done.size > maxRemembered) done.delete(done.keys().next().value)
  }

  function schedule(key, task) {
    if (!key || typeof task !== 'function') return
    const seen = done.get(key)
    if (timers.has(key) || (seen !== undefined && now() - seen < ttlMs)) return
    timers.set(key, setTimeout(() => {
      timers.delete(key)
      if (!canRun()) return
      remember(key)
      waiting.push({ key, task })
      pump()
    }, delayMs))
  }

  /** Cancela una espera aún no lanzada (el puntero se fue antes del retardo). */
  function cancel(key) {
    const timer = timers.get(key)
    if (timer === undefined) return
    clearTimeout(timer)
    timers.delete(key)
  }

  return { cancel, schedule }
}

export function defaultCanRun() {
  if (typeof navigator !== 'undefined') {
    if (navigator.onLine === false) return false
    if (navigator.connection?.saveData) return false
  }
  return !(typeof document !== 'undefined' && document.hidden)
}
