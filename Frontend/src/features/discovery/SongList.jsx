import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ListPlus } from 'lucide-react'
import HeartToggle from '../../components/HeartToggle.jsx'
import PreviewIndicator from '../../components/PreviewIndicator.jsx'
import { getAdjacentArtworkUrls, getVisiblePages } from './paginatedArtwork.js'

const SONGS_PER_PAGE = 15
const MAX_VISIBLE_PAGES = 10

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

function SongList({
  emptyMessage = 'No tienes canciones favoritas todavía.',
  headingAction,
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
  selectedSongId,
  selectedSongPlaying,
  songs,
  title = 'Canciones',
}) {
  const [page, setPage] = useState(0)
  const [direction, setDirection] = useState('next')
  const pageCount = Math.max(1, Math.min(MAX_VISIBLE_PAGES, Math.ceil(songs.length / SONGS_PER_PAGE)))
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

  return (
    <section className="song-section" aria-labelledby="song-list-title">
      <div className="collection-heading">
        <h2 id="song-list-title">{title}</h2>
        {headingAction ?? <span>{String(songs.length).padStart(2, '0')}</span>}
      </div>

      {songs.length > 0 ? (
        <>
          <div className="song-list-frame">
            <div className={`song-list song-list--slide-${direction}`} key={currentPage}>
              {visibleSongs.map((song) => {
                const isSelected = selectedSongId === song.id
                const isLiked = likedSongIds?.has(song.id)
                const previewStatus = preview?.itemId === song.id ? preview.status : null
                const indicatorStatus = previewStatus ?? (isSelected && selectedSongPlaying ? 'playing' : null)

                return (
                  <div
                    className={`song-row${isSelected ? ' song-row--active' : ''}${isSelected && selectedSongPlaying ? ' song-row--playing' : ''}${previewStatus ? ` song-row--preview-${previewStatus}` : ''}`}
                    key={song.id}
                  >
                    <div className="song-row__main">
                      <button
                        className="song-row__artwork playback-hover"
                        type="button"
                        aria-label={isSelected && selectedSongPlaying ? `Pausar ${song.title}` : `Reproducir ${song.title}`}
                        aria-pressed={isSelected && selectedSongPlaying}
                        onClick={() => {
                          if (previewStatus) onPreviewStop()
                          if (isSelected) onPlaybackToggle?.()
                          else onSongSelect(song.id)
                        }}
                        onPointerEnter={() => {
                          if (!isSelected) onPreviewStart(song)
                        }}
                        onPointerLeave={onPreviewStop}
                      >
                        {song.artwork && <img src={song.artwork} alt="" loading="eager" decoding="async" />}
                        <span aria-hidden="true">
                          <PreviewIndicator status={indicatorStatus} />
                        </span>
                      </button>
                      <span className="song-row__copy">
                        <button className="song-row__title-link" type="button" title={song.title} onClick={() => {
                          if (previewStatus) {
                            onPreviewStop()
                          }
                          if (isSelected) onPlaybackToggle?.()
                          else onSongSelect(song.id)
                        }}>
                          {song.title}
                        </button>
                        <span className="song-row__byline">
                          <button className="song-row__catalog-link" type="button" disabled={!song.artistId} onClick={() => onArtistSelect?.(song.artistId)}>
                            {song.artist}
                          </button>
                          {song.albumId && (
                            <>
                              <span className="song-row__separator" aria-hidden="true">·</span>
                              <button
                                className="song-row__catalog-link song-row__catalog-link--album"
                                type="button"
                                title={song.albumTitle}
                                onClick={() => onAlbumSelect?.(song.albumId)}
                              >
                                {song.albumTitle}
                              </button>
                            </>
                          )}
                        </span>
                      </span>
                    </div>
                    <span className="song-row__meta">
                      <span className="song-row__actions">
                        <HeartToggle
                          className="heart-container--song-row"
                          label={`Me gusta ${song.title}`}
                          liked={isLiked}
                          onToggle={(liked) => onToggleFavorite?.(song.id, liked)}
                          removeLabel={`Quitar ${song.title} de favoritas`}
                          size={16}
                        />
                        <button
                          className="song-row__action"
                          type="button"
                          aria-label={`A\u00f1adir ${song.title} a una playlist`}
                          title="A\u00f1adir a playlist"
                          onClick={(event) => {
                            event.stopPropagation()
                            onAddToPlaylist?.(song)
                          }}
                        >
                          <ListPlus size={16} strokeWidth={1.8} aria-hidden="true" />
                        </button>
                      </span>
                      <span className="song-row__duration">{formatDuration(song.durationSeconds)}</span>
                    </span>
                  </div>
                )
              })}
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
              disabled={currentPage >= pageCount - 1}
              onClick={() => showPage(currentPage + 1, 'next')}
            >
              <span>Siguiente</span>
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
