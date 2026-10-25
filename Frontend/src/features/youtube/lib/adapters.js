function parseDurationSeconds(duration) {
  if (typeof duration === 'number') return duration
  if (typeof duration !== 'string') return 0

  const parts = duration.split(':').map(Number)
  if (!parts.length || parts.some((part) => !Number.isFinite(part))) return 0
  return parts.reduce((total, part) => (total * 60) + part, 0)
}

export function adaptSong(song, index = 0, defaults = {}) {
  return {
    ...song,
    artist: song.artist || defaults.artist || 'Artista desconocido',
    artistId: song.artistId || defaults.artistId || null,
    albumTitle: song.album,
    artwork: song.thumbnail ?? song.artwork,
    durationSeconds: Number(song.durationSeconds) || parseDurationSeconds(song.duration),
    source: 'youtube',
    trackNo: song.index ?? index + 1,
  }
}

export function adaptArtist(artist) {
  return { artwork: artist.thumbnail, id: artist.id, meta: artist.subtitle, title: artist.name }
}

export function adaptAlbum(album) {
  return {
    artwork: album.thumbnail,
    artist: album.kind !== 'Álbum' ? album.kind : album.artist,
    detail: album.year,
    id: album.id,
    title: album.title,
  }
}

export function adaptBrowseItem(item) {
  if (item.kind === 'artist') return adaptArtist(item)
  if (item.kind === 'album') {
    return { artwork: item.thumbnail, artist: item.artist, artistId: item.artistId, detail: item.year, id: item.id, title: item.title }
  }

  return {
    artwork: item.thumbnail,
    artist: item.artist ?? item.subtitle ?? item.album,
    artistId: item.artistId,
    detail: item.kind === 'playlist' ? 'Playlist' : item.album || 'Sencillo',
    detailId: item.kind === 'song' ? item.albumId : null,
    id: item.id,
    title: item.title,
  }
}

function getReleaseType(title, kind) {
  if (/ep/i.test(kind) || /ep/i.test(title)) return 'ep'
  if (/single/i.test(title)) return 'single'
  return 'album'
}

export function adaptReleases(shelves) {
  return shelves.flatMap((shelf) => shelf.items.map((release) => ({
    artwork: release.thumbnail,
    id: release.id,
    releaseDate: release.year ? `${release.year}-01-01` : null,
    releaseType: getReleaseType(shelf.title, release.kind),
    songCount: null,
    songs: [],
    subtitle: release.kind !== 'Álbum' ? release.kind : release.artist,
    title: release.title,
  })))
}
