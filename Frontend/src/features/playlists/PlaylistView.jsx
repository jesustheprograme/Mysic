import CollectionDetailView from '../collections/CollectionDetailView.jsx'

function PlaylistView({
  likedSongIds,
  onAddToPlaylist,
  onBack,
  onEdit,
  onPlaybackToggle,
  onReorderPlaylist,
  onSongSelect,
  onToggleFavorite,
  onTogglePinned,
  playlist,
  selectedSongId,
  selectedSongPlaying,
  songs,
}) {
  const playlistSongs = playlist.songIds.flatMap((songId) => {
    const song = songs.find((item) => item.id === songId)
    return song ? [song] : []
  })

  function moveSong(draggedSongId, targetSongId) {
    const nextSongIds = [...playlist.songIds]
    const sourceIndex = nextSongIds.indexOf(draggedSongId)
    const targetIndex = nextSongIds.indexOf(targetSongId)
    if (sourceIndex < 0 || targetIndex < 0) return

    nextSongIds.splice(sourceIndex, 1)
    nextSongIds.splice(targetIndex, 0, draggedSongId)
    onReorderPlaylist(playlist.id, nextSongIds)
  }

  return (
    <CollectionDetailView
      collection={{
        ...playlist,
        artist: 'Tu biblioteca',
        kind: 'Playlist',
      }}
      likedSongIds={likedSongIds}
      onAddToPlaylist={onAddToPlaylist}
      onBack={onBack}
      onEdit={() => onEdit?.(playlist)}
      onMoveSong={moveSong}
      onPlaybackToggle={onPlaybackToggle}
      onSongSelect={onSongSelect}
      onToggleFavorite={onToggleFavorite}
      onTogglePinned={() => onTogglePinned?.(playlist)}
      selectedSongId={selectedSongId}
      selectedSongPlaying={selectedSongPlaying}
      songs={playlistSongs}
    />
  )
}

export default PlaylistView
