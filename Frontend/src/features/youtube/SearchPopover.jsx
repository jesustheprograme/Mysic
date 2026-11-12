import { ChevronRight, Clock3, Disc3, Music2, Search, Trash2, UserRound } from 'lucide-react'
import { sizedImage } from '../../lib/imageSize.js'
import { imageUrl } from './lib/api.js'
import './search-dropdown.css'

const TYPE_LABELS = {
  album: 'Álbum',
  artist: 'Artista',
  song: 'Canción',
}

const SECTION_LABELS = {
  album: 'Álbumes',
  artist: 'Artistas',
  song: 'Canciones',
}

const FALLBACK_ICONS = {
  album: Disc3,
  artist: UserRound,
  history: Clock3,
  song: Music2,
}

// Lado de la miniatura según .sx-thumb--medium / --large: la imagen se pide (y el proxy la guarda) a ese tamaño.
const THUMB_PX = { large: 72, medium: 58 }

// Las filas que llevan a otra pantalla muestran chevron; las canciones muestran su duración.
const NAVIGATES = new Set(['album', 'artist'])

function Thumbnail({ row, size }) {
  const Fallback = FALLBACK_ICONS[row.kind] ?? Search
  const shape = row.kind === 'artist' ? 'round' : 'square'
  const px = THUMB_PX[size] ?? THUMB_PX.large
  return (
    <span className={`sx-thumb sx-thumb--${shape} sx-thumb--${size}`}>
      {row.thumbnail
        ? <img loading="lazy" decoding="async" src={imageUrl(sizedImage(row.thumbnail, px))} alt="" width={px} height={px} />
        : <Fallback size={size === 'large' ? 26 : 20} aria-hidden="true" />}
    </span>
  )
}

function SearchOption({ active, featured = false, index, listboxId, onChoose, onHistoryRemove, row }) {
  const variant = featured ? 'featured' : row.kind
  // En el resultado principal y en artistas el tipo acompaña al dato ("Artista · 12.4 M oyentes mensuales").
  const showKind = featured || row.kind === 'artist'
  const subtitle = [showKind ? TYPE_LABELS[row.kind] : '', row.subtitle].filter(Boolean).join(' · ')
  const large = featured || row.kind === 'artist'

  return (
    <div className={`sx-option sx-option--${variant}${active ? ' sx-option--active' : ''}`}>
      <button
        type="button"
        className="sx-choice"
        id={`${listboxId}-${index}`}
        role="option"
        aria-selected={active}
        onClick={() => onChoose(row)}
      >
        <Thumbnail row={row} size={large ? 'large' : 'medium'} />
        <span className="sx-copy">
          <strong>{row.title}</strong>
          {subtitle && <small>{subtitle}</small>}
        </span>
        {row.duration && <time className="sx-time">{row.duration}</time>}
        {(featured || NAVIGATES.has(row.kind)) && <ChevronRight className="sx-chevron" size={20} aria-hidden="true" />}
      </button>
      {row.kind === 'history' && (
        <button
          type="button"
          className="sx-remove"
          aria-label={`Eliminar ${row.title} del historial`}
          onClick={() => onHistoryRemove(row.title)}
        >
          <Trash2 size={17} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

function SectionHeading({ id, onViewAll, title, viewAll }) {
  return (
    <div className="sx-heading-row">
      <h3 className="sx-heading" id={id}>{title}</h3>
      {/* Solo ratón: el teclado ya dispone de Enter en el campo para ver todos los resultados. */}
      {viewAll && <button type="button" className="sx-link" tabIndex={-1} onClick={onViewAll}>Ver todo</button>}
    </div>
  )
}

export default function SearchPopover({
  activeIndex,
  featured,
  hasQuery,
  listboxId,
  onChoose,
  onHistoryRemove,
  onViewAll,
  open,
  queryLength,
  rows,
  sections,
}) {
  const optionProps = { listboxId, onChoose, onHistoryRemove }
  let nextIndex = 0
  const featuredIndex = featured ? nextIndex++ : -1

  return (
    <div className="sx-popover" inert={!open}>
      <div id={listboxId} role="listbox" aria-label="Sugerencias de búsqueda">
        {!hasQuery && rows.length > 0 && (
          <section role="group" aria-labelledby={`${listboxId}-recent`}>
            <SectionHeading id={`${listboxId}-recent`} title="Búsquedas recientes" />
            {rows.map((row, index) => (
              <SearchOption {...optionProps} active={activeIndex === index} index={index} key={`${row.kind}-${row.title}`} row={row} />
            ))}
          </section>
        )}

        {hasQuery && featured && (
          <section role="group" aria-labelledby={`${listboxId}-best`}>
            <SectionHeading id={`${listboxId}-best`} title="Mejor coincidencia" />
            <SearchOption {...optionProps} active={activeIndex === featuredIndex} featured index={featuredIndex} row={featured} />
          </section>
        )}

        {hasQuery && sections.map((section) => {
          const start = nextIndex
          nextIndex += section.rows.length
          const headingId = `${listboxId}-${section.kind}`
          return (
            <section role="group" aria-labelledby={headingId} key={section.kind}>
              <SectionHeading id={headingId} onViewAll={onViewAll} title={SECTION_LABELS[section.kind]} viewAll={section.viewAll} />
              {section.rows.map((row, index) => (
                <SearchOption {...optionProps} active={activeIndex === start + index} index={start + index} key={`${row.kind}-${row.id ?? row.title}`} row={row} />
              ))}
            </section>
          )
        })}
      </div>

      {open && !rows.length && (
        <p className="sx-empty">{queryLength < 2 ? 'Escribe para buscar en YouTube Music.' : 'No hay sugerencias todavía.'}</p>
      )}
    </div>
  )
}
