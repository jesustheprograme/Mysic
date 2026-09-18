import CollectionDetailView from './CollectionDetailView.jsx'
import { normalizeTrack, sortTracks } from '../../lib/tracks.js'

function AlbumView({
  album,
  likedAlbumIds,
  likedSongIds,
  onAddToPlaylist,
  onArtistSelect,
  onBack,
  onPlaybackToggle,
  onSongSelect,
  onToggleFavorite,
  onToggleAlbumFavorite,
  selectedSongId,
  selectedSongAlbumId,
  selectedSongPlaying,
  songs,
}) {
  const albumSongs = sortTracks(
    songs.flatMap((song) => {
      const membership = song.albumMemberships?.find((item) => item.id === album.albumId)
      if (!membership) return []

      return normalizeTrack({
        ...song,
        albumId: membership.id,
        albumTitle: membership.title,
        artwork: membership.artwork ?? song.artwork,
        releaseDate: membership.releaseDate,
        discNo: membership.discNo,
        trackNo: membership.trackNo,
      })
    }),
  )

  return (
    <CollectionDetailView
      collection={{
        ...album,
        kind: 'Álbum',
      }}
      collectionFavorite={likedAlbumIds?.has(album.albumId)}
      likedSongIds={likedSongIds}
      onAddToPlaylist={onAddToPlaylist}
      onArtistSelect={onArtistSelect}
      onBack={onBack}
      onPlaybackToggle={onPlaybackToggle}
      onSongSelect={onSongSelect}
      onToggleFavorite={onToggleFavorite}
      onToggleCollectionFavorite={(liked) => onToggleAlbumFavorite?.(album.albumId, liked)}
      selectedSongId={selectedSongId}
      selectedSongAlbumId={selectedSongAlbumId}
      selectedSongPlaying={selectedSongPlaying}
      songs={albumSongs}
    />
  )
}

export default AlbumView
