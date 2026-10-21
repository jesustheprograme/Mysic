import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { restrictToFirstScrollableAncestor, restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { ListPlus } from 'lucide-react'
import FilaCancionOrdenable from './FilaCancionOrdenable.jsx'

const dragModifiers = [restrictToFirstScrollableAncestor, restrictToVerticalAxis]

export default function CollectionTrackList({
  activeTrackRef, albumTrackNumbers, likedSongIds, onAddToPlaylist, onAlbumSelect, onArtistSelect,
  onMoveSong, onPlaybackToggle, onSongSelect, onToggleFavorite, renderTrackActions, selectedSongAlbumId,
  selectedSongId, selectedSongPlaying, showsDiscHeadings, showsTrackArtwork, songs, trackGroups, tracksRef,
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function renderTrack(song, index) {
    const selected = selectedSongId === song.id && (!selectedSongAlbumId || selectedSongAlbumId === song.albumId)
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
    <DndContext collisionDetection={closestCenter} modifiers={dragModifiers} sensors={sensors} onDragEnd={({ active, over }) => { if (over && active.id !== over.id) onMoveSong?.(active.id, over.id) }}>
      <SortableContext items={songs.map((song) => song.id)} strategy={verticalListSortingStrategy}>
        <ol className="collection-detail__track-list">
          {showsDiscHeadings
            ? trackGroups.map((group) => <li className="collection-detail__disc" key={group.discNumber}><h2>Disco {group.discNumber}</h2><ol className="collection-detail__disc-tracks">{group.tracks.map(renderTrack)}</ol></li>)
            : songs.map(renderTrack)}
        </ol>
      </SortableContext>
    </DndContext>
  ) : (
    <div className="collection-detail__empty"><ListPlus size={25} strokeWidth={1.6} aria-hidden="true" /><strong>Todavía no hay canciones</strong><span>Añade canciones para comenzar esta selección.</span></div>
  )

  return <div className="collection-detail__tracks" ref={tracksRef}>{content}</div>
}
