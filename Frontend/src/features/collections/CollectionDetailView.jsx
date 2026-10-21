import { ArrowDown, ArrowLeft, ArrowUp } from 'lucide-react'
import { createPortal } from 'react-dom'
import { groupTracksByDisc } from '../../lib/tracks.js'
import CollectionSummary from './componentes/CollectionSummary.jsx'
import CollectionTrackList from './componentes/CollectionTrackList.jsx'
import useActiveTrackArrow from './hooks/useActiveTrackArrow.js'

function CollectionDetailView({
  collection,
  collectionFavorite = false,
  likedSongIds,
  onAddToPlaylist,
  onAlbumSelect,
  onArtistSelect,
  onBack,
  onDelete,
  onDownloadCollection,
  onEdit,
  onMoveSong,
  onPlaybackToggle,
  onSongSelect,
  onToggleFavorite,
  onToggleCollectionFavorite,
  onTogglePinned,
  renderTrackActions,
  selectedSongId,
  selectedSongAlbumId,
  selectedSongPlaying,
  songs,
}) {
  const showsTrackArtwork = collection.kind === 'Playlist'
  const selectedSongBelongsToCollection = songs.some((song) => (
    song.id === selectedSongId && (!selectedSongAlbumId || song.albumId === selectedSongAlbumId)
  ))
  const collectionIsPlaying = selectedSongBelongsToCollection && selectedSongPlaying
  const collectionIsSaved = onTogglePinned ? Boolean(collection.pinned) : collectionFavorite
  const trackGroups = collection.kind === 'Álbum' ? groupTracksByDisc(songs) : [{ discNumber: 1, tracks: songs }]
  const showsDiscHeadings = collection.kind === 'Álbum' && trackGroups.length > 1
  const albumTrackNumbers = new Map(
    trackGroups.flatMap((group) => group.tracks).map((song, index) => [song.id, index + 1]),
  )
  const selectedSong = songs.find((song) => (
    song.id === selectedSongId && (!selectedSongAlbumId || song.albumId === selectedSongAlbumId)
  ))
  const activeTrack = useActiveTrackArrow({
    selectedSongAlbumId,
    selectedSongBelongsToCollection,
    selectedSongId,
    songs,
  })

  function toggleCollectionPlayback() {
    if (!songs.length) return
    if (selectedSongBelongsToCollection) {
      onPlaybackToggle?.()
      return
    }
    onSongSelect(songs[0].id, { contextSong: songs[0], contextSongs: songs })
  }

  function downloadCollection() {
    const downloadable = songs.filter((song) => song.audioUrl)
    if (!downloadable.length) return
    const lines = downloadable.flatMap((song) => [
      `#EXTINF:${song.durationSeconds},${song.artist} - ${song.title}`,
      new URL(song.audioUrl, window.location.href).href,
    ])
    const downloadUrl = URL.createObjectURL(new Blob([`#EXTM3U\n${lines.join('\n')}\n`], { type: 'audio/x-mpegurl' }))
    const link = document.createElement('a')
    const fileName = collection.title.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    link.href = downloadUrl
    link.download = `${fileName || 'coleccion'}.m3u`
    link.click()
    URL.revokeObjectURL(downloadUrl)
  }

  async function shareCollection() {
    const shareData = { title: collection.title, text: `${collection.title} · ${collection.artist}`, url: window.location.href }
    if (navigator.share) {
      try { await navigator.share(shareData) } catch { /* The user closed the native share sheet. */ }
      return
    }
    await navigator.clipboard?.writeText(shareData.url)
  }

  const summaryCollection = {
    ...collection,
    onArtistSelect: collection.artistId && onArtistSelect ? () => onArtistSelect(collection.artistId) : null,
  }
  const pageStyle = collection.artwork ? { '--collection-artwork': `url("${collection.artwork}")` } : undefined

  return (
    <section className={`collection-detail${showsTrackArtwork ? ' collection-detail--playlist' : ''}`} style={pageStyle} aria-labelledby="collection-detail-title">
      <div className="collection-detail__ambient" aria-hidden="true" />
      {onBack && <button className="collection-detail__back" type="button" aria-label="Volver al apartado anterior" title="Volver" onClick={onBack}><ArrowLeft size={21} strokeWidth={1.9} aria-hidden="true" /></button>}
      <CollectionSummary
        canDownload={Boolean(onDownloadCollection || songs.some((song) => song.audioUrl))}
        collection={summaryCollection}
        collectionIsPlaying={collectionIsPlaying}
        collectionIsSaved={collectionIsSaved}
        onDelete={onDelete}
        onDownloadCollection={onDownloadCollection ?? downloadCollection}
        onEdit={onEdit}
        onShare={shareCollection}
        onToggleCollectionFavorite={onToggleCollectionFavorite}
        onTogglePinned={onTogglePinned}
        onTogglePlayback={toggleCollectionPlayback}
        showsTrackArtwork={showsTrackArtwork}
        songs={songs}
      />
      <CollectionTrackList
        activeTrackRef={activeTrack.activeTrackRef}
        albumTrackNumbers={albumTrackNumbers}
        likedSongIds={likedSongIds}
        onAddToPlaylist={onAddToPlaylist}
        onAlbumSelect={onAlbumSelect}
        onArtistSelect={onArtistSelect}
        onMoveSong={onMoveSong}
        onPlaybackToggle={onPlaybackToggle}
        onSongSelect={onSongSelect}
        onToggleFavorite={onToggleFavorite}
        renderTrackActions={renderTrackActions}
        selectedSongAlbumId={selectedSongAlbumId}
        selectedSongId={selectedSongId}
        selectedSongPlaying={selectedSongPlaying}
        showsDiscHeadings={showsDiscHeadings}
        showsTrackArtwork={showsTrackArtwork}
        songs={songs}
        trackGroups={trackGroups}
        tracksRef={activeTrack.tracksRef}
      />
      {selectedSong && createPortal(
        <button className={`collection-detail__active-track-arrow${activeTrack.direction ? ' collection-detail__active-track-arrow--visible' : ''}`} type="button" aria-label="Ir a la posición de la canción seleccionada" title="Ir a la canción seleccionada" ref={activeTrack.arrowRef} onClick={activeTrack.scrollToActiveTrack}>
          {activeTrack.direction === 'down' ? <ArrowDown size={21} strokeWidth={2.2} aria-hidden="true" /> : <ArrowUp size={21} strokeWidth={2.2} aria-hidden="true" />}
        </button>,
        document.body,
      )}
    </section>
  )
}

export default CollectionDetailView
