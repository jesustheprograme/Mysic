import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, ListPlus } from 'lucide-react'
import HeartToggle from '../../components/HeartToggle.jsx'
import PreviewIndicator from '../../components/PreviewIndicator.jsx'

const SONGS_PER_PAGE = 15
const MAX_VISIBLE_PAGES = 10

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

function SongList({
  likedSongIds,
  onAddToPlaylist,
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
  const firstVisiblePage = Math.min(page, Math.max(0, pageCount - 2))
  const visiblePages = Array.from(
    { length: Math.min(2, pageCount - firstVisiblePage) },
    (_, index) => firstVisiblePage + index,
  )
  const visibleSongs = useMemo(() => {
    const start = page * SONGS_PER_PAGE
    return songs.slice(start, start + SONGS_PER_PAGE)
  }, [page, songs])

  function showPage(nextPage, nextDirection) {
    if (pageCount <= 1) return
    const clampedPage = Math.max(0, Math.min(nextPage, pageCount - 1))
    if (clampedPage === page) return
    onPreviewStop()
    setDirection(nextDirection)
    setPage(clampedPage)
  }

  return (
    <section className="song-section" aria-labelledby="song-list-title">
      <div className="collection-heading">
        <h2 id="song-list-title">{title}</h2>
        <span>{String(songs.length).padStart(2, '0')}</span>
      </div>

      {songs.length > 0 ? (
        <>
          <div className="song-list-frame">
            <div className={`song-list song-list--slide-${direction}`} key={page}>
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
                    <button
                      className="song-row__main playback-hover"
                      type="button"
                      aria-label={isSelected && selectedSongPlaying ? `Pausar ${song.title}` : `Reproducir ${song.title}`}
                      aria-pressed={isSelected && selectedSongPlaying}
                      onClick={() => {
                        if (previewStatus) {
                          onPreviewStop()
                          return
                        }
                        if (isSelected) onPlaybackToggle?.()
                        else onSongSelect(song.id)
                      }}
                    >
                      <span
                        className="song-row__artwork"
                        onPointerEnter={() => {
                          if (!isSelected) onPreviewStart(song)
                        }}
                        onPointerLeave={onPreviewStop}
                      >
                        <img src={song.artwork} alt="" loading="lazy" />
                        <span aria-hidden="true">
                          <PreviewIndicator status={indicatorStatus} />
                        </span>
                      </span>
                      <span className="song-row__copy">
                        <strong>{song.title}</strong>
                        <span>{song.artist}{' \u00b7 '}{song.plays}</span>
                      </span>
                    </button>
                    <span className="song-row__meta">
                      <span className="song-row__actions">
                        <HeartToggle
                          className="heart-container--song-row"
                          label={`Me gusta ${song.title}`}
                          liked={isLiked}
                          onToggle={() => onToggleFavorite?.(song.id)}
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
              disabled={page === 0}
              onClick={() => showPage(page - 1, 'previous')}
            >
              <ChevronLeft size={16} strokeWidth={2.4} aria-hidden="true" />
              <span>Anterior</span>
            </button>
            <span className="song-pagination__pages" aria-live="polite">
              {visiblePages.map((pageNumber) => (
                <span className="song-pagination__page-item" key={pageNumber}>
                  <button
                    className={pageNumber === page ? 'song-pagination__page song-pagination__page--active' : 'song-pagination__page'}
                    type="button"
                    aria-current={pageNumber === page ? 'page' : undefined}
                    aria-label={`Pagina ${pageNumber + 1} de canciones`}
                    disabled={pageNumber === page}
                    onClick={() => showPage(pageNumber, pageNumber > page ? 'next' : 'previous')}
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
              disabled={page >= pageCount - 1}
              onClick={() => showPage(page + 1, 'next')}
            >
              <span>Siguiente</span>
              <ChevronRight size={16} strokeWidth={2.4} aria-hidden="true" />
            </button>
          </nav>
        </>
      ) : (
        <div className="collection-empty" role="status">No tienes canciones favoritas todavia.</div>
      )}
    </section>
  )
}

export default SongList
