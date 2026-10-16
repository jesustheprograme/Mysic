export function normalizeYoutubePlaylistSong(song) {
  return {
    id: song.id,
    title: song.title,
    artist: song.artist || 'Artista desconocido',
    artistId: song.artistId || null,
    album: song.album || song.albumTitle || 'Sencillo',
    albumId: song.albumId || null,
    duration: song.duration || '--:--',
    durationSeconds: song.durationSeconds || 0,
    thumbnail: song.thumbnail || song.artwork || '',
    source: 'youtube',
  }
}
