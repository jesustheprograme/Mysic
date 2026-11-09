export const LIBRARY_TABS = [
  { id: 'all', label: 'Todo' },
  { id: 'playlists', label: 'Playlists' },
  { id: 'albums', label: 'Álbumes' },
  { id: 'artists', label: 'Artistas' },
  { id: 'songs', label: 'Canciones' },
  { id: 'uploads', label: 'Subidos' },
  { id: 'downloads', label: 'Descargas' },
]

export const LIKED_ID = 'liked'
export const REPEAT_ID = 'repeat'
// YouTube devuelve su lista de Me gusta como una playlist más (id LM); aquí ya está como "Música que me gusta".
const isYoutubeLikedList = (playlist) => /^(VL)?LM$/.test(playlist.id)

/** Pide la imagen al tamaño de su hueco (hosts de Google aceptan =wN-hN / =sN): evita decodificar 544px para una tarjeta de 150. */
export function thumb(url, size = 360) {
  if (typeof url !== 'string') return url
  return url.replace(/=w\d+-h\d+/, `=w${size}-h${size}`).replace(/=s\d+/, `=s${size}`)
}

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`

/** Quita el prefijo de tipo de un id de tarjeta ("pl:abc" -> { kind: 'pl', id: 'abc' }). */
export function parseLibraryId(value) {
  if (value === LIKED_ID || value === REPEAT_ID) return { kind: value, id: value }
  const index = value.indexOf(':')
  return { kind: value.slice(0, index), id: value.slice(index + 1) }
}

const uniqueById = (items) => {
  const seen = new Set()
  return items.filter((item) => item.id && !seen.has(item.id) && seen.add(item.id))
}

/** Álbumes: los que entrega el servidor (biblioteca real de la cuenta) o, si no los hay, los deducidos de los Me gusta. */
function collectAlbums(data) {
  if (Array.isArray(data.albums) && data.albums.length) {
    return uniqueById(data.albums.map((album) => ({
      id: album.id,
      title: album.title,
      artwork: thumb(album.thumbnail),
      meta: [album.artist, album.year].filter(Boolean).join(' · ') || 'Álbum',
    }))).map((album) => ({ ...album, id: `al:${album.id}` }))
  }
  const albums = new Map()
  ;(data.likedSongs ?? []).forEach((song) => {
    if (song.albumId && song.album && !albums.has(song.albumId)) {
      albums.set(song.albumId, { id: `al:${song.albumId}`, title: song.album, artwork: thumb(song.thumbnail), meta: song.artist ?? 'Álbum' })
    }
  })
  return [...albums.values()]
}

/** Artistas: biblioteca y suscripciones del servidor o, si no los hay, los deducidos de los Me gusta. */
function collectArtists(data) {
  const fromServer = [...(data.artists ?? []), ...(data.subscriptions ?? [])]
  if (fromServer.length) {
    return uniqueById(fromServer.map((artist) => ({
      id: artist.id,
      title: artist.name ?? artist.title,
      artwork: thumb(artist.thumbnail),
      meta: artist.subtitle ?? 'Artista',
    }))).map((artist) => ({ ...artist, id: `ar:${artist.id}` }))
  }
  const artists = new Map()
  ;(data.likedSongs ?? []).forEach((song) => {
    if (!song.artistId) return
    const current = artists.get(song.artistId)
    if (current) current.count += 1
    else artists.set(song.artistId, { id: `ar:${song.artistId}`, title: song.artist, artwork: thumb(song.thumbnail), count: 1 })
  })
  return [...artists.values()].map(({ count, ...artist }) => ({ ...artist, meta: plural(count, 'canción', 'canciones') }))
}

/**
 * Tarjetas de la biblioteca con la forma de HomeRail ({ id, title, artwork, meta }). Usa los álbumes, artistas,
 * suscripciones y subidos que entregue el servidor y, mientras no existan, deduce álbumes y artistas de los Me gusta.
 * `repeat` son las canciones más reproducidas ("En repetición").
 */
export function buildLibrary(data, { query = '', repeat = [], sort = 'recent' } = {}) {
  const likedSongs = data.likedSongs ?? []
  const playlists = (data.playlists ?? []).filter((playlist) => !isYoutubeLikedList(playlist))
  const needle = query.trim().toLocaleLowerCase()
  const keep = (item) => !needle || `${item.title} ${item.meta ?? ''}`.toLocaleLowerCase().includes(needle)
  const order = (items) => (sort === 'az' ? [...items].sort((a, b) => a.title.localeCompare(b.title)) : items)

  const allAlbums = collectAlbums(data)
  const allArtists = collectArtists(data)
  const allUploads = uniqueById((data.uploads ?? []).map((album) => ({
    id: album.id, title: album.title, artwork: thumb(album.thumbnail), meta: album.artist ?? 'Subido',
  }))).map((album) => ({ ...album, id: `al:${album.id}` }))

  const liked = { id: LIKED_ID, title: 'Música que me gusta', artwork: thumb(likedSongs[0]?.thumbnail), meta: plural(likedSongs.length, 'canción', 'canciones') }
  const onRepeat = repeat.length
    ? { id: REPEAT_ID, title: 'En repetición', artwork: thumb(repeat[0].thumbnail), meta: plural(repeat.length, 'canción', 'canciones') }
    : null
  const pinned = [onRepeat, liked].filter((item) => item && (!needle || keep(item)))

  return {
    albums: order(allAlbums.filter(keep)),
    artists: order(allArtists.filter(keep)),
    pinned,
    playlists: order(playlists.map((playlist) => ({
      id: `pl:${playlist.id}`, title: playlist.title, artwork: thumb(playlist.thumbnail), meta: plural(playlist.itemCount ?? 0, 'canción', 'canciones'),
    })).filter(keep)),
    totals: { albums: allAlbums.length, artists: allArtists.length, playlists: playlists.length, uploads: allUploads.length },
    uploads: order(allUploads.filter(keep)),
  }
}