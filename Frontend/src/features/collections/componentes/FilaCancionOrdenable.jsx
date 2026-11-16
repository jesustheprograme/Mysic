import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, ListPlus } from 'lucide-react'
import HeartToggle from '../../../components/HeartToggle.jsx'
import PreviewIndicator from '../../../components/PreviewIndicator.jsx'
import { sizedImage } from '../../../lib/imageSize.js'
import { ctxMenu } from '../../youtube/contextMenuStore.js'
import SongMoreButton from '../../youtube/SongMoreButton.jsx'

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

function formatTrackNumber(song, index, displayTrackNumber) {
  if (displayTrackNumber) return String(displayTrackNumber)
  return String(song.trackNumber ?? song.trackNo ?? index + 1).padStart(2, '0')
}

function TrackPlaybackButton({ displayTrackNumber, index, isPlaying, isSelected, onToggle, song, withArtwork }) {
  const label = isPlaying ? `Pausar ${song.title}` : `Reproducir ${song.title}`
  const content = withArtwork
    ? <img src={sizedImage(song.artwork, 44)} alt="" width="44" height="44" loading="lazy" decoding="async" />
    : <span className="collection-detail__track-number" aria-hidden="true">{formatTrackNumber(song, index, displayTrackNumber)}</span>

  return (
    <button
      className={`${withArtwork ? 'collection-detail__track-artwork' : 'collection-detail__track-index'} collection-detail__track-playback playback-hover${isSelected ? ' collection-detail__track-playback--selected' : ''}`}
      type="button"
      aria-label={label}
      aria-pressed={isPlaying}
      title={label}
      onClick={onToggle}
    >
      {content}
      <span className="collection-detail__track-playback-status" aria-hidden="true">
        <PreviewIndicator status={isPlaying ? 'playing' : isSelected ? 'paused' : null} />
      </span>
    </button>
  )
}

// Fecha corta en español ("23 oct 2026"). Un solo formateador para todas las filas.
const dateFormat = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * Columna "Álbum" de la tabla: solo canciones con álbum real (con id), como enlace. Sin id YouTube pone un texto de
 * relleno ("Sencillo"), que no es un álbum: la celda queda vacía, como en limusic.
 */
function TrackAlbum({ albumId, albumTitle, onAlbumSelect }) {
  if (!albumId || !albumTitle) return <span className="collection-detail__track-album" />
  return (
    <span className="collection-detail__track-album">
      {onAlbumSelect
        ? <button className="collection-detail__catalog-link" type="button" title={albumTitle} onClick={() => onAlbumSelect(albumId)}>{albumTitle}</button>
        : <span title={albumTitle}>{albumTitle}</span>}
    </span>
  )
}

/** Columna "Fecha de adición": cuándo vio Mysic la canción por primera vez en la lista (YouTube no da la fecha real). */
function TrackAddedAt({ at }) {
  return <span className="collection-detail__track-date">{at ? <time dateTime={new Date(at).toISOString()}>{dateFormat.format(at)}</time> : null}</span>
}

function TrackMetadata({ albumId, albumTitle, artistId, onAlbumSelect, onArtistSelect, onSongSelect, song, variant }) {
  return (
    <div className="collection-detail__track-main">
      <button className="collection-detail__track-title" type="button" onClick={() => onSongSelect(song.id)}>{song.title}</button>
      {variant !== 'album' && (
        <small>
          <button className="collection-detail__catalog-link collection-detail__catalog-link--artist" type="button" disabled={!artistId} onClick={() => onArtistSelect?.(artistId)}>{song.artist}</button>
          {variant !== 'table' && albumId && albumTitle && (
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

// El corazón va envuelto para poder ocultarlo hasta pasar el cursor cuando la canción no es favorita (CSS).
function TrackActions({ isLiked, onAddToPlaylist, onToggleFavorite, renderTrackActions, song }) {
  return (
    <span className="collection-detail__track-actions">
      {renderTrackActions?.(song)}
      {onToggleFavorite && (
        <span className="collection-detail__track-heart" data-liked={isLiked ? 'true' : 'false'}>
          <HeartToggle
            className="heart-container--song-row"
            label={`Me gusta ${song.title}`}
            liked={isLiked}
            onToggle={(liked) => onToggleFavorite(song.id, liked, song)}
            removeLabel={`Quitar ${song.title} de favoritas`}
            size={17}
          />
        </span>
      )}
      {onAddToPlaylist && (
        <button className="collection-detail__track-action" type="button" aria-label={`Añadir ${song.title} a una playlist`} title="Añadir a playlist" onClick={() => onAddToPlaylist(song)}>
          <ListPlus size={17} strokeWidth={1.8} aria-hidden="true" />
        </button>
      )}
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
  onSongIntent,
  onSongSelect,
  onToggleFavorite,
  nodeRef,
  reorderable,
  renderTrackActions,
  song,
  status,
  variant,
}) {
  const { addedAt, isLiked, isPlaying, isSelected } = status
  // "table": playlist con columnas (número, carátula, título, álbum, fecha); "playlist": carátula como botón; "album": número.
  const table = variant === 'table'
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
    id: song.trackKey ?? song.id,
    disabled: !reorderable,
    transition: {
      duration: 260,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    },
  })
  // Solo la transición que dnd-kit pide mientras se reordena. Antes se añadían aquí seis transiciones
  // más en línea (color, fondo, sombra, opacidad, contorno, escala): al ser estilos en línea ganaban
  // a cualquier CSS y cada fila de la lista las animaba. Las filas de una lista no deben animarse.
  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || undefined,
  }
  const className = [
    'collection-detail__track',
    table && 'collection-detail__track--table',
    song.source === 'youtube' && 'collection-detail__track--menu',
    reorderable && 'collection-detail__track--reorderable',
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
        onContextMenu={song.source === 'youtube' ? ctxMenu('song', song) : undefined}
        onFocusCapture={() => onSongIntent?.(song, true)}
        onPointerDown={() => onSongIntent?.(song, true)}
        onPointerEnter={() => onSongIntent?.(song)}
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
      <TrackPlaybackButton displayTrackNumber={table ? index + 1 : displayTrackNumber} index={index} isPlaying={isPlaying} isSelected={isSelected} onToggle={toggleTrackPlayback} song={song} withArtwork={showsTrackArtwork} />
      {table && (song.artwork
        ? <img className="collection-detail__track-thumb" src={sizedImage(song.artwork, 44)} alt="" width="44" height="44" loading="lazy" decoding="async" />
        : <i className="collection-detail__track-thumb" aria-hidden="true" />)}
      <TrackMetadata albumId={albumId} albumTitle={albumTitle} artistId={artistId} onAlbumSelect={onAlbumSelect} onArtistSelect={onArtistSelect} onSongSelect={onSongSelect} song={song} variant={variant} />
      {table && <TrackAlbum albumId={albumId} albumTitle={albumTitle} onAlbumSelect={onAlbumSelect} />}
      {table && <TrackAddedAt at={addedAt} />}
      <TrackActions isLiked={isLiked} onAddToPlaylist={onAddToPlaylist} onToggleFavorite={onToggleFavorite} renderTrackActions={renderTrackActions} song={song} />
      <time>{formatDuration(song.durationSeconds)}</time>
      {song.source === 'youtube' && <SongMoreButton className="song-more--row" song={song} />}
    </li>
  )
}
