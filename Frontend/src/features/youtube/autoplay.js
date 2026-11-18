// Reproducción automática (como limusic): la cola no se acaba, se rellena con canciones parecidas.
// - Una canción pulsada en un bloque suena con su radio detrás (no con "la siguiente del bloque").
// - Al acercarse al final de cualquier cola (también una playlist o un álbum) se pide la radio de la última canción.
// Lógica pura (sin React ni red); YoutubeView la usa.

export const AUTOPLAY_KEY = 'mysic:autoplay'
export const AUTOPLAY_EVENT = 'mysic:autoplay'
/** Cuántas canciones por delante bastan: por debajo se pide más. */
// La cola se mantiene con al menos 10 canciones por delante (antes 2: con una canción suelta la cola mostraba 3-4
// canciones hasta casi el final). Como Limusic, que enseña la radio completa desde el principio.
export const TOP_UP_REMAINING = 10
/** Máximo de canciones nuevas por petición y tamaño máximo de la cola (una cola sin fin no debe crecer sin límite). */
export const TOP_UP_BATCH = 25
export const MAX_QUEUE = 300

export function readAutoplay(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(AUTOPLAY_KEY) !== '0'
  } catch {
    return true
  }
}

export function writeAutoplay(on, storage = globalThis.localStorage) {
  try {
    storage?.setItem(AUTOPLAY_KEY, on ? '1' : '0')
  } catch {
    // Sin almacenamiento: vale solo para esta sesión.
  }
  globalThis.dispatchEvent?.(new CustomEvent(AUTOPLAY_EVENT, { detail: Boolean(on) }))
}

/** ¿Hay que pedir más canciones? Solo con algo sonando, poco por delante y sin pasarse del tope. */
export function needsTopUp({ currentIndex, queueLength, remaining = TOP_UP_REMAINING }) {
  if (queueLength < 1 || currentIndex < 0 || queueLength >= MAX_QUEUE) return false
  return queueLength - 1 - currentIndex <= remaining
}

/** Canciones de la radio que aún no están en la cola (por id y por título+artista), sin repetirse entre sí. */
export function freshSongs(radioSongs, queue, limit = TOP_UP_BATCH) {
  const keyOf = (song) => `${String(song.title ?? '').trim().toLowerCase()}|${String(song.artist ?? '').trim().toLowerCase()}`
  const ids = new Set(queue.map((song) => song.id))
  const keys = new Set(queue.map(keyOf))
  const fresh = []
  for (const song of radioSongs ?? []) {
    if (!song?.id || ids.has(song.id) || keys.has(keyOf(song))) continue
    ids.add(song.id)
    keys.add(keyOf(song))
    fresh.push(song)
    if (fresh.length >= limit) break
  }
  return fresh
}