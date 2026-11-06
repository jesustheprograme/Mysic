// Operaciones puras sobre la cola de reproducción (sin React) para "Reproducir a continuación" y
// "Añadir a la cola". Devuelven la cola nueva y el índice de la canción que suena.

/**
 * Inserta `songs` justo después de la canción actual (`next`) o al final de la cola.
 * - La canción que suena no se duplica ni se mueve.
 * - Si una canción ya estaba en la cola, se mueve a su nueva posición en lugar de repetirse.
 * - Con la cola vacía (`currentIndex < 0`) las canciones pasan a ser la cola y no suena ninguna.
 */
export function insertIntoQueue(queue, currentIndex, songs, { next = false } = {}) {
  const playing = currentIndex >= 0 ? queue[currentIndex] : null
  const seen = new Set()
  const incoming = songs.filter((song) => {
    if (!song?.id || song.id === playing?.id || seen.has(song.id)) return false
    seen.add(song.id)
    return true
  })
  if (!incoming.length) return { index: currentIndex, queue }

  const kept = queue.filter((song, position) => position === currentIndex || !seen.has(song.id))
  const playingPosition = playing ? kept.indexOf(playing) : -1
  const insertAt = next && playingPosition >= 0 ? playingPosition + 1 : kept.length
  return {
    index: playingPosition,
    queue: [...kept.slice(0, insertAt), ...incoming, ...kept.slice(insertAt)],
  }
}

/** Enlace público de YouTube Music para compartir una canción, álbum, playlist o artista. */
export function shareUrl(kind, id) {
  if (!id) return ''
  const encoded = encodeURIComponent(id)
  if (kind === 'song') return `https://music.youtube.com/watch?v=${encoded}`
  if (kind === 'playlist') return `https://music.youtube.com/playlist?list=${encoded}`
  if (kind === 'album' || kind === 'artist') return `https://music.youtube.com/browse/${encoded}`
  return ''
}

/** Copia mezclada de la lista (Fisher-Yates). El generador aleatorio se puede inyectar para probarla. */
export function shuffled(list, random = Math.random) {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}
