const TOP_ARTISTS = 6

export function formatHours(seconds) {
  if (!seconds) return '0 min'
  const minutes = Math.round(seconds / 60)
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`
}

function topByArtist(songs, nameOf, idOf) {
  const counts = new Map()
  for (const song of songs) {
    const id = idOf(song)
    if (!id) continue
    const current = counts.get(id) ?? { id, title: nameOf(song), songCount: 0 }
    current.songCount += 1
    counts.set(id, current)
  }
  return [...counts.values()].sort((a, b) => b.songCount - a.songCount).slice(0, TOP_ARTISTS)
}

/**
 * Datos de la página de estadísticas. Con catálogo del servidor usa ese catálogo; sin él (servidor deshabilitado,
 * vacío o sin conexión) cae a la biblioteca de YouTube guardada en el equipo, para que la página no quede en ceros.
 * `source` indica el origen; con 'youtube' los artistas no se pueden abrir desde aquí (son ids de YouTube).
 */
export function buildStats({ albumItems = [], artistItems = [], likedSongIds, songs = [], youtube = null }) {
  if (songs.length > 0) {
    const artistNames = new Map(artistItems.map((artist) => [artist.artistId, artist.title]))
    const top = topByArtist(songs, (song) => artistNames.get(song.artistId) ?? song.artist, (song) => song.artistId)
    return {
      source: 'server',
      cards: [
        { label: 'Canciones', value: songs.length },
        { label: 'Artistas', value: artistItems.length },
        { label: 'Álbumes', value: albumItems.length },
        { label: 'Favoritas', value: songs.filter((song) => likedSongIds?.has(song.id)).length },
        { label: 'Tiempo total', value: formatHours(songs.reduce((sum, song) => sum + (song.durationSeconds ?? 0), 0)) },
      ],
      top,
    }
  }

  const liked = youtube?.likedSongs ?? []
  const albums = youtube?.albums?.length ?? new Set(liked.map((song) => song.albumId).filter(Boolean)).size
  const artists = (youtube?.artists?.length ?? 0) + (youtube?.subscriptions?.length ?? 0)
    || new Set(liked.map((song) => song.artistId).filter(Boolean)).size
  return {
    source: 'youtube',
    cards: [
      { label: 'Me gusta', value: liked.length },
      { label: 'Playlists', value: youtube?.playlists?.filter((playlist) => !/^(VL)?LM$/.test(playlist.id)).length ?? 0 },
      { label: 'Álbumes', value: albums },
      { label: 'Artistas', value: artists },
      { label: 'Tiempo total', value: formatHours(liked.reduce((sum, song) => sum + (song.durationSeconds ?? 0), 0)) },
    ],
    top: topByArtist(liked, (song) => song.artist, (song) => song.artistId),
  }
}