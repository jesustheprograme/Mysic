export const LIBRARY_TABS = [
  { id: 'all', label: 'Todo' },
  { id: 'playlists', label: 'Playlists' },
  { id: 'albums', label: 'Álbumes' },
  { id: 'artists', label: 'Artistas' },
  { id: 'songs', label: 'Canciones' },
  { id: 'downloads', label: 'Descargas' },
]

export const LIKED_ID = 'liked'
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`

/** Quita el prefijo de tipo de un id de tarjeta ("pl:abc" -> { kind: 'pl', id: 'abc' }). */
export function parseLibraryId(value) {
  if (value === LIKED_ID) return { kind: LIKED_ID, id: LIKED_ID }
  const index = value.indexOf(':')
  return { kind: value.slice(0, index), id: value.slice(index + 1) }
}

/**
 * Tarjetas de la biblioteca con la forma de HomeRail ({ id, title, artwork, meta }). La biblioteca de YouTube
 * solo trae playlists y Me gusta: álbumes y artistas se deducen de las canciones que te gustan.
 */
export function buildLibrary({ likedSongs = [], playlists = [] }, { query = '', sort = 'recent' } = {}) {
  const albums = new Map()
  const artists = new Map()
  likedSongs.forEach((song) => {
    if (song.albumId && song.album && !albums.has(song.albumId)) {
      albums.set(song.albumId, { id: `al:${song.albumId}`, title: song.album, artwork: song.thumbnail, meta: song.artist ?? 'Álbum' })
    }
    if (song.artistId) {
      const current = artists.get(song.artistId)
      if (current) current.count += 1
      else artists.set(song.artistId, { id: `ar:${song.artistId}`, title: song.artist, artwork: song.thumbnail, count: 1 })
    }
  })

  const needle = query.trim().toLocaleLowerCase()
  const keep = (item) => !needle || `${item.title} ${item.meta ?? ''}`.toLocaleLowerCase().includes(needle)
  const order = (items) => (sort === 'az' ? [...items].sort((a, b) => a.title.localeCompare(b.title)) : items)

  const liked = {
    id: LIKED_ID,
    title: 'Música que me gusta',
    artwork: likedSongs[0]?.thumbnail,
    meta: plural(likedSongs.length, 'canción', 'canciones'),
  }
  const playlistItems = order(playlists.map((playlist) => ({
    id: `pl:${playlist.id}`, title: playlist.title, artwork: playlist.thumbnail, meta: plural(playlist.itemCount ?? 0, 'canción', 'canciones'),
  })).filter(keep))
  const albumItems = order([...albums.values()].filter(keep))
  const artistItems = order([...artists.values()].map(({ count, ...artist }) => ({ ...artist, meta: plural(count, 'canción', 'canciones') })).filter(keep))

  return {
    albums: albumItems,
    artists: artistItems,
    liked: keep(liked) || !needle ? liked : null,
    playlists: playlistItems,
    totals: { albums: albums.size, artists: artists.size, playlists: playlists.length },
  }
}