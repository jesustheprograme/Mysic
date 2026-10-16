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
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Download,
  ListPlus,
  MoreHorizontal,
  Pause,
  Pencil,
  Pin,
  PinOff,
  Play,
  Share2,
  Trash2,
} from 'lucide-react'
import HeartToggle from '../../components/HeartToggle.jsx'
import { groupTracksByDisc } from '../../lib/tracks.js'
import FilaCancionOrdenable from './componentes/FilaCancionOrdenable.jsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu.jsx'

const dragModifiers = [restrictToFirstScrollableAncestor, restrictToVerticalAxis]

function formatCollectionLength(seconds) {
  const minutes = Math.max(1, Math.round(seconds / 60))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours} h${remainingMinutes ? ` ${remainingMinutes} min` : ''}`
}

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
  const tracksRef = useRef(null)
  const activeTrackRef = useRef(null)
  const activeTrackArrowRef = useRef(null)
  const activeTrackNaturalTopRef = useRef(0)
  const suppressActiveTrackArrowRef = useRef(false)
  const [activeTrackDirection, setActiveTrackDirection] = useState(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const totalSeconds = songs.reduce((total, song) => total + song.durationSeconds, 0)
  const pageStyle = collection.artwork ? { '--collection-artwork': `url("${collection.artwork}")` } : undefined
  const showsTrackArtwork = collection.kind === 'Playlist'
  const selectedSongBelongsToCollection = songs.some((song) => (
    song.id === selectedSongId && (!selectedSongAlbumId || song.albumId === selectedSongAlbumId)
  ))
  const collectionIsPlaying = selectedSongBelongsToCollection && selectedSongPlaying
  const collectionIsSaved = onTogglePinned ? Boolean(collection.pinned) : collectionFavorite
  const trackGroups = collection.kind === 'Álbum'
    ? groupTracksByDisc(songs)
    : [{ discNumber: 1, tracks: songs }]
  const showsDiscHeadings = collection.kind === 'Álbum' && trackGroups.length > 1
  const albumTrackNumbers = new Map(
    trackGroups.flatMap((group) => group.tracks).map((song, index) => [song.id, index + 1]),
  )
  const selectedSongIndex = songs.findIndex((song) => (
    song.id === selectedSongId && (!selectedSongAlbumId || song.albumId === selectedSongAlbumId)
  ))
  const selectedSong = selectedSongIndex >= 0 ? songs[selectedSongIndex] : null

  useEffect(() => {
    suppressActiveTrackArrowRef.current = false
  }, [selectedSongId, selectedSongAlbumId])

  useEffect(() => {
    const tracks = tracksRef.current
    const activeTrack = activeTrackRef.current
    if (!tracks || !activeTrack || !selectedSongBelongsToCollection) {
      setActiveTrackDirection(null)
      return undefined
    }

    let frameId = 0
    const updatePosition = () => {
      cancelAnimationFrame(frameId)
      frameId = requestAnimationFrame(() => {
        const tracksBounds = tracks.getBoundingClientRect()
        let naturalTop = activeTrack.offsetTop
        let ancestor = activeTrack.offsetParent
        while (ancestor && ancestor !== tracks) {
          naturalTop += ancestor.offsetTop
          ancestor = ancestor.offsetParent
        }
        activeTrackNaturalTopRef.current = naturalTop

        const naturalViewportTop = tracksBounds.top + naturalTop - tracks.scrollTop
        const naturalViewportBottom = naturalViewportTop + activeTrack.offsetHeight
        const nextDirection = suppressActiveTrackArrowRef.current
          ? null
          : naturalViewportBottom < tracksBounds.top
            ? 'up'
            : naturalViewportTop > tracksBounds.bottom
              ? 'down'
              : null
        const arrowTop = nextDirection === 'up'
          ? tracksBounds.top + (activeTrack.offsetHeight / 2)
          : tracksBounds.bottom - (activeTrack.offsetHeight / 2)

        if (activeTrackArrowRef.current) {
          activeTrackArrowRef.current.style.left = `${tracksBounds.left - 42}px`
          activeTrackArrowRef.current.style.top = `${arrowTop}px`
        }
        setActiveTrackDirection((currentDirection) => (
          currentDirection === nextDirection ? currentDirection : nextDirection
        ))
      })
    }

    const restoreArrowOnUserScroll = () => {
      if (!suppressActiveTrackArrowRef.current) return
      suppressActiveTrackArrowRef.current = false
      updatePosition()
    }
    const restoreArrowOnKeyboardScroll = (event) => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) {
        restoreArrowOnUserScroll()
      }
    }

    updatePosition()
    tracks.addEventListener('scroll', updatePosition, { passive: true })
    tracks.addEventListener('wheel', restoreArrowOnUserScroll, { passive: true })
    tracks.addEventListener('touchstart', restoreArrowOnUserScroll, { passive: true })
    tracks.addEventListener('pointerdown', restoreArrowOnUserScroll)
    const resizeObserver = new ResizeObserver(updatePosition)
    resizeObserver.observe(tracks)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('keydown', restoreArrowOnKeyboardScroll)

    return () => {
      cancelAnimationFrame(frameId)
      tracks.removeEventListener('scroll', updatePosition)
      tracks.removeEventListener('wheel', restoreArrowOnUserScroll)
      tracks.removeEventListener('touchstart', restoreArrowOnUserScroll)
      tracks.removeEventListener('pointerdown', restoreArrowOnUserScroll)
      resizeObserver.disconnect()
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('keydown', restoreArrowOnKeyboardScroll)
    }
  }, [selectedSongBelongsToCollection, selectedSongId, selectedSongAlbumId, songs])

  function scrollToActiveTrack() {
    const tracks = tracksRef.current
    const activeTrack = activeTrackRef.current
    if (!tracks || !activeTrack) return
    suppressActiveTrackArrowRef.current = true
    setActiveTrackDirection(null)
    tracks.scrollTo({
      behavior: 'smooth',
      top: activeTrackNaturalTopRef.current - ((tracks.clientHeight - activeTrack.offsetHeight) / 2),
    })
  }

  function toggleCollectionPlayback() {
    if (!songs.length) return
    if (selectedSongBelongsToCollection) {
      onPlaybackToggle?.()
      return
    }
    onSongSelect(songs[0].id, { contextSong: songs[0], contextSongs: songs })
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

  function renderTrack(song, index) {
    const isSelected = selectedSongId === song.id
      && (!selectedSongAlbumId || selectedSongAlbumId === song.albumId)

    return (
      <FilaCancionOrdenable
        displayTrackNumber={showsDiscHeadings ? albumTrackNumbers.get(song.id) : null}
        index={index}
        key={song.id}
        onAddToPlaylist={onAddToPlaylist}
        onAlbumSelect={onAlbumSelect}
        onArtistSelect={onArtistSelect}
        onPlaybackToggle={onPlaybackToggle}
        onSongSelect={(songId) => onSongSelect(songId, { contextSong: song, contextSongs: songs })}
        onToggleFavorite={onToggleFavorite}
        nodeRef={isSelected ? activeTrackRef : null}
        reorderable={Boolean(onMoveSong)}
        renderTrackActions={renderTrackActions}
        song={song}
        status={{
          isLiked: likedSongIds?.has(song.id),
          isPlaying: isSelected && selectedSongPlaying,
          isSelected,
        }}
        variant={showsTrackArtwork ? 'playlist' : 'album'}
      />
    )
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
        {collection.artistId && onArtistSelect ? (
          <button
            className="collection-detail__creator collection-detail__creator--link"
            type="button"
            aria-label={`Abrir artista ${collection.artist}`}
            onClick={() => onArtistSelect(collection.artistId)}
          >
            {(collection.artistArtwork ?? collection.artwork) && <img src={collection.artistArtwork ?? collection.artwork} alt="" />}
            <span>{collection.artist}</span>
          </button>
        ) : (
          <span className="collection-detail__creator">
            {(collection.artistArtwork ?? collection.artwork) && <img src={collection.artistArtwork ?? collection.artwork} alt="" />}
            <span>{collection.artist}</span>
          </span>
        )}
        {collection.artwork ? (
          <img className="collection-detail__artwork" src={collection.artwork} alt="" />
        ) : (
          <div className="collection-detail__artwork collection-detail__artwork--empty" aria-hidden="true" />
        )}
        <div className="collection-detail__identity">
          <h1 id="collection-detail-title">{collection.title}</h1>
          {!showsTrackArtwork && collection.description && <p>{collection.description}</p>}
          {showsTrackArtwork ? (
            <span>{collection.kind} · {songs.length} canciones · {formatCollectionLength(totalSeconds)}</span>
          ) : (
            <>
              <span>{collection.kind}{collection.year ? ` · ${collection.year}` : ''}</span>
              <span>{songs.length} canciones · {formatCollectionLength(totalSeconds)}</span>
            </>
          )}
        </div>
        <div className="collection-detail__controls">
          <button className="collection-detail__control" type="button" disabled={!onDownloadCollection && !songs.some((song) => song.audioUrl)} aria-label={`Descargar ${collection.title}`} title="Descargar" onClick={onDownloadCollection ?? downloadCollection}>
            <Download size={22} strokeWidth={1.8} aria-hidden="true" />
          </button>
          {onTogglePinned ? (
            <HeartToggle
              className={`collection-detail__control${collectionIsSaved ? ' collection-detail__control--active' : ''}`}
              label={`Guardar ${collection.title}`}
              liked={collectionIsSaved}
              onToggle={onTogglePinned}
              removeLabel={`Quitar ${collection.title} de tu biblioteca`}
              size={20}
            />
          ) : onToggleCollectionFavorite ? (
            <HeartToggle
              className={`collection-detail__control${collectionIsSaved ? ' collection-detail__control--active' : ''}`}
              label={`Añadir ${collection.title} a álbumes favoritos`}
              liked={collectionIsSaved}
              onToggle={onToggleCollectionFavorite}
              removeLabel={`Quitar ${collection.title} de álbumes favoritos`}
              size={20}
            />
          ) : null}
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
              {onDelete && (
                <DropdownMenuItem className="collection-detail__menu-item collection-detail__menu-item--danger" onSelect={onDelete}>
                  <Trash2 aria-hidden="true" />
                  <span>Eliminar playlist</span>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {showsTrackArtwork && collection.description && (
          <p className="collection-detail__description">{collection.description}</p>
        )}
      </aside>

      <div className="collection-detail__tracks" ref={tracksRef}>
        {songs.length > 0 ? (
          <DndContext
            collisionDetection={closestCenter}
            modifiers={dragModifiers}
            sensors={sensors}
            onDragEnd={finishSongDrag}
          >
            <SortableContext items={songs.map((song) => song.id)} strategy={verticalListSortingStrategy}>
              <ol className="collection-detail__track-list">
                {collection.kind === 'Álbum'
                  ? trackGroups.map((group) => (
                      <li className="collection-detail__disc" key={group.discNumber}>
                        {showsDiscHeadings && <h2>Disco {group.discNumber}</h2>}
                        <ol className="collection-detail__disc-tracks">
                          {group.tracks.map(renderTrack)}
                        </ol>
                      </li>
                    ))
                  : songs.map(renderTrack)}
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
      {selectedSong && createPortal(
        <button
          className={`collection-detail__active-track-arrow${activeTrackDirection ? ' collection-detail__active-track-arrow--visible' : ''}`}
          type="button"
          aria-label="Ir a la posición de la canción seleccionada"
          title="Ir a la canción seleccionada"
          ref={activeTrackArrowRef}
          onClick={scrollToActiveTrack}
        >
          {activeTrackDirection === 'down'
            ? <ArrowDown size={21} strokeWidth={2.2} aria-hidden="true" />
            : <ArrowUp size={21} strokeWidth={2.2} aria-hidden="true" />}
        </button>,
        document.body,
      )}
    </section>
  )
}

export default CollectionDetailView
