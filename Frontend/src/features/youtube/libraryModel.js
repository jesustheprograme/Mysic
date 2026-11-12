import { sizedImage } from '../../lib/imageSize.js'

export const LIBRARY_TABS = [
  { id: 'all', label: 'Todo' },
  { id: 'playlists', label: 'Playlists' },
  { id: 'albums', label: 'Álbumes' },
  { id: 'artists', label: 'Artistas' },
  { id: 'uploads', label: 'Subidos' },
  { id: 'downloads', label: 'Descargas' },
]

export const LIKED_ID = 'liked'
export const REPEAT_ID = 'repeat'
// YouTube devuelve su lista de Me gusta como una playlist más (id LM); aquí ya está como "Música que me gusta".
export const isYoutubeLikedList = (playlist) => /^(VL)?LM$/.test(playlist.id)

/** Lado nominal (px CSS) de una tarjeta de la biblioteca: pide 240 px a densidad 1–1,25 y 360 px a partir de 1,5. */
export const LIBRARY_CARD_PX = 180

/** Pide la imagen al tamaño de su hueco (px CSS × densidad de pantalla, por escalones): evita decodificar 544px para una tarjeta de 150. */
export function thumb(url, cssPx = LIBRARY_CARD_PX) {
  return sizedImage(url, cssPx)
}

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`
const labelOf = (entry) => entry.title ?? entry.name ?? ''

const uniqueById = (items) => {
  const seen = new Set()
  return items.filter((item) => item.id && !seen.has(item.id) && seen.add(item.id))
}

// Las entradas tienen la misma forma que los elementos de las secciones del inicio ({ kind, id, title, thumbnail, ... }),
// así las tarjetas, menús y precargas son exactamente los del inicio (adaptBrowseItem + HomeRail + CardMenu).
const toAlbum = (album) => ({ kind: 'album', id: album.id, title: album.title, thumbnail: thumb(album.thumbnail), artist: album.artist, artistId: album.artistId, year: album.year })
const toArtist = (artist) => ({ kind: 'artist', id: artist.id, name: artist.name ?? artist.title, thumbnail: thumb(artist.thumbnail), subtitle: artist.subtitle ?? 'Artista' })

/** Álbumes: los que entrega el servidor (biblioteca real de la cuenta) o, si no los hay, los deducidos de los Me gusta. */
function collectAlbums(data) {
  if (Array.isArray(data.albums) && data.albums.length) return uniqueById(data.albums.map(toAlbum))
  const albums = new Map()
  ;(data.likedSongs ?? []).forEach((song) => {
    if (song.albumId && song.album && !albums.has(song.albumId)) {
      albums.set(song.albumId, toAlbum({ id: song.albumId, title: song.album, thumbnail: song.thumbnail, artist: song.artist, artistId: song.artistId }))
    }
  })
  return [...albums.values()]
}

/** Artistas: biblioteca y suscripciones del servidor o, si no los hay, los deducidos de los Me gusta. */
function collectArtists(data) {
  const fromServer = [...(data.artists ?? []), ...(data.subscriptions ?? [])]
  if (fromServer.length) return uniqueById(fromServer.map(toArtist))
  const artists = new Map()
  ;(data.likedSongs ?? []).forEach((song) => {
    if (!song.artistId) return
    const current = artists.get(song.artistId)
    if (current) current.count += 1
    else artists.set(song.artistId, { ...toArtist({ id: song.artistId, name: song.artist, thumbnail: song.thumbnail }), count: 1 })
  })
  return [...artists.values()].map(({ count, ...artist }) => ({ ...artist, subtitle: plural(count, 'canción', 'canciones') }))
}

/**
 * Entradas de la biblioteca por tipo, con la forma de los elementos de las secciones del inicio. Usa los álbumes,
 * artistas, suscripciones y subidos del servidor y, mientras no existan, deduce álbumes y artistas de los Me gusta.
 * `repeat` son las canciones más reproducidas ("En repetición"); las dos tarjetas especiales llevan kind 'special'.
 */
export function buildLibrary(data, { query = '', repeat = [], sort = 'recent' } = {}) {
  const likedSongs = data.likedSongs ?? []
  const playlists = (data.playlists ?? []).filter((playlist) => !isYoutubeLikedList(playlist))
  const needle = query.trim().toLocaleLowerCase()
  const keep = (entry) => !needle || `${labelOf(entry)} ${entry.artist ?? entry.subtitle ?? ''}`.toLocaleLowerCase().includes(needle)
  const order = (entries) => (sort === 'az' ? [...entries].sort((a, b) => labelOf(a).localeCompare(labelOf(b))) : entries)

  const allAlbums = collectAlbums(data)
  const allArtists = collectArtists(data)
  const allUploads = uniqueById((data.uploads ?? []).map(toAlbum))

  const liked = { kind: 'special', id: LIKED_ID, title: 'Música que me gusta', thumbnail: thumb(likedSongs[0]?.thumbnail), subtitle: plural(likedSongs.length, 'canción', 'canciones') }
  const onRepeat = repeat.length
    ? { kind: 'special', id: REPEAT_ID, title: 'En repetición', thumbnail: thumb(repeat[0].thumbnail), subtitle: plural(repeat.length, 'canción', 'canciones') }
    : null

  return {
    albums: order(allAlbums.filter(keep)),
    artists: order(allArtists.filter(keep)),
    pinned: [onRepeat, liked].filter((entry) => entry && keep(entry)),
    playlists: order(playlists.map((playlist) => ({
      kind: 'playlist', id: playlist.id, title: playlist.title, thumbnail: thumb(playlist.thumbnail), subtitle: plural(playlist.itemCount ?? 0, 'canción', 'canciones'),
    })).filter(keep)),
    totals: { albums: allAlbums.length, artists: allArtists.length, playlists: playlists.length, uploads: allUploads.length },
    uploads: order(allUploads.filter(keep)),
  }
}