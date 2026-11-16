export const LIBRARY_CACHE_KEY = 'youtube-library'

/** Clave por usuario de Mysic (prefijo de almacenamiento): la biblioteca de una cuenta nunca se muestra a otra. */
export const libraryCacheKey = (prefix) => `${LIBRARY_CACHE_KEY}:${prefix}`

const LIST_FIELDS = ['likedSongs', 'playlists', 'albums', 'artists', 'subscriptions', 'uploads']
export const isEmptyLibrary = (library) => !library || LIST_FIELDS.every((field) => !library[field]?.length)

/** Una respuesta vacía no reemplaza una biblioteca útil que ya se tenía (fallo parcial o transitorio del servidor). */
export function chooseLibrary(previous, fetched) {
  const keepPrevious = isEmptyLibrary(fetched) && !isEmptyLibrary(previous)
  return { library: keepPrevious ? previous : fetched, keptPrevious: keepPrevious }
}

const SONG_FIELDS = ['id', 'title', 'artist', 'artistId', 'album', 'albumId', 'thumbnail', 'duration', 'durationSeconds', 'index']

const pick = (song) => Object.fromEntries(SONG_FIELDS.filter((field) => song[field] != null).map((field) => [field, song[field]]))

/**
 * Versión compacta de la biblioteca para guardarla en disco: solo los campos que usa la interfaz. Los extras
 * del servidor (álbumes, artistas, suscripciones, subidos) se conservan tal cual. Si aun así supera el límite
 * de la caché persistente, simplemente no se guarda.
 */
export function compactLibrary(library) {
  return { ...library, likedSongs: (library.likedSongs ?? []).map(pick) }
}

// Me gusta que se guardan en disco cuando la biblioteca entera no cabe en la caché (el resto llega al sincronizar).
export const TRIMMED_LIKED_LIMIT = 300

// Versión reducida para arrancar: las primeras canciones y `likedTotal` con el total real. Sin ella, una biblioteca
// grande (miles de Me gusta) superaba el límite de la caché, se descartaba entera y tras recargar no había playlists.
export function trimLibrary(library, limit = TRIMMED_LIKED_LIMIT) {
  const liked = library.likedSongs ?? []
  return liked.length <= limit ? library : { ...library, likedSongs: liked.slice(0, limit), likedTotal: liked.length }
}

// Biblioteca sin la marca de recorte: lo que llega de la red siempre es la lista real.
export function withoutTrimMark(library) {
  if (!library || library.likedTotal == null) return library
  const rest = { ...library }
  delete rest.likedTotal
  return rest
}

// Escribe la biblioteca para el arranque, siempre en su versión reducida: los Me gusta completos ya están guardados
// como favoritas (medido: guardarlos dos veces ocupaba 1 MB de los ~5 MB del almacenamiento local). Devuelve si se guardó.
export function persistLibrary(cache, key, library) {
  return cache.write(key, trimLibrary(compactLibrary(library)))
}