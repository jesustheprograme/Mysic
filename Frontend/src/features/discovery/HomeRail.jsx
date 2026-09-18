import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useRef } from 'react'
import PreviewIndicator from '../../components/PreviewIndicator.jsx'

function HomeRail({
  emptyMessage = 'Todavía no hay elementos.',
  headingAction,
  items,
  onPlaybackToggle,
  onPreviewStart,
  onPreviewStop,
  onSelect,
  preview,
  selectedId,
  selectedItemPlaying,
  title,
  variant = 'default',
}) {
  const railRef = useRef(null)

  function scrollRail(offset) {
    railRef.current?.scrollBy({ left: offset, behavior: 'smooth' })
  }

  return (
    <section className={`home-shelf${variant === 'artist' ? ' home-shelf--artists' : ''}`} aria-labelledby={`${title.toLocaleLowerCase().replaceAll(' ', '-')}-title`}>
      <div className="home-shelf__heading">
        <h2 id={`${title.toLocaleLowerCase().replaceAll(' ', '-')}-title`}>{title}</h2>
        {headingAction ?? (items.length > 0 && (
          <div className="home-shelf__actions">
            <span>Ver todo</span>
            <button type="button" aria-label={`Anterior: ${title}`} title="Anterior" onClick={() => scrollRail(-520)}>
              <ChevronLeft size={16} strokeWidth={1.7} aria-hidden="true" />
            </button>
            <button type="button" aria-label={`Siguiente: ${title}`} title="Siguiente" onClick={() => scrollRail(520)}>
              <ChevronRight size={16} strokeWidth={1.7} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>

      {items.length > 0 ? <div className="home-shelf__rail" ref={railRef}>
        {items.map((item, index) => {
          const previewStatus = preview?.itemId === item.id ? preview.status : null
          const isSelected = selectedId === item.id
          const indicatorStatus = previewStatus ?? (isSelected && selectedItemPlaying ? 'playing' : null)

          return (
            <article className={`home-shelf-card${isSelected ? ' home-shelf-card--active' : ''}${isSelected && selectedItemPlaying ? ' home-shelf-card--playing' : ''}`} key={item.id}>
              <button
                className={`home-shelf-card__button${item.audioUrl ? ' playback-hover' : ''}`}
                type="button"
                aria-label={onSelect ? `Abrir ${item.title}${item.artist ? ` de ${item.artist}` : ''}` : item.title}
                aria-pressed={onSelect ? isSelected : undefined}
                onClick={() => {
                  if (previewStatus) {
                    onPreviewStop?.()
                  }
                  if (isSelected && onPlaybackToggle) {
                    onPlaybackToggle()
                    return
                  }
                  onSelect?.(item.id)
                }}
                onPointerEnter={() => item.audioUrl && !isSelected && onPreviewStart?.(item)}
                onPointerLeave={onPreviewStop}
              >
                <span className={`home-shelf-card__visual${item.artwork ? '' : ' home-shelf-card__visual--empty'}`}>
                  {item.artwork && <img src={item.artwork} alt="" loading={index < 3 ? 'eager' : 'lazy'} />}
                  {item.badge && <span className="home-shelf-card__badge">{item.badge}</span>}
                  {item.artwork && (
                    <span className="home-shelf-card__play" aria-hidden="true">
                      <PreviewIndicator status={indicatorStatus} />
                    </span>
                  )}
                </span>
                <span className="home-shelf-card__meta">
                  <strong>{item.title}</strong>
                  <span>{item.artist ?? item.meta}</span>
                  {item.detail && <small>{item.detail}</small>}
                </span>
              </button>
            </article>
          )
        })}
      </div> : <div className="home-shelf__empty" role="status">{emptyMessage}</div>}
    </section>
  )
}

export default HomeRail
