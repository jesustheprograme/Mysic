// Resumen de la biblioteca de YouTube Music para la barra lateral: las playlists de la cuenta y los Me gusta.
//
// La barra lateral vive fuera de la vista de YouTube, así que no puede leer su estado. YoutubeView publica este
// resumen (pequeño: id, título, portada y conteo) con un evento de ventana cada vez que cambia la biblioteca, y la
// barra lateral lo recibe y lo dibuja. Lógica pura + un par de funciones de publicación; sin React.
import { isYoutubeLikedList } from './libraryModel.js'

export const LIBRARY_SUMMARY_EVENT = 'mysic:youtube-library'
/** Id de la entrada de "Música que me gusta" en la barra lateral y en la navegación. */
export const LIKED_NAV_ID = 'liked'

export const EMPTY_LIBRARY_SUMMARY = Object.freeze({ liked: null, playlists: [] })

/** De la biblioteca completa al resumen. `likedHasMore` indica que aún faltan páginas de Me gusta (el conteo es parcial). */
export function summarizeLibrary(library, { likedHasMore = false } = {}) {
  const likedSongs = library?.likedSongs ?? []
  const playlists = (library?.playlists ?? [])
    .filter((playlist) => playlist?.id && !isYoutubeLikedList(playlist))
    .map((playlist) => ({
      count: Number(playlist.itemCount) || 0,
      id: playlist.id,
      thumbnail: playlist.thumbnail ?? null,
      title: playlist.title || 'Playlist',
    }))
  if (!likedSongs.length && !playlists.length) return EMPTY_LIBRARY_SUMMARY
  return {
    liked: { count: likedSongs.length, hasMore: Boolean(likedHasMore), thumbnail: likedSongs[0]?.thumbnail ?? null },
    playlists,
  }
}

/** Dos resúmenes con el mismo contenido (para no publicar ni repintar si no cambió nada). */
export function sameLibrarySummary(a, b) {
  if (a === b) return true
  if (!a || !b) return false
  if ((a.liked?.count ?? -1) !== (b.liked?.count ?? -1) || Boolean(a.liked?.hasMore) !== Boolean(b.liked?.hasMore)) return false
  if ((a.liked?.thumbnail ?? null) !== (b.liked?.thumbnail ?? null)) return false
  if (a.playlists.length !== b.playlists.length) return false
  return a.playlists.every((item, index) => {
    const other = b.playlists[index]
    return item.id === other.id && item.title === other.title && item.count === other.count && item.thumbnail === other.thumbnail
  })
}

let latest = EMPTY_LIBRARY_SUMMARY

export const readLibrarySummary = () => latest

/** Publica el resumen actual (solo si cambió). */
export function publishLibrarySummary(summary, target = globalThis.window) {
  if (sameLibrarySummary(latest, summary)) return false
  latest = summary
  target?.dispatchEvent?.(new CustomEvent(LIBRARY_SUMMARY_EVENT, { detail: summary }))
  return true
}

/** Texto bajo el nombre: "N canciones" (con + si faltan páginas). */
export function countText(count, hasMore = false) {
  const label = `${count}${hasMore ? '+' : ''}`
  return `${label} ${count === 1 && !hasMore ? 'canción' : 'canciones'}`
}
