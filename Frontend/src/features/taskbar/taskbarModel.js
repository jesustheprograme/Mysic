// Botones de la miniatura de la barra de tareas de Windows (anterior, reproducir/pausar, siguiente, me gusta).
// Lógica pura: qué estado se envía a la parte nativa y qué acción dispara cada pulsación.

export const TASKBAR_EVENT = 'taskbar-control'

/** Estado que entiende `set_taskbar_playback`. Sin canción todos los botones quedan desactivados. */
export function taskbarState({ canLike = true, hasTrack = false, isPlaying = false, liked = false } = {}) {
  const track = Boolean(hasTrack)
  return {
    hasTrack: track,
    playing: track && Boolean(isPlaying),
    liked: track && Boolean(liked),
    canLike: track && Boolean(canLike),
  }
}

/**
 * Ejecuta la acción de un botón. Devuelve true si se atendió. "like" alterna el estado actual; un control
 * desconocido o sin manejador se ignora.
 */
export function runTaskbarControl(control, { liked = false, onNext, onPrevious, onToggleLike, onTogglePlayback } = {}) {
  const actions = {
    like: onToggleLike ? () => onToggleLike(!liked) : null,
    next: onNext,
    previous: onPrevious,
    toggle: onTogglePlayback,
  }
  const action = Object.hasOwn(actions, control) ? actions[control] : null
  if (typeof action !== 'function') return false
  action()
  return true
}
