// Formato compacto de las canciones favoritas en el almacenamiento local.
//
// Antes cada canción se guardaba como objeto con campos repetidos (thumbnail y artwork, album y albumTitle) y con el
// nombre de cada campo: ~580 caracteres. Con miles de Me gusta esa sola clave llenaba los ~5 MB del almacenamiento
// local y, a partir de ahí, TODO lo demás dejaba de guardarse en silencio (la biblioteca, los accesos directos...).
// Ahora cada canción es una lista de valores en orden fijo (~250 caracteres) y lo repetido se reconstruye al leer.
const FIELDS = ['id', 'title', 'artist', 'artistId', 'album', 'albumId', 'thumbnail', 'durationSeconds', 'trackNo']

const isLegacyEntry = (entry) => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry)

const clock = (seconds) => {
  const total = Math.max(0, Math.round(Number(seconds) || 0))
  return total ? `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}` : undefined
}

/** Canción (objeto) → lista compacta. Un id suelto (texto) se deja igual. */
export function packFavorite(entry) {
  if (!isLegacyEntry(entry)) return entry
  const source = { ...entry, album: entry.album ?? entry.albumTitle, thumbnail: entry.thumbnail ?? entry.artwork }
  const values = FIELDS.map((field) => source[field] ?? null)
  while (values.length > 1 && values.at(-1) === null) values.pop()
  return values
}

/** Lista compacta → canción con la misma forma que tenía antes (incluidos los campos duplicados que usa la interfaz). */
export function unpackFavorite(entry) {
  if (!Array.isArray(entry)) return entry
  const song = {}
  FIELDS.forEach((field, index) => {
    if (entry[index] != null) song[field] = entry[index]
  })
  if (!song.id) return null
  if (song.album) song.albumTitle = song.album
  if (song.thumbnail) song.artwork = song.thumbnail
  const duration = clock(song.durationSeconds)
  if (duration) song.duration = duration
  return { ...song, kind: 'song', source: 'youtube' }
}

export const packFavorites = (list) => (Array.isArray(list) ? list.map(packFavorite) : list)
export const unpackFavorites = (list) => (Array.isArray(list) ? list.map(unpackFavorite).filter((entry) => entry != null) : list)

/** ¿Queda algo en el formato antiguo (objetos)? */
export const hasLegacyFavorites = (list) => Array.isArray(list) && list.some(isLegacyEntry)

const SONGS_SUFFIX = ':favorite-songs'
export const isFavoriteSongsKey = (key) => typeof key === 'string' && key.endsWith(SONGS_SUFFIX)

/**
 * Encoge, una sola vez, las favoritas ya guardadas en el formato antiguo (de cualquier usuario de este equipo):
 * libera el almacenamiento para que lo demás pueda volver a guardarse. Devuelve cuántas claves reescribió.
 */
export function compactStoredFavorites(storage) {
  let rewritten = 0
  try {
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(isFavoriteSongsKey)
    for (const key of keys) {
      const list = JSON.parse(storage.getItem(key) ?? 'null')
      if (!hasLegacyFavorites(list)) continue
      storage.setItem(key, JSON.stringify(packFavorites(list)))
      rewritten += 1
    }
  } catch {
    // Almacenamiento no disponible o dato dañado: se deja como está.
  }
  return rewritten
}
