export function adaptSong(song, index = 0) {
  return {
    ...song,
    albumTitle: song.album,
    artwork: song.thumbnail ?? song.artwork,
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
