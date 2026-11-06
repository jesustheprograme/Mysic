/**
 * Cola de descargas con límite de simultaneidad.
 *
 * Evita saturar la red y el servidor: nunca hay más de `limit` copias en curso, el resto espera en
 * orden. Una misma canción no se encola dos veces mientras está en cola, descargándose o ya hecha, y
 * los fallos se reintentan un número acotado de veces (sin bucles infinitos).
 *
 * `run(task, { signal })` hace el trabajo y devuelve una promesa. `onChange` se llama solo cuando
 * cambia el estado de una tarea, no en cada trozo descargado.
 */
export function createDownloadQueue({ limit = 2, maxAttempts = 3, onChange = () => {}, run }) {
  const entries = new Map()
  const waiting = []
  let active = 0

  function snapshot() {
    return new Map([...entries].map(([id, entry]) => [id, { attempts: entry.attempts, error: entry.error, status: entry.status }]))
  }

  function pump() {
    while (active < limit && waiting.length) {
      const id = waiting.shift()
      const entry = entries.get(id)
      if (!entry || entry.status !== 'queued') continue

      active += 1
      entry.status = 'downloading'
      entry.attempts += 1
      onChange(snapshot())

      Promise.resolve()
        .then(() => run(entry.task, { signal: entry.controller.signal }))
        .then(
          () => { entry.status = 'done' },
          (error) => {
            entry.status = entry.controller.signal.aborted ? 'cancelled' : 'error'
            entry.error = error
          },
        )
        .finally(() => {
          active -= 1
          onChange(snapshot())
          pump()
        })
    }
  }

  return {
    /** Devuelve true si la tarea se encoló, false si ya estaba o agotó sus reintentos. */
    enqueue(id, task) {
      const current = entries.get(id)
      if (current) {
        const blocked = ['queued', 'downloading', 'done'].includes(current.status) || current.attempts >= maxAttempts
        if (blocked) return false
      }
      entries.set(id, {
        attempts: current?.attempts ?? 0,
        controller: new AbortController(),
        error: null,
        status: 'queued',
        task,
      })
      waiting.push(id)
      onChange(snapshot())
      pump()
      return true
    },

    /** Cancela una tarea en cola o en curso. */
    cancel(id) {
      const entry = entries.get(id)
      if (!entry || !['queued', 'downloading'].includes(entry.status)) return
      entry.controller.abort()
      if (entry.status === 'queued') {
        entry.status = 'cancelled'
        onChange(snapshot())
      }
    },

    cancelAll() {
      for (const id of entries.keys()) this.cancel(id)
    },

    /** Olvida una tarea terminada (p. ej. tras borrar la canción) para permitir descargarla de nuevo. */
    forget(id) {
      const entry = entries.get(id)
      if (entry && !['queued', 'downloading'].includes(entry.status)) entries.delete(id)
    },

    get activeCount() { return active },
    state: snapshot,
  }
}
