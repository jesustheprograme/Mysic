import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { restrictToFirstScrollableAncestor, restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { ListPlus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import useWindowedRows, { findScrollParent } from '../hooks/useWindowedRows.js'
import { shouldWindow } from '../hooks/windowMath.js'
import FilaCancionOrdenable from './FilaCancionOrdenable.jsx'

const dragModifiers = [restrictToFirstScrollableAncestor, restrictToVerticalAxis]

export default function CollectionTrackList({
  activeTrackRef, albumTrackNumbers, likedSongIds, metricsRef, onAddToPlaylist, onAlbumSelect, onArtistSelect,
  onMoveSong, onPlaybackToggle, onSongSelect, onToggleFavorite, renderTrackActions, selectedSongAlbumId,
  selectedSongId, selectedSongPlaying, selectedSongSource, showsDiscHeadings, showsTrackArtwork, songs, trackGroups, tracksRef,
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const listRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  // Listas largas: solo se montan las filas visibles (más un margen). Las cortas y las de álbumes
  // con varios discos se renderizan completas, como siempre.
  const windowed = shouldWindow({ count: songs.length, hasDiscHeadings: showsDiscHeadings })
  const rows = useWindowedRows({ count: songs.length, enabled: windowed, frozen: dragging, listRef })
  const visibleSongs = rows.isWindowed ? songs.slice(rows.start, rows.end) : songs

  const isSelected = (song) => {
    const songSource = song.source === 'youtube' ? 'youtube' : 'local'
    return selectedSongId === song.id
      && (!selectedSongSource || selectedSongSource === songSource)
      && (!selectedSongAlbumId || selectedSongAlbumId === song.albumId)
  }
  const activeIndex = rows.isWindowed ? songs.findIndex(isSelected) : -1

  // La flecha "ir a la canción activa" no puede apoyarse en el nodo de la fila si esta no está montada:
  // en modo ventana calcula su posición con el índice y la altura de fila medida.
  useEffect(() => {
    if (!metricsRef) return undefined
    metricsRef.current = rows.isWindowed
      ? { activeIndex, list: () => listRef.current, pitch: rows.pitch, scroller: () => findScrollParent(listRef.current) }
      : null
    return () => { metricsRef.current = null }
  })

  function renderTrack(song, index) {
    const trackKey = song.trackKey ?? song.id
    const selected = isSelected(song)
    return (
      <FilaCancionOrdenable
        displayTrackNumber={showsDiscHeadings ? albumTrackNumbers.get(song.id) : null}
        index={index}
        key={trackKey}
        onAddToPlaylist={onAddToPlaylist}
        onAlbumSelect={onAlbumSelect}
        onArtistSelect={onArtistSelect}
        onPlaybackToggle={onPlaybackToggle}
        onSongSelect={(songId) => onSongSelect(songId, { contextSong: song, contextSongs: songs })}
        onToggleFavorite={onToggleFavorite}
        nodeRef={selected ? activeTrackRef : null}
        reorderable={Boolean(onMoveSong)}
        renderTrackActions={renderTrackActions}
        song={song}
        status={{ isLiked: likedSongIds?.has(song.id), isPlaying: selected && selectedSongPlaying, isSelected: selected }}
        variant={showsTrackArtwork ? 'playlist' : 'album'}
      />
    )
  }

  const content = trackGroups.flatMap((group) => group.tracks).length > 0 ? (
    <DndContext
      collisionDetection={closestCenter}
      modifiers={dragModifiers}
      sensors={sensors}
      onDragStart={() => setDragging(true)}
      onDragCancel={() => setDragging(false)}
      onDragEnd={({ active, over }) => {
        setDragging(false)
        if (over && active.id !== over.id) onMoveSong?.(active.id, over.id)
      }}
    >
      <SortableContext items={songs.map((song) => song.trackKey ?? song.id)} strategy={verticalListSortingStrategy}>
        <ol
          className="collection-detail__track-list"
          ref={listRef}
          style={rows.isWindowed ? { paddingTop: rows.paddingTop, paddingBottom: rows.paddingBottom } : undefined}
        >
          {showsDiscHeadings
            ? trackGroups.map((group) => <li className="collection-detail__disc" key={group.discNumber}><h2>Disco {group.discNumber}</h2><ol className="collection-detail__disc-tracks">{group.tracks.map(renderTrack)}</ol></li>)
            : visibleSongs.map((song, offset) => renderTrack(song, rows.start + offset))}
        </ol>
      </SortableContext>
    </DndContext>
  ) : (
    <div className="collection-detail__empty"><ListPlus size={25} strokeWidth={1.6} aria-hidden="true" /><strong>Todavía no hay canciones</strong><span>Añade canciones para comenzar esta selección.</span></div>
  )

  return <div className="collection-detail__tracks" ref={tracksRef}>{content}</div>
}
