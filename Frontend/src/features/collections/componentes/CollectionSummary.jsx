import { Bookmark, BookmarkCheck, Download, MoreHorizontal, Pause, Pencil, Pin, PinOff, Play, Share2, Shuffle, Trash2 } from 'lucide-react'
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
  const content = <>{artwork && <img loading="lazy" decoding="async" src={artwork} alt="" />}<span>{collection.artist}</span></>
  if (!collection.onArtistSelect) return <span className="collection-detail__creator">{content}</span>
  return <button className="collection-detail__creator collection-detail__creator--link" type="button" aria-label={`Abrir artista ${collection.artist}`} onClick={collection.onArtistSelect}>{content}</button>
}

// Cabecera como la de limusic: etiqueta de tipo y año, título grande y una línea con el artista,
// el número de canciones y la duración.
function CollectionIdentity({ collection, showsTrackArtwork, songCount, totalSeconds }) {
  const length = formatCollectionLength(totalSeconds)
  const kind = showsTrackArtwork ? collection.kind : `${collection.kind}${collection.year ? ` · ${collection.year}` : ''}`
  return (
    <div className="collection-detail__identity">
      <span className="collection-detail__kind">{kind}</span>
      <h1 id="collection-detail-title">{collection.title}</h1>
      {!showsTrackArtwork && collection.description && <p>{collection.description}</p>}
      <div className="collection-detail__meta">
        <CollectionCreator collection={collection} />
        <span className="collection-detail__count">{songCount} canciones · {length}</span>
      </div>
    </div>
  )
}

// "Añadir a la biblioteca" (álbumes) o "Fijar" (playlists propias): un único botón con texto.
function SavedButton({ collection, collectionIsSaved, onToggleCollectionFavorite, onTogglePinned }) {
  const toggle = onTogglePinned ?? onToggleCollectionFavorite
  if (!toggle) return null
  const pinned = Boolean(onTogglePinned)
  const label = pinned
    ? (collectionIsSaved ? 'Fijada' : 'Fijar')
    : (collectionIsSaved ? 'En la biblioteca' : 'Añadir a la biblioteca')
  const Icon = collectionIsSaved ? BookmarkCheck : Bookmark
  return (
    <button className={`collection-detail__pill collection-detail__pill--outline${collectionIsSaved ? ' collection-detail__pill--saved' : ''}`} type="button" aria-pressed={collectionIsSaved} aria-label={`${label}: ${collection.title}`} title={label} onClick={() => toggle(!collectionIsSaved)}>
      <Icon size={17} strokeWidth={1.9} aria-hidden="true" />
      <span>{label}</span>
    </button>
  )
}

function CollectionControls({ canDownload, collection, collectionIsPlaying, collectionIsSaved, hasSongs, onDelete, onDownloadCollection, onEdit, onShare, onShuffle, onToggleCollectionFavorite, onTogglePinned, onTogglePlayback }) {
  const playbackLabel = collectionIsPlaying ? 'Pausar' : 'Reproducir'
  const PlaybackIcon = collectionIsPlaying ? Pause : Play
  return (
    <div className="collection-detail__controls">
      <button className="collection-detail__pill collection-detail__pill--primary" type="button" disabled={!hasSongs} aria-label={`${playbackLabel} ${collection.title}`} onClick={onTogglePlayback}>
        <PlaybackIcon size={18} fill="currentColor" strokeWidth={1.8} aria-hidden="true" />
        <span>{playbackLabel}</span>
      </button>
      <button className="collection-detail__pill collection-detail__pill--outline" type="button" disabled={!hasSongs} aria-label="Reproducción aleatoria" title="Aleatorio" onClick={onShuffle}>
        <Shuffle size={17} strokeWidth={1.9} aria-hidden="true" />
        <span>Aleatorio</span>
      </button>
      <SavedButton collection={collection} collectionIsSaved={collectionIsSaved} onToggleCollectionFavorite={onToggleCollectionFavorite} onTogglePinned={onTogglePinned} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild><button className="collection-detail__control" type="button" aria-label={`Más opciones de ${collection.title}`} title="Más opciones"><MoreHorizontal size={20} strokeWidth={1.9} aria-hidden="true" /></button></DropdownMenuTrigger>
        <DropdownMenuContent className="collection-detail__menu min-w-52" align="start" collisionPadding={12} sideOffset={7}>
          <DropdownMenuItem className="collection-detail__menu-item" disabled={!canDownload} onSelect={onDownloadCollection}><Download aria-hidden="true" /><span>Descargar</span></DropdownMenuItem>
          <DropdownMenuItem className="collection-detail__menu-item" onSelect={onShare}><Share2 aria-hidden="true" /><span>Compartir</span></DropdownMenuItem>
          {onEdit && <DropdownMenuItem className="collection-detail__menu-item" onSelect={onEdit}><Pencil aria-hidden="true" /><span>Cambiar nombre o portada</span></DropdownMenuItem>}
          {onTogglePinned && <DropdownMenuItem className="collection-detail__menu-item" onSelect={onTogglePinned}>{collection.pinned ? <PinOff aria-hidden="true" /> : <Pin aria-hidden="true" />}<span>{collection.pinned ? 'Desfijar playlist' : 'Fijar playlist'}</span></DropdownMenuItem>}
          {onDelete && <DropdownMenuItem className="collection-detail__menu-item collection-detail__menu-item--danger" onSelect={onDelete}><Trash2 aria-hidden="true" /><span>Eliminar playlist</span></DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export default function CollectionSummary({
  canDownload, collection, collectionIsPlaying, collectionIsSaved, onDelete, onDownloadCollection, onEdit,
  onShare, onShuffle, onToggleCollectionFavorite, onTogglePinned, onTogglePlayback, showsTrackArtwork, songs,
}) {
  const totalSeconds = songs.reduce((total, song) => total + song.durationSeconds, 0)

  return (
    <header className="collection-detail__summary">
      {collection.artwork
        ? <img className="collection-detail__artwork" src={collection.artwork} alt="" />
        : <div className="collection-detail__artwork collection-detail__artwork--empty" aria-hidden="true" />}
      <CollectionIdentity collection={collection} showsTrackArtwork={showsTrackArtwork} songCount={songs.length} totalSeconds={totalSeconds} />
      <CollectionControls canDownload={canDownload} collection={collection} collectionIsPlaying={collectionIsPlaying} collectionIsSaved={collectionIsSaved} hasSongs={songs.length > 0} onDelete={onDelete} onDownloadCollection={onDownloadCollection} onEdit={onEdit} onShare={onShare} onShuffle={onShuffle} onToggleCollectionFavorite={onToggleCollectionFavorite} onTogglePinned={onTogglePinned} onTogglePlayback={onTogglePlayback} />
      {showsTrackArtwork && collection.description && <p className="collection-detail__description">{collection.description}</p>}
    </header>
  )
}
