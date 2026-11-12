import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useRef, useState } from 'react'
import PreviewIndicator from '../../components/PreviewIndicator.jsx'
import { sizedImage } from '../../lib/imageSize.js'
import useRailColumns, { EXPANDED_EXTRA_ROWS, RAIL_GAP } from './railColumns.js'

function HomeRail({
  // Lado máximo (px CSS) de la carátula: con él se pide la imagen a ese tamaño. Sin él, la URL llega tal cual.
  artworkSize,
  emptyMessage = 'Todavía no hay elementos.',
  fitColumns = false,
  headingAction,
  icon,
  items,
  onIntent,
  onIntentEnd,
  onPlaybackToggle,
  onArtistSelect,
  onDetailSelect,
  onPreviewStart,
  onPreviewStop,
  onSelect,
  preview,
  renderMenu,
  selectedId,
  selectedItemPlaying,
  title,
  trailingContent,
  variant = 'default',
  wrap = false,
}) {
  const railRef = useRef(null)
  const [expanded, setExpanded] = useState(false)
  // Con `fitColumns` las tarjetas se reparten el ancho exacto (sin un trozo de la siguiente asomando)
  // y "Ver todo" despliega la sección entera en una cuadrícula.
  const measuredColumns = useRailColumns(railRef)
  const columns = fitColumns ? measuredColumns : 0
  const overflowing = !fitColumns || columns === 0 || items.length > columns
  // Desplegada, la sección suma como mucho 3 filas más a la que ya se ve, no toda la lista.
  const shown = fitColumns && expanded && columns ? items.slice(0, columns * (1 + EXPANDED_EXTRA_ROWS)) : items

  // Una página de tarjetas por clic: queda alineada con el borde izquierdo.
  function scrollRail(direction) {
    const rail = railRef.current
    if (rail) rail.scrollBy({ left: direction * (rail.clientWidth + RAIL_GAP), behavior: 'smooth' })
  }

  return (
    <section className={`home-shelf${variant === 'artist' ? ' home-shelf--artists' : ''}`} aria-labelledby={`${title.toLocaleLowerCase().replaceAll(' ', '-')}-title`}>
      <div className="home-shelf__heading" hidden={wrap || undefined}>
        <h2 id={`${title.toLocaleLowerCase().replaceAll(' ', '-')}-title`}>{icon}{title}</h2>
        {headingAction ?? (items.length > 0 && overflowing && (
          <div className="home-shelf__actions">
            {fitColumns
              ? <button className="home-shelf__see-all" type="button" aria-expanded={expanded} onClick={() => setExpanded((open) => !open)}>{expanded ? 'Ver menos' : 'Ver todo'}</button>
              : <span>Ver todo</span>}
            {!expanded && (
              <>
                <button type="button" aria-label={`Anterior: ${title}`} title="Anterior" onClick={() => scrollRail(-1)}>
                  <ChevronLeft size={16} strokeWidth={1.7} aria-hidden="true" />
                </button>
                <button type="button" aria-label={`Siguiente: ${title}`} title="Siguiente" onClick={() => scrollRail(1)}>
                  <ChevronRight size={16} strokeWidth={1.7} aria-hidden="true" />
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      {items.length > 0 ? <div className={`home-shelf__rail${expanded ? ' home-shelf__rail--grid' : ''}${wrap ? ' home-shelf__rail--wrap' : ''}`} data-rail-cols={columns || undefined} ref={railRef} style={columns ? { '--rail-cols': columns } : undefined}>
        {shown.map((item) => {
          const previewStatus = preview?.itemId === item.id ? preview.status : null
          const isSelected = selectedId === item.id
          const indicatorStatus = previewStatus ?? (isSelected ? selectedItemPlaying ? 'playing' : 'paused' : null)
          const selectItem = () => {
            if (previewStatus) onPreviewStop?.()
            if (isSelected && onPlaybackToggle) {
              onPlaybackToggle()
              return
            }
            onSelect?.(item.id)
          }

          return (
            <article className={`home-shelf-card${isSelected ? ' home-shelf-card--active' : ''}${isSelected && selectedItemPlaying ? ' home-shelf-card--playing' : ''}`} key={item.id}>
              <button
                className={`home-shelf-card__button${item.audioUrl ? ' playback-hover' : ''}`}
                type="button"
                aria-label={onSelect ? `Abrir ${item.title}${item.artist ? ` de ${item.artist}` : ''}` : item.title}
                aria-pressed={onSelect ? isSelected : undefined}
                onClick={selectItem}
                onPointerEnter={() => {
                  if (item.audioUrl && !isSelected) onPreviewStart?.(item)
                  onIntent?.(item)
                }}
                onPointerLeave={() => {
                  onPreviewStop?.()
                  onIntentEnd?.(item)
                }}
                onPointerDown={() => onIntent?.(item)}
                onFocus={() => onIntent?.(item)}
                onBlur={() => onIntentEnd?.(item)}
              >
                <span className={`home-shelf-card__visual${item.artwork ? '' : ' home-shelf-card__visual--empty'}`}>
                  {/* Todas diferidas: las secciones de más abajo no piden ni decodifican nada hasta acercarse. */}
                  {item.artwork && <img src={artworkSize ? sizedImage(item.artwork, artworkSize) : item.artwork} alt="" width={artworkSize ?? 160} height={artworkSize ?? 160} loading="lazy" decoding="async" />}
                  {item.badge && <span className="home-shelf-card__badge">{item.badge}</span>}
                  {item.artwork && (
                    <span className="home-shelf-card__play" aria-hidden="true">
                      <PreviewIndicator status={indicatorStatus} />
                    </span>
                  )}
                </span>
              </button>
              {renderMenu?.(item)}
              <div className="home-shelf-card__meta">
                <button className="home-shelf-card__title" type="button" onClick={selectItem}>{item.title}</button>
                {item.artistId && onArtistSelect
                  ? <button className="home-shelf-card__meta-link" type="button" onClick={() => onArtistSelect(item.artistId)}>{item.artist ?? item.meta}</button>
                  : <span>{item.artist ?? item.meta}</span>}
                {item.detail && (item.detailId && onDetailSelect
                  ? <button className="home-shelf-card__detail-link" type="button" onClick={() => onDetailSelect(item.detailId)}>{item.detail}</button>
                  : <small>{item.detail}</small>)}
              </div>
            </article>
          )
        })}
        {trailingContent}
      </div> : <div className="home-shelf__empty" role="status">{emptyMessage}</div>}
    </section>
  )
}

export default HomeRail
