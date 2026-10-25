import CollectionDetailView from '../collections/CollectionDetailView.jsx'
import PlaylistDeleteModal from './PlaylistDeleteModal.jsx'
import { reorderPlaylistTracks, resolvePlaylistSongs } from './playlistTracks.js'
import { useState } from 'react'

function PlaylistView({
  likedSongIds,
  onAddToPlaylist,
  onAlbumSelect,
  onArtistSelect,
  onBack,
  onDelete,
  onEdit,
  onExternalSongSelect,
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
  const playlistSongs = resolvePlaylistSongs(playlist, songs)
  const playlistArtists = new Map()
  playlistSongs.forEach((song) => {
    const artist = song.artists?.[0]
    const artistId = song.artistId ?? artist?.id
    if (artistId && !playlistArtists.has(artistId)) {
      playlistArtists.set(artistId, {
        artwork: artist?.image ?? song.artwork,
        id: artistId,
        name: artist?.name ?? song.artist,
      })
    }
  })
  const playlistArtist = playlistArtists.size === 1 ? [...playlistArtists.values()][0] : null

  function moveSong(draggedTrackKey, targetTrackKey) {
    onReorderPlaylist(playlist.id, reorderPlaylistTracks(playlist, draggedTrackKey, targetTrackKey))
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
          artist: playlistArtist?.name ?? 'Tu biblioteca',
          artistArtwork: playlistArtist?.artwork,
          artistId: playlistArtist?.id,
          kind: 'Playlist',
        }}
        likedSongIds={likedSongIds}
        onAddToPlaylist={onAddToPlaylist}
        onAlbumSelect={onAlbumSelect}
        onArtistSelect={onArtistSelect}
        onBack={onBack}
        onDelete={() => setDeleteModalOpen(true)}
        onEdit={() => onEdit?.(playlist)}
        onMoveSong={moveSong}
        onPlaybackToggle={onPlaybackToggle}
        onSongSelect={(songId, options) => {
          const song = playlistSongs.find((item) => item.id === songId)
          if (song?.source === 'youtube') onExternalSongSelect?.(song)
          else onSongSelect(songId, options)
        }}
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
