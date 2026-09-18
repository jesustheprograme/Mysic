import CollectionDetailView from './CollectionDetailView.jsx'

function AlbumView({
  album,
  likedSongIds,
  onAddToPlaylist,
  onBack,
  onPlaybackToggle,
  onSongSelect,
  onToggleFavorite,
  selectedSongId,
  selectedSongPlaying,
  songs,
}) {
  const albumSongs = songs.filter((song) => song.albumId === album.albumId)

  return (
    <CollectionDetailView
      collection={{ ...album, kind: 'Álbum' }}
      likedSongIds={likedSongIds}
      onAddToPlaylist={onAddToPlaylist}
      onBack={onBack}
      onPlaybackToggle={onPlaybackToggle}
      onSongSelect={onSongSelect}
      onToggleFavorite={onToggleFavorite}
      selectedSongId={selectedSongId}
      selectedSongPlaying={selectedSongPlaying}
      songs={albumSongs}
    />
  )
}

export default AlbumView
