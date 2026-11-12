// Ciclo de vida del motor de YouTube (el iframe del reproductor): cada iframe es un proceso aparte de
// 100-160 MB, así que solo se crea cuando hay intención de reproducir y se libera si lleva tiempo sin uso.
import { isDirectSource } from './directAudioModel.js'

// Lógica pura: el hook usePlayer (generado) solo la consume.

/** Sin canción (reproductor cerrado): se libera pronto, pero tolera cerrar y volver a elegir otra. */
export const RELEASE_CLOSED_MS = 30_000
/** Sonando por <audio> (descarga o respaldo por stream): más que una canción, para no recrearlo al alternar. */
export const RELEASE_AUDIO_MS = 5 * 60_000
/** En pausa prolongada: se libera guardando la posición; el siguiente play lo recrea ahí. */
export const RELEASE_PAUSED_MS = 10 * 60_000

/**
 * ¿Hay que tener creado el iframe? Solo con una canción que suena por YouTube y con intención de
 * reproducir (`armed`): una canción restaurada en pausa al arrancar no lo crea.
 */
export function shouldCreateEngine({ videoId, usesAudio, armed }) {
  return Boolean(videoId && !usesAudio && armed)
}

/** Las pistas remotas usan el stream directo; el iframe queda como respaldo de una pista fallida. */
export function shouldUseDirectAudio({ videoId, isLocal, streamFailed }) {
  return Boolean(videoId && !isLocal && !streamFailed)
}

/** Tiempo que el puntero debe detenerse sobre una canción antes de preparar su stream. */
export const HOVER_WARM_DELAY_MS = 150

/**
 * ¿El fallo de `audio.play()` se debe a que ya se eligió otra canción? Cambiar de fuente aborta el play()
 * anterior (AbortError) y su rechazo llega tarde: no es un error de reproducción y no debe mostrarse.
 */
export function isSupersededPlay({ error, playId, currentId }) {
  return error?.name === 'AbortError' || playId !== currentId
}

/** ¿La fuente del <audio> que falló es el stream de la canción actual? (y no el de una anterior) */
export function isCurrentStreamSource(src, videoId) {
  if (!src || !videoId) return false
  return isDirectSource(src, videoId) || String(src).split(/[?#]/)[0].endsWith(`/stream/${videoId}`)
}

/** Milisegundos de inactividad tras los que se libera el iframe, o null si está en uso. */
export function engineReleaseDelay({ hasSong, usesAudio, isPlaying, isBuffering }) {
  if (!hasSong) return RELEASE_CLOSED_MS
  if (usesAudio) return RELEASE_AUDIO_MS
  if (isPlaying || isBuffering) return null
  return RELEASE_PAUSED_MS
}

/** Posición desde la que reanudar al recrear el motor; una canción terminada vuelve a empezar. */
export function resumePosition(position, duration) {
  const value = Number(position)
  if (!Number.isFinite(value) || value <= 0) return 0
  const total = Number(duration)
  if (Number.isFinite(total) && total > 0 && value >= total - 1) return 0
  return value
}

/** Acota un salto pedido sin motor (solo mueve la barra) a la duración conocida. */
export function clampSeek(value, max) {
  const target = Math.max(0, Number(value) || 0)
  const limit = Number(max)
  return Number.isFinite(limit) && limit > 0 ? Math.min(target, limit) : target
}
