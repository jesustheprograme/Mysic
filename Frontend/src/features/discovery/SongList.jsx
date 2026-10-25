import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ListPlus } from 'lucide-react'
import HeartToggle from '../../components/HeartToggle.jsx'
import PreviewIndicator from '../../components/PreviewIndicator.jsx'
import { getAdjacentArtworkUrls, getVisiblePages } from './paginatedArtwork.js'

const SONGS_PER_PAGE = 15

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

export function SongRow({
  byline = 'artist-and-album',
  index,
  isLiked,
  isSelected,
  likedSongIds,
  onAddToPlaylist,
  onAlbumSelect,
  onArtistSelect,
  onPlaybackToggle,
  onPreviewStart,
  onPreviewStop,
  onSongSelect,
  onToggleFavorite,
  preview,
  renderSongActions,
  selectedSongPlaying,
  showNumber = false,
  song,
}) {
  const artistId = song.artistId ?? song.artists?.[0]?.id
  const albumId = song.albumId ?? song.album?.id ?? song.albumMemberships?.[0]?.id
  const albumTitle = song.albumTitle ?? song.album?.title ?? song.albumMemberships?.[0]?.title
  const selected = isSelected ?? false
  const liked = isLiked ?? likedSongIds?.has(song.id)
  const previewStatus = preview?.itemId === song.id ? preview.status : null
  const indicatorStatus = previewStatus ?? (selected && selectedSongPlaying ? 'playing' : null)
  const showArtist = byline === 'artist-and-album'

  function selectSong() {
    if (previewStatus) onPreviewStop?.()
    if (selected) onPlaybackToggle?.()
    else onSongSelect(song.id)
  }

  return (
    <div className={`song-row${showNumber ? ' song-row--numbered' : ''}${selected ? ' song-row--active' : ''}${selected && selectedSongPlaying ? ' song-row--playing' : ''}${previewStatus ? ` song-row--preview-${previewStatus}` : ''}`}>
      {showNumber && <span className="song-row__number" aria-hidden="true">{index + 1}</span>}
      <div className="song-row__main">
        <button className="song-row__artwork playback-hover" type="button" aria-label={selected && selectedSongPlaying ? `Pausar ${song.title}` : `Reproducir ${song.title}`} aria-pressed={selected && selectedSongPlaying} onClick={selectSong} onPointerEnter={() => { if (!selected) onPreviewStart?.(song) }} onPointerLeave={onPreviewStop}>
          {song.artwork && <img src={song.artwork} alt="" loading="eager" decoding="async" />}
          <span aria-hidden="true"><PreviewIndicator status={indicatorStatus} /></span>
        </button>
        <span className="song-row__copy">
          <button className="song-row__title-link" type="button" title={song.title} onClick={selectSong}>{song.title}</button>
          <span className="song-row__byline">
            {showArtist && <button className="song-row__catalog-link" type="button" disabled={!artistId || !onArtistSelect} onClick={() => onArtistSelect?.(artistId)}>{song.artist}</button>}
            {albumTitle && <>{showArtist && <span className="song-row__separator" aria-hidden="true">·</span>}<button className="song-row__catalog-link song-row__catalog-link--album" type="button" disabled={!albumId || !onAlbumSelect} title={albumTitle} onClick={() => onAlbumSelect?.(albumId)}>{albumTitle}</button></>}
          </span>
        </span>
      </div>
      <span className="song-row__meta">
        <span className="song-row__actions">
          <HeartToggle className="heart-container--song-row" label={`Me gusta ${song.title}`} liked={liked} onToggle={(nextLiked) => onToggleFavorite?.(song.id, nextLiked)} removeLabel={`Quitar ${song.title} de favoritas`} size={16} />
          <button className="song-row__action" type="button" aria-label={`Añadir ${song.title} a una playlist`} title="Añadir a playlist" onClick={(event) => { event.stopPropagation(); onAddToPlaylist?.(song) }}><ListPlus size={16} strokeWidth={1.8} aria-hidden="true" /></button>
          {renderSongActions?.(song)}
        </span>
        <span className="song-row__duration">{formatDuration(song.durationSeconds)}</span>
      </span>
    </div>
  )
}

function SongList({
  emptyMessage = 'No tienes canciones favoritas todavía.',
  hasMore = false,
  headingAction,
  likedSongIds,
  loadingMore = false,
  onAddToPlaylist,
  onAlbumSelect,
  onArtistSelect,
  onLoadMore,
  onPlaybackToggle,
  onPreviewStart,
  onPreviewStop,
  onSongSelect,
  onToggleFavorite,
  preview,
  renderSongActions,
  selectedSongId,
  selectedSongPlaying,
  showNumbers = false,
  songs,
  trailingContent,
  title = 'Canciones',
}) {
  const [page, setPage] = useState(0)
  const [direction, setDirection] = useState('next')
  const pageCount = Math.max(1, Math.ceil(songs.length / SONGS_PER_PAGE))
  const currentPage = Math.min(page, pageCount - 1)
  const requestedArtworkUrls = useRef(new Set())
  const loadingArtwork = useRef(new Map())
  const visiblePages = getVisiblePages(currentPage, pageCount)
  const visibleSongs = useMemo(() => {
    const start = currentPage * SONGS_PER_PAGE
    return songs.slice(start, start + SONGS_PER_PAGE)
  }, [currentPage, songs])

  useEffect(() => {
    for (const url of getAdjacentArtworkUrls(songs, currentPage, SONGS_PER_PAGE, pageCount)) {
      if (requestedArtworkUrls.current.has(url)) continue
      requestedArtworkUrls.current.add(url)

      const image = new Image()
      image.fetchPriority = 'low'
      loadingArtwork.current.set(url, image)
      const release = () => loadingArtwork.current.delete(url)
      image.onload = release
      image.onerror = release
      image.src = url
    }
  }, [currentPage, pageCount, songs])

  function showPage(nextPage, nextDirection) {
    if (pageCount <= 1) return
    const clampedPage = Math.max(0, Math.min(nextPage, pageCount - 1))
    if (clampedPage === currentPage) return
    onPreviewStop()
    setDirection(nextDirection)
    setPage(clampedPage)
  }

  async function showNextPage() {
    if (currentPage < pageCount - 1) {
      showPage(currentPage + 1, 'next')
      return
    }
    if (!hasMore || loadingMore || !onLoadMore) return

    const loaded = await onLoadMore()
    if (!loaded) return
    onPreviewStop()
    setDirection('next')
    setPage(currentPage + 1)
  }

  return (
    <section className="song-section" aria-labelledby="song-list-title">
      <div className="collection-heading">
        <h2 id="song-list-title">{title}</h2>
        {headingAction}
      </div>

      {songs.length > 0 ? (
        <>
          <div className="song-list-frame">
            <div className={`song-list song-list--slide-${direction}`} key={currentPage}>
              {visibleSongs.map((song, index) => (
                <SongRow
                  index={(currentPage * SONGS_PER_PAGE) + index}
                  isSelected={selectedSongId === song.id}
                  key={song.id}
                  likedSongIds={likedSongIds}
                  onAddToPlaylist={onAddToPlaylist}
                  onAlbumSelect={onAlbumSelect}
                  onArtistSelect={onArtistSelect}
                  onPlaybackToggle={onPlaybackToggle}
                  onPreviewStart={onPreviewStart}
                  onPreviewStop={onPreviewStop}
                  onSongSelect={onSongSelect}
                  onToggleFavorite={onToggleFavorite}
                  preview={preview}
                  renderSongActions={renderSongActions}
                  selectedSongPlaying={selectedSongPlaying}
                  showNumber={showNumbers}
                  song={song}
                />
              ))}
              {trailingContent}
            </div>
          </div>

          <nav className="song-pagination" aria-label="Paginas de canciones">
            <button
              className="song-pagination__step"
              type="button"
              aria-label="Canciones anteriores"
              title="Canciones anteriores"
              disabled={currentPage === 0}
              onClick={() => showPage(currentPage - 1, 'previous')}
            >
              <ChevronLeft size={16} strokeWidth={2.4} aria-hidden="true" />
              <span>Anterior</span>
            </button>
            <span className="song-pagination__pages" aria-live="polite">
              {visiblePages.map((pageNumber) => (
                <span className="song-pagination__page-item" key={pageNumber}>
                  <button
                    className={pageNumber === currentPage ? 'song-pagination__page song-pagination__page--active' : 'song-pagination__page'}
                    type="button"
                    aria-current={pageNumber === currentPage ? 'page' : undefined}
                    aria-label={`Pagina ${pageNumber + 1} de canciones`}
                    disabled={pageNumber === currentPage}
                    onClick={() => showPage(pageNumber, pageNumber > currentPage ? 'next' : 'previous')}
                  >
                    {pageNumber + 1}
                  </button>
                </span>
              ))}
            </span>
            <button
              className="song-pagination__step"
              type="button"
              aria-label="Canciones siguientes"
              title="Canciones siguientes"
              disabled={loadingMore || (currentPage >= pageCount - 1 && !hasMore)}
              onClick={showNextPage}
            >
              <span>{loadingMore ? 'Cargando…' : 'Siguiente'}</span>
              <ChevronRight size={16} strokeWidth={2.4} aria-hidden="true" />
            </button>
          </nav>
        </>
      ) : (
        <div className="collection-empty" role="status">{emptyMessage}</div>
      )}
    </section>
  )
}

export default SongList
