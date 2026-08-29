import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { restrictToFirstScrollableAncestor, restrictToVerticalAxis } from '@dnd-kit/modifiers'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  ArrowLeft,
  Bookmark,
  Download,
  GripVertical,
  ListPlus,
  MoreHorizontal,
  Pause,
  Pencil,
  Pin,
  PinOff,
  Play,
  Share2,
} from 'lucide-react'
import { useState } from 'react'
import HeartToggle from '../../components/HeartToggle.jsx'
import PreviewIndicator from '../../components/PreviewIndicator.jsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu.jsx'

const dragModifiers = [restrictToFirstScrollableAncestor, restrictToVerticalAxis]

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

function formatCollectionLength(seconds) {
  const minutes = Math.max(1, Math.round(seconds / 60))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours} h${remainingMinutes ? ` ${remainingMinutes} min` : ''}`
}

function SortableTrack({
  index,
  onAddToPlaylist,
  onPlaybackToggle,
  onSongSelect,
  onToggleFavorite,
  reorderable,
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
  const playbackLabel = isPlaying ? `Pausar ${song.title}` : `Reproducir ${song.title}`

  function toggleTrackPlayback() {
    if (isSelected) {
      onPlaybackToggle?.()
      return
    }
    onSongSelect(song.id)
  }

  return (
    <li className={className} ref={setNodeRef} style={style}>
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
      {showsTrackArtwork ? (
        <button
          className={`collection-detail__track-artwork collection-detail__track-playback playback-hover${isPlaying ? ' collection-detail__track-playback--playing' : ''}`}
          type="button"
          aria-label={playbackLabel}
          aria-pressed={isPlaying}
          title={playbackLabel}
          onClick={toggleTrackPlayback}
        >
          <img src={song.artwork} alt="" loading="lazy" />
          <span className="collection-detail__track-playback-status" aria-hidden="true">
            <PreviewIndicator status={isPlaying ? 'playing' : null} />
          </span>
        </button>
      ) : (
        <button
          className={`collection-detail__track-index collection-detail__track-playback playback-hover${isPlaying ? ' collection-detail__track-playback--playing' : ''}`}
          type="button"
          aria-label={playbackLabel}
          aria-pressed={isPlaying}
          title={playbackLabel}
          onClick={toggleTrackPlayback}
        >
          <span className="collection-detail__track-number" aria-hidden="true">{index + 1}</span>
          <span className="collection-detail__track-playback-status" aria-hidden="true">
            <PreviewIndicator status={isPlaying ? 'playing' : null} />
          </span>
        </button>
      )}
      <button className="collection-detail__track-main" type="button" onClick={() => onSongSelect(song.id)}>
        <strong>{song.title}</strong>
        <small>{song.artist} · {song.plays}</small>
      </button>
      <span className="collection-detail__track-actions">
        <HeartToggle
          className="heart-container--song-row"
          label={`Me gusta ${song.title}`}
          liked={isLiked}
          onToggle={() => onToggleFavorite?.(song.id)}
          removeLabel={`Quitar ${song.title} de favoritas`}
          size={17}
        />
        <button className="collection-detail__track-action" type="button" aria-label={`Añadir ${song.title} a una playlist`} title="Añadir a playlist" onClick={() => onAddToPlaylist?.(song)}>
          <ListPlus size={17} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </span>
      <time>{formatDuration(song.durationSeconds)}</time>
    </li>
  )
}

function CollectionDetailView({
  collection,
  likedSongIds,
  onAddToPlaylist,
  onBack,
  onEdit,
  onMoveSong,
  onPlaybackToggle,
  onSongSelect,
  onToggleFavorite,
  onTogglePinned,
  selectedSongId,
  selectedSongPlaying,
  songs,
}) {
  const [albumSaved, setAlbumSaved] = useState(false)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const totalSeconds = songs.reduce((total, song) => total + song.durationSeconds, 0)
  const pageStyle = collection.artwork ? { '--collection-artwork': `url("${collection.artwork}")` } : undefined
  const showsTrackArtwork = collection.kind === 'Playlist'
  const selectedSongBelongsToCollection = songs.some((song) => song.id === selectedSongId)
  const collectionIsPlaying = selectedSongBelongsToCollection && selectedSongPlaying
  const collectionIsSaved = onTogglePinned ? Boolean(collection.pinned) : albumSaved

  function toggleCollectionPlayback() {
    if (!songs.length) return
    if (selectedSongBelongsToCollection) {
      onPlaybackToggle?.()
      return
    }
    onSongSelect(songs[0].id)
  }

  function toggleSaved() {
    if (onTogglePinned) {
      onTogglePinned()
      return
    }
    setAlbumSaved((saved) => !saved)
  }

  function downloadCollection() {
    const downloadableSongs = songs.filter((song) => song.audioUrl)
    if (!downloadableSongs.length) return

    const playlistLines = downloadableSongs.flatMap((song) => [
      `#EXTINF:${song.durationSeconds},${song.artist} - ${song.title}`,
      new URL(song.audioUrl, window.location.href).href,
    ])
    const blob = new Blob([`#EXTM3U\n${playlistLines.join('\n')}\n`], { type: 'audio/x-mpegurl' })
    const downloadUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const fileName = collection.title
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')

    link.href = downloadUrl
    link.download = `${fileName || 'coleccion'}.m3u`
    link.click()
    URL.revokeObjectURL(downloadUrl)
  }

  async function shareCollection() {
    const shareData = {
      title: collection.title,
      text: `${collection.title} · ${collection.artist}`,
      url: window.location.href,
    }

    if (navigator.share) {
      try {
        await navigator.share(shareData)
      } catch {
        // Closing the native share sheet does not require any follow-up.
      }
      return
    }

    await navigator.clipboard?.writeText(shareData.url)
  }

  function finishSongDrag({ active, over }) {
    if (over && active.id !== over.id) onMoveSong?.(active.id, over.id)
  }

  return (
    <section className={`collection-detail${showsTrackArtwork ? ' collection-detail--playlist' : ''}`} style={pageStyle} aria-labelledby="collection-detail-title">
      <div className="collection-detail__ambient" aria-hidden="true" />
      {onBack && (
        <button className="collection-detail__back" type="button" aria-label="Volver al apartado anterior" title="Volver" onClick={onBack}>
          <ArrowLeft size={21} strokeWidth={1.9} aria-hidden="true" />
        </button>
      )}
      <aside className="collection-detail__summary">
        <span className="collection-detail__creator">
          {collection.artwork && <img src={collection.artwork} alt="" />}
          <span>{collection.artist}</span>
        </span>
        {collection.artwork ? (
          <img className="collection-detail__artwork" src={collection.artwork} alt="" />
        ) : (
          <div className="collection-detail__artwork collection-detail__artwork--empty" aria-hidden="true" />
        )}
        <div className="collection-detail__identity">
          <h1 id="collection-detail-title">{collection.title}</h1>
          {collection.description && <p>{collection.description}</p>}
          <span>{collection.kind}{collection.year ? ` · ${collection.year}` : ''}</span>
          <span>{songs.length} canciones · {formatCollectionLength(totalSeconds)}</span>
        </div>
        <div className="collection-detail__controls">
          <button className="collection-detail__control" type="button" disabled={!songs.some((song) => song.audioUrl)} aria-label={`Descargar ${collection.title}`} title="Descargar" onClick={downloadCollection}>
            <Download size={22} strokeWidth={1.8} aria-hidden="true" />
          </button>
          <button
            className={`collection-detail__control${collectionIsSaved ? ' collection-detail__control--active' : ''}`}
            type="button"
            aria-label={collectionIsSaved ? `Quitar ${collection.title} de tu biblioteca` : `Guardar ${collection.title}`}
            aria-pressed={collectionIsSaved}
            title={collectionIsSaved ? 'Quitar de tu biblioteca' : 'Guardar'}
            onClick={toggleSaved}
          >
            <Bookmark size={20} fill={collectionIsSaved ? 'currentColor' : 'none'} strokeWidth={1.8} aria-hidden="true" />
          </button>
          <button className="collection-detail__play" type="button" disabled={!songs.length} aria-label={collectionIsPlaying ? `Pausar ${collection.title}` : `Reproducir ${collection.title}`} title={collectionIsPlaying ? 'Pausar' : 'Reproducir'} onClick={toggleCollectionPlayback}>
            {collectionIsPlaying ? <Pause size={31} fill="currentColor" strokeWidth={1.8} aria-hidden="true" /> : <Play size={31} fill="currentColor" strokeWidth={1.8} aria-hidden="true" />}
          </button>
          <button className="collection-detail__control" type="button" aria-label={`Compartir ${collection.title}`} title="Compartir" onClick={shareCollection}>
            <Share2 size={22} strokeWidth={1.8} aria-hidden="true" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="collection-detail__control" type="button" aria-label={`Más opciones de ${collection.title}`} title="Más opciones">
                <MoreHorizontal size={23} strokeWidth={1.9} aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="collection-detail__menu min-w-52" align="end" collisionPadding={12} sideOffset={7}>
              {onEdit && (
                <DropdownMenuItem className="collection-detail__menu-item" onSelect={onEdit}>
                  <Pencil aria-hidden="true" />
                  <span>Cambiar nombre o portada</span>
                </DropdownMenuItem>
              )}
              {onTogglePinned && (
                <DropdownMenuItem className="collection-detail__menu-item" onSelect={onTogglePinned}>
                  {collection.pinned ? <PinOff aria-hidden="true" /> : <Pin aria-hidden="true" />}
                  <span>{collection.pinned ? 'Desfijar playlist' : 'Fijar playlist'}</span>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem className="collection-detail__menu-item" onSelect={shareCollection}>
                <Share2 aria-hidden="true" />
                <span>Compartir</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      <div className="collection-detail__tracks">
        {songs.length > 0 ? (
          <DndContext
            collisionDetection={closestCenter}
            modifiers={dragModifiers}
            sensors={sensors}
            onDragEnd={finishSongDrag}
          >
            <SortableContext items={songs.map((song) => song.id)} strategy={verticalListSortingStrategy}>
              <ol className="collection-detail__track-list">
                {songs.map((song, index) => {
                  const isSelected = selectedSongId === song.id

                  return (
                    <SortableTrack
                      index={index}
                      key={song.id}
                      onAddToPlaylist={onAddToPlaylist}
                      onPlaybackToggle={onPlaybackToggle}
                      onSongSelect={onSongSelect}
                      onToggleFavorite={onToggleFavorite}
                      reorderable={Boolean(onMoveSong)}
                      song={song}
                      status={{
                        isLiked: likedSongIds?.has(song.id),
                        isPlaying: isSelected && selectedSongPlaying,
                        isSelected,
                      }}
                      variant={showsTrackArtwork ? 'playlist' : 'album'}
                    />
                  )
                })}
              </ol>
            </SortableContext>
          </DndContext>
        ) : (
          <div className="collection-detail__empty">
            <ListPlus size={25} strokeWidth={1.6} aria-hidden="true" />
            <strong>Todavía no hay canciones</strong>
            <span>Añade canciones para comenzar esta selección.</span>
          </div>
        )}
      </div>
    </section>
  )
}

export default CollectionDetailView
