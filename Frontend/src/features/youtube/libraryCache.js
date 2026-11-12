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