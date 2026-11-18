// Contador de escuchas (las reglas de Limusic, state.rs):
// - El tiempo oído sale de los avances de la posición, no del reloj: solo suman pasos de 0 a 2 s con la canción
//   sonando. Saltos adelante o atrás y la pausa no suman.
// - Una escucha cuenta al oír la mitad de la canción, como mucho 30 s (30 s si no se sabe la duración). Hasta
//   entonces no se guarda nada: un salto rápido no deja rastro.
// - Ya contada, los segundos se guardan cada 30 s oídos, al pausar y al cambiar de canción.
// - Si la canción vuelve a empezar sola (repetir una), es otra escucha.

export const MAX_STEP_SECONDS = 2
export const SAVE_EVERY_SECONDS = 30

export function threshold(duration) {
  return duration > 1 ? Math.min(duration / 2, 30) : 30
}

/**
 * `store`: { insert(song, playedAt, secs) → Promise<id>, update(id, secs) }. Llamar a `tick` con cada actualización
 * de posición del reproductor y a `flush` al pausar o cerrar.
 */
export function createListenTracker(store, now = Date.now) {
  let current = null // { song, heard, last, saved, id, pending }

  const save = () => {
    if (!current || current.saved === Math.round(current.heard)) return
    const target = current
    target.saved = Math.round(target.heard)
    if (target.id != null) store.update(target.id, target.heard)
    // Aún insertándose: se guardará con el id en cuanto llegue (ver `insert`).
  }

  const end = () => {
    save()
    current = null
  }

  const insert = () => {
    const target = current
    target.pending = Promise.resolve(store.insert(target.song, now(), target.heard))
      .then((id) => {
        target.id = id
        if (Math.round(target.heard) !== target.saved && id != null) {
          target.saved = Math.round(target.heard)
          store.update(id, target.heard)
        }
      })
      .catch(() => { target.id = null })
    target.saved = Math.round(target.heard)
  }

  return {
    tick({ song, position, duration, playing }) {
      if (!song?.id || !Number.isFinite(position)) return
      // Otra canción, o la misma que vuelve a empezar desde el final (repetir una): escucha nueva.
      const looped = current && current.song.id === song.id && current.last > Math.max(5, (duration || 0) - 5) && position < 3
      if (!current || current.song.id !== song.id || looped) {
        end()
        current = { song, heard: 0, last: position, saved: 0, id: null, pending: null, counted: false }
        return
      }
      const step = position - current.last
      current.last = position
      if (!playing || step <= 0 || step >= MAX_STEP_SECONDS) return
      current.heard += step
      if (!current.counted && current.heard >= threshold(duration)) {
        current.counted = true
        insert()
        return
      }
      if (current.counted && current.heard - current.saved >= SAVE_EVERY_SECONDS) save()
    },
    /** Pausa, cambio de vista o cierre: guarda lo oído sin cerrar la escucha. */
    flush: save,
    /** Cierre del reproductor: guarda y olvida la canción. */
    end,
  }
}
