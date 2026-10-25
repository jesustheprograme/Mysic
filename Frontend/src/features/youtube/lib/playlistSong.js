function parseDurationSeconds(duration) {
  if (typeof duration !== 'string') return 0
  const parts = duration.split(':').map(Number)
  if (!parts.length || parts.some((part) => !Number.isFinite(part))) return 0
  return parts.reduce((total, part) => (total * 60) + part, 0)
}

export function normalizeYoutubePlaylistSong(song) {
  return {
    id: song.id,
    title: song.title,
    artist: song.artist || 'Artista desconocido',
    artistId: song.artistId || null,
    album: song.album || song.albumTitle || 'Sencillo',
    albumId: song.albumId || null,
    duration: song.duration || '--:--',
    durationSeconds: Number(song.durationSeconds) || parseDurationSeconds(song.duration),
    thumbnail: song.thumbnail || song.artwork || '',
    source: 'youtube',
  }
}
