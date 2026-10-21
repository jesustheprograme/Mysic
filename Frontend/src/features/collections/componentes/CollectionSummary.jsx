import { Download, MoreHorizontal, Pause, Pencil, Pin, PinOff, Play, Share2, Trash2 } from 'lucide-react'
import HeartToggle from '../../../components/HeartToggle.jsx'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../../components/ui/dropdown-menu.jsx'

function formatCollectionLength(seconds) {
  const minutes = Math.max(1, Math.round(seconds / 60))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remaining = minutes % 60
  return `${hours} h${remaining ? ` ${remaining} min` : ''}`
}

function CollectionCreator({ collection }) {
  const artwork = collection.artistArtwork ?? collection.artwork
  const content = <>{artwork && <img src={artwork} alt="" />}<span>{collection.artist}</span></>
  if (!collection.onArtistSelect) return <span className="collection-detail__creator">{content}</span>
  return <button className="collection-detail__creator collection-detail__creator--link" type="button" aria-label={`Abrir artista ${collection.artist}`} onClick={collection.onArtistSelect}>{content}</button>
}

function CollectionIdentity({ collection, showsTrackArtwork, songCount, totalSeconds }) {
  const length = formatCollectionLength(totalSeconds)
  return (
    <div className="collection-detail__identity">
      <h1 id="collection-detail-title">{collection.title}</h1>
      {!showsTrackArtwork && collection.description && <p>{collection.description}</p>}
      {showsTrackArtwork
        ? <span>{collection.kind} · {songCount} canciones · {length}</span>
        : <><span>{collection.kind}{collection.year ? ` · ${collection.year}` : ''}</span><span>{songCount} canciones · {length}</span></>}
    </div>
  )
}

function SavedToggle({ collection, collectionIsSaved, onToggleCollectionFavorite, onTogglePinned }) {
  if (onTogglePinned) return <HeartToggle className={`collection-detail__control${collectionIsSaved ? ' collection-detail__control--active' : ''}`} label={`Guardar ${collection.title}`} liked={collectionIsSaved} onToggle={onTogglePinned} removeLabel={`Quitar ${collection.title} de tu biblioteca`} size={20} />
  if (onToggleCollectionFavorite) return <HeartToggle className={`collection-detail__control${collectionIsSaved ? ' collection-detail__control--active' : ''}`} label={`Añadir ${collection.title} a álbumes favoritos`} liked={collectionIsSaved} onToggle={onToggleCollectionFavorite} removeLabel={`Quitar ${collection.title} de álbumes favoritos`} size={20} />
  return null
}

function CollectionControls({ canDownload, collection, collectionIsPlaying, collectionIsSaved, hasSongs, onDelete, onDownloadCollection, onEdit, onShare, onToggleCollectionFavorite, onTogglePinned, onTogglePlayback }) {
  const playbackLabel = collectionIsPlaying ? 'Pausar' : 'Reproducir'
  const PlaybackIcon = collectionIsPlaying ? Pause : Play
  return (
    <div className="collection-detail__controls">
      <button className="collection-detail__control" type="button" disabled={!canDownload} aria-label={`Descargar ${collection.title}`} title="Descargar" onClick={onDownloadCollection}><Download size={22} strokeWidth={1.8} aria-hidden="true" /></button>
      <SavedToggle collection={collection} collectionIsSaved={collectionIsSaved} onToggleCollectionFavorite={onToggleCollectionFavorite} onTogglePinned={onTogglePinned} />
      <button className="collection-detail__play" type="button" disabled={!hasSongs} aria-label={`${playbackLabel} ${collection.title}`} title={playbackLabel} onClick={onTogglePlayback}><PlaybackIcon size={31} fill="currentColor" strokeWidth={1.8} aria-hidden="true" /></button>
      <button className="collection-detail__control" type="button" aria-label={`Compartir ${collection.title}`} title="Compartir" onClick={onShare}><Share2 size={22} strokeWidth={1.8} aria-hidden="true" /></button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><button className="collection-detail__control" type="button" aria-label={`Más opciones de ${collection.title}`} title="Más opciones"><MoreHorizontal size={23} strokeWidth={1.9} aria-hidden="true" /></button></DropdownMenuTrigger>
        <DropdownMenuContent className="collection-detail__menu min-w-52" align="end" collisionPadding={12} sideOffset={7}>
          {onEdit && <DropdownMenuItem className="collection-detail__menu-item" onSelect={onEdit}><Pencil aria-hidden="true" /><span>Cambiar nombre o portada</span></DropdownMenuItem>}
          {onTogglePinned && <DropdownMenuItem className="collection-detail__menu-item" onSelect={onTogglePinned}>{collection.pinned ? <PinOff aria-hidden="true" /> : <Pin aria-hidden="true" />}<span>{collection.pinned ? 'Desfijar playlist' : 'Fijar playlist'}</span></DropdownMenuItem>}
          <DropdownMenuItem className="collection-detail__menu-item" onSelect={onShare}><Share2 aria-hidden="true" /><span>Compartir</span></DropdownMenuItem>
          {onDelete && <DropdownMenuItem className="collection-detail__menu-item collection-detail__menu-item--danger" onSelect={onDelete}><Trash2 aria-hidden="true" /><span>Eliminar playlist</span></DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export default function CollectionSummary({
  canDownload, collection, collectionIsPlaying, collectionIsSaved, onDelete, onDownloadCollection, onEdit,
  onShare, onToggleCollectionFavorite, onTogglePinned, onTogglePlayback, showsTrackArtwork, songs,
}) {
  const totalSeconds = songs.reduce((total, song) => total + song.durationSeconds, 0)

  return (
    <aside className="collection-detail__summary">
      <CollectionCreator collection={collection} />
      {collection.artwork
        ? <img className="collection-detail__artwork" src={collection.artwork} alt="" />
        : <div className="collection-detail__artwork collection-detail__artwork--empty" aria-hidden="true" />}
      <CollectionIdentity collection={collection} showsTrackArtwork={showsTrackArtwork} songCount={songs.length} totalSeconds={totalSeconds} />
      <CollectionControls canDownload={canDownload} collection={collection} collectionIsPlaying={collectionIsPlaying} collectionIsSaved={collectionIsSaved} hasSongs={songs.length > 0} onDelete={onDelete} onDownloadCollection={onDownloadCollection} onEdit={onEdit} onShare={onShare} onToggleCollectionFavorite={onToggleCollectionFavorite} onTogglePinned={onTogglePinned} onTogglePlayback={onTogglePlayback} />
      {showsTrackArtwork && collection.description && <p className="collection-detail__description">{collection.description}</p>}
    </aside>
  )
}
