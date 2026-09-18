import CollectionDetailView from '../collections/CollectionDetailView.jsx'
import PlaylistDeleteModal from './PlaylistDeleteModal.jsx'
import { useState } from 'react'

function PlaylistView({
  likedSongIds,
  onAddToPlaylist,
  onBack,
  onDelete,
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
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
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

  async function deletePlaylist() {
    setDeleting(true)
    try {
      await onDelete?.(playlist)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <CollectionDetailView
        collection={{
          ...playlist,
          artist: 'Tu biblioteca',
          kind: 'Playlist',
        }}
        likedSongIds={likedSongIds}
        onAddToPlaylist={onAddToPlaylist}
        onBack={onBack}
        onDelete={() => setDeleteModalOpen(true)}
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
      {deleteModalOpen && (
        <PlaylistDeleteModal
          deleting={deleting}
          playlist={playlist}
          onCancel={() => setDeleteModalOpen(false)}
          onConfirm={deletePlaylist}
        />
      )}
    </>
  )
}

export default PlaylistView
