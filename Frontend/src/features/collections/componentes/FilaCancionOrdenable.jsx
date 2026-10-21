import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, ListPlus } from 'lucide-react'
import HeartToggle from '../../../components/HeartToggle.jsx'
import PreviewIndicator from '../../../components/PreviewIndicator.jsx'

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

function formatTrackNumber(song, index, displayTrackNumber) {
  if (displayTrackNumber) return String(displayTrackNumber)
  return String(song.trackNumber ?? song.trackNo ?? index + 1).padStart(2, '0')
}

function TrackPlaybackButton({ displayTrackNumber, index, isPlaying, onToggle, song, withArtwork }) {
  const label = isPlaying ? `Pausar ${song.title}` : `Reproducir ${song.title}`
  const content = withArtwork
    ? <img src={song.artwork} alt="" loading="lazy" />
    : <span className="collection-detail__track-number" aria-hidden="true">{formatTrackNumber(song, index, displayTrackNumber)}</span>

  return (
    <button
      className={`${withArtwork ? 'collection-detail__track-artwork' : 'collection-detail__track-index'} collection-detail__track-playback playback-hover${isPlaying ? ' collection-detail__track-playback--playing' : ''}`}
      type="button"
      aria-label={label}
      aria-pressed={isPlaying}
      title={label}
      onClick={onToggle}
    >
      {content}
      <span className="collection-detail__track-playback-status" aria-hidden="true">
        <PreviewIndicator status={isPlaying ? 'playing' : null} />
      </span>
    </button>
  )
}

function TrackMetadata({ albumId, albumTitle, artistId, onAlbumSelect, onArtistSelect, onSongSelect, song, variant }) {
  return (
    <div className="collection-detail__track-main">
      <button className="collection-detail__track-title" type="button" onClick={() => onSongSelect(song.id)}>{song.title}</button>
      {variant !== 'album' && (
        <small>
          <button className="collection-detail__catalog-link collection-detail__catalog-link--artist" type="button" disabled={!artistId} onClick={() => onArtistSelect?.(artistId)}>{song.artist}</button>
          {albumId && albumTitle && (
            <>
              <span className="collection-detail__catalog-separator" aria-hidden="true">·</span>
              <button className="collection-detail__catalog-link collection-detail__catalog-link--album" type="button" title={albumTitle} onClick={() => onAlbumSelect?.(albumId)}>{albumTitle}</button>
            </>
          )}
        </small>
      )}
    </div>
  )
}

function TrackActions({ isLiked, onAddToPlaylist, onToggleFavorite, renderTrackActions, song }) {
  return (
    <span className="collection-detail__track-actions">
      {onToggleFavorite && (
        <HeartToggle
          className="heart-container--song-row"
          label={`Me gusta ${song.title}`}
          liked={isLiked}
          onToggle={(liked) => onToggleFavorite(song.id, liked)}
          removeLabel={`Quitar ${song.title} de favoritas`}
          size={17}
        />
      )}
      {onAddToPlaylist && (
        <button className="collection-detail__track-action" type="button" aria-label={`Añadir ${song.title} a una playlist`} title="Añadir a playlist" onClick={() => onAddToPlaylist(song)}>
          <ListPlus size={17} strokeWidth={1.8} aria-hidden="true" />
        </button>
      )}
      {renderTrackActions?.(song)}
    </span>
  )
}

export default function FilaCancionOrdenable({
  displayTrackNumber,
  index,
  onAddToPlaylist,
  onAlbumSelect,
  onArtistSelect,
  onPlaybackToggle,
  onSongSelect,
  onToggleFavorite,
  nodeRef,
  reorderable,
  renderTrackActions,
  song,
  status,
  variant,
}) {
  const { isLiked, isPlaying, isSelected } = status
  const showsTrackArtwork = variant === 'playlist'
  const {
    attributes,
    isDragging,
    isOver,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: song.id,
    disabled: !reorderable,
    transition: {
      duration: 260,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    },
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition: [
      transition,
      'color 180ms ease',
      'background-color 220ms ease',
      'box-shadow 260ms ease',
      'opacity 220ms ease',
      'outline-color 220ms ease',
      'scale 260ms cubic-bezier(0.22, 1, 0.36, 1)',
    ].filter(Boolean).join(', '),
  }
  const className = [
    'collection-detail__track',
    isSelected && 'collection-detail__track--active',
    isDragging && 'collection-detail__track--dragging',
    isOver && !isDragging && 'collection-detail__track--drop-target',
  ].filter(Boolean).join(' ')
  const artistId = song.artistId ?? song.artists?.[0]?.id
  const albumId = song.albumId ?? song.album?.id ?? song.albumMemberships?.[0]?.id
  const albumTitle = song.albumTitle ?? song.album?.title ?? song.albumMemberships?.[0]?.title

  function toggleTrackPlayback() {
    if (isSelected) {
      onPlaybackToggle?.()
      return
    }
    onSongSelect(song.id)
  }

  return (
    <li
        className={className}
        ref={(node) => {
        setNodeRef(node)
          if (nodeRef) nodeRef.current = node
        }}
      style={style}
    >
      {reorderable && (
        <button
          className="collection-detail__drag-handle"
          type="button"
          aria-label={`Arrastrar ${song.title} para reordenar`}
          title="Arrastrar para reordenar"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={19} strokeWidth={2.2} aria-hidden="true" />
        </button>
      )}
      <TrackPlaybackButton displayTrackNumber={displayTrackNumber} index={index} isPlaying={isPlaying} onToggle={toggleTrackPlayback} song={song} withArtwork={showsTrackArtwork} />
      <TrackMetadata albumId={albumId} albumTitle={albumTitle} artistId={artistId} onAlbumSelect={onAlbumSelect} onArtistSelect={onArtistSelect} onSongSelect={onSongSelect} song={song} variant={variant} />
      <TrackActions isLiked={isLiked} onAddToPlaylist={onAddToPlaylist} onToggleFavorite={onToggleFavorite} renderTrackActions={renderTrackActions} song={song} />
      <time>{formatDuration(song.durationSeconds)}</time>
    </li>
  )
}
