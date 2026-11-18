// Artistas y álbumes de la cola del reproductor, en el orden en que aparecen, con cuántas canciones aporta cada uno.
// Las canciones de YouTube traen `album` como texto; las del catálogo propio pueden traerlo como objeto { id, title }.

const UNKNOWN_ARTIST = 'Artista desconocido'
// Relleno del backend para canciones sin álbum (vídeos, sencillos sueltos): no es un álbum.
const NO_ALBUM = 'Sencillo'

function albumOf(song) {
  const album = song?.album
  const raw = typeof album === 'string' ? album : album?.title ?? song?.albumTitle
  const title = typeof raw === 'string' ? raw.trim() : ''
  const id = song?.albumId ?? (typeof album === 'object' ? album?.id : null) ?? null
  if (!id && title === NO_ALBUM) return { id: null, title: '' }
  return { id, title }
}

function artistOf(song) {
  const title = typeof song?.artist === 'string' ? song.artist.trim() : ''
  return { id: song?.artistId ?? null, title: title === UNKNOWN_ARTIST ? '' : title }
}

/**
 * Agrupa la cola por `kind` ('artist' | 'album'). Cada grupo: { key, id, title, subtitle, artwork, count, firstIndex }.
 * Se agrupa por id si lo hay (dos álbumes distintos pueden llamarse igual) y, si no, por el nombre sin mayúsculas
 * (en álbumes, nombre y artista).
 */
export function groupQueue(queue, kind) {
  const pick = kind === 'album' ? albumOf : artistOf
  const groups = new Map()
  ;(queue ?? []).forEach((song, index) => {
    const { id, title } = pick(song)
    if (!title) return
    const name = kind === 'album' ? `${title}\u0000${artistOf(song).title}` : title
    const key = id ? `id:${id}` : `name:${name.toLocaleLowerCase()}`
    const group = groups.get(key)
    if (group) {
      group.count += 1
      if (!group.artwork && song.artwork) group.artwork = song.artwork
      return
    }
    groups.set(key, {
      artwork: song.artwork ?? null,
      count: 1,
      firstIndex: index,
      id,
      key,
      subtitle: kind === 'album' ? artistOf(song).title : '',
      title,
    })
  })
  return [...groups.values()]
}
