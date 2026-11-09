export const LIBRARY_CACHE_KEY = 'youtube-library'

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