import { ChevronRight, Clock3, Search, Trash2, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { api, imageUrl } from './lib/api.js'

const TYPE_LABELS = {
  album: 'Álbum',
  artist: 'Artista',
  song: 'Canción',
}

const ENTITY_ORDER = ['song', 'artist', 'album']
const SECTION_LABELS = {
  album: 'Álbumes',
  artist: 'Artistas',
  song: 'Canciones',
}

function buildSearchModel(suggestions, history, hasQuery) {
  if (!hasQuery) {
    const rows = history.map((title) => ({ kind: 'history', title }))
    return { entityGroups: [], featured: null, queryRows: [], rows }
  }

  const queryRows = suggestions.texts.map((title) => ({ kind: 'query', title }))
  const featured = suggestions.entities[0] ?? null
  const entityGroups = ENTITY_ORDER.map((kind) => ({
    kind,
    rows: suggestions.entities.slice(1).filter((entity) => entity.kind === kind),
  })).filter((group) => group.rows.length)
  const rows = [...queryRows, ...(featured ? [featured] : []), ...entityGroups.flatMap((group) => group.rows)]
  return { entityGroups, featured, queryRows, rows }
}

function SearchOption({ active, featured, index, listboxId, onChoose, onHistoryRemove, row }) {
  return (
    <div className={`yt-music-search__option${featured ? ' yt-music-search__option--featured' : ''}${active ? ' yt-music-search__option--active' : ''}`}>
      <button
        type="button"
        className="yt-music-search__choice"
        id={`${listboxId}-${index}`}
        role="option"
        aria-selected={active}
        onClick={() => onChoose(row)}
      >
        {row.thumbnail ? (
          <img src={imageUrl(row.thumbnail)} alt="" />
        ) : row.kind === 'history' ? (
          <Clock3 size={19} aria-hidden="true" />
        ) : (
          <Search size={19} aria-hidden="true" />
        )}
        <span>
          {featured && <small>{TYPE_LABELS[row.kind] ?? row.kind}</small>}
          <strong>{row.title}</strong>
          {row.subtitle && !featured && <small>{TYPE_LABELS[row.kind] ?? row.kind} · {row.subtitle}</small>}
          {row.subtitle && featured && <small>{row.subtitle}</small>}
        </span>
        {featured && <ChevronRight size={19} aria-hidden="true" />}
      </button>
      {row.kind === 'history' && (
        <button type="button" className="yt-music-search__remove" aria-label={`Eliminar ${row.title} del historial`} onClick={() => onHistoryRemove(row.title)}>
          <Trash2 size={17} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

function SearchPopover({ activeIndex, entityGroups, featured, hasQuery, listboxId, onChoose, onHistoryRemove, open, queryLength, queryRows, rows }) {
  return (
    <div className="yt-music-search__popover" id={listboxId} role="listbox" aria-label="Sugerencias de búsqueda" inert={!open}>
      {!hasQuery && rows.length > 0 && <p className="yt-music-search__eyebrow">Búsquedas recientes</p>}
      {!hasQuery && rows.map((row, index) => <SearchOption active={activeIndex === index} featured={false} index={index} key={`${row.kind}-${row.title}`} listboxId={listboxId} onChoose={onChoose} onHistoryRemove={onHistoryRemove} row={row} />)}
      {hasQuery && queryRows.length > 0 && (
        <section className="yt-music-search__section" aria-label="Sugerencias">
          <p className="yt-music-search__eyebrow">Sugerencias</p>
          <div className="yt-music-search__query-grid">
            {queryRows.map((row, index) => <SearchOption active={activeIndex === index} featured={false} index={index} key={`${row.kind}-${row.title}`} listboxId={listboxId} onChoose={onChoose} onHistoryRemove={onHistoryRemove} row={row} />)}
          </div>
        </section>
      )}
      {hasQuery && featured && (
        <section className="yt-music-search__section" aria-label="Resultado principal">
          <p className="yt-music-search__eyebrow">Resultado principal</p>
          <SearchOption active={activeIndex === queryRows.length} featured index={queryRows.length} key={`${featured.kind}-${featured.id ?? featured.title}`} listboxId={listboxId} onChoose={onChoose} onHistoryRemove={onHistoryRemove} row={featured} />
        </section>
      )}
      {hasQuery && entityGroups.map((group, groupIndex) => {
        const firstIndex = queryRows.length + (featured ? 1 : 0)
          + entityGroups.slice(0, groupIndex).reduce((total, item) => total + item.rows.length, 0)
        return (
          <section className="yt-music-search__section" aria-label={SECTION_LABELS[group.kind]} key={group.kind}>
            <p className="yt-music-search__eyebrow">{SECTION_LABELS[group.kind]}</p>
            {group.rows.map((row, index) => <SearchOption active={activeIndex === firstIndex + index} featured={false} index={firstIndex + index} key={`${row.kind}-${row.id ?? row.title}`} listboxId={listboxId} onChoose={onChoose} onHistoryRemove={onHistoryRemove} row={row} />)}
          </section>
        )
      })}
      {open && !rows.length && (
        <p className="yt-music-search__empty">{queryLength < 2 ? 'Escribe para buscar en YouTube Music.' : 'No hay sugerencias todavía.'}</p>
      )}
    </div>
  )
}

export default function MusicSearchPanel({
  focusOnMount = false,
  history,
  onEntitySelect,
  onHistoryRemove,
  onPrefetch,
  onQueryChange,
  onSubmit,
  query,
}) {
  const [open, setOpen] = useState(false)
  const [suggestions, setSuggestions] = useState({ texts: [], entities: [] })
  const [activeIndex, setActiveIndex] = useState(-1)
  const rootRef = useRef(null)
  const inputRef = useRef(null)
  const listboxId = useId()

  useEffect(() => {
    if (focusOnMount) inputRef.current?.focus()
  }, [focusOnMount])

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setSuggestions({ texts: [], entities: [] })
      return undefined
    }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      onPrefetch?.(query.trim())
      api.suggest(query.trim(), controller.signal)
        .then((data) => {
          setSuggestions(data)
          setActiveIndex(-1)
        })
        .catch((error) => {
          if (error.name !== 'AbortError') setSuggestions({ texts: [], entities: [] })
        })
    }, 180)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [onPrefetch, open, query])

  useEffect(() => {
    function closeFromOutside(event) {
      if (!rootRef.current?.contains(event.target)) {
        setActiveIndex(-1)
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', closeFromOutside)
    return () => document.removeEventListener('pointerdown', closeFromOutside)
  }, [])

  const hasQuery = Boolean(query.trim())
  const { entityGroups, featured, queryRows, rows } = buildSearchModel(suggestions, history, hasQuery)

  function choose(row) {
    if (row.kind === 'song' && row.song) onEntitySelect(row)
    else if (row.kind === 'artist' || row.kind === 'album') onEntitySelect(row)
    else {
      onQueryChange(row.title)
      onSubmit(row.title)
    }
    setActiveIndex(-1)
    setOpen(false)
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      setActiveIndex(-1)
      setOpen(false)
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) setOpen(true)
      if (!rows.length) return
      const offset = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((current) => (current + offset + rows.length) % rows.length)
      return
    }
    if (event.key === 'Enter' && activeIndex >= 0 && rows[activeIndex]) {
      event.preventDefault()
      choose(rows[activeIndex])
    }
  }

  function removeHistory(title) {
    setActiveIndex(-1)
    onHistoryRemove(title)
  }

  return (
    <div className={`yt-music-search${open ? ' yt-music-search--open' : ''}`} ref={rootRef}>
      <form
        className="yt-music-search__bar"
        role="search"
        onSubmit={(event) => {
          event.preventDefault()
          if (!query.trim()) return
          onSubmit(query)
          setOpen(false)
        }}
      >
        <Search size={21} strokeWidth={1.8} aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={open}
          aria-activedescendant={activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
          aria-label="Buscar en YouTube Music"
          autoComplete="off"
          placeholder="Canciones, artistas, álbumes…"
          value={query}
          onChange={(event) => {
            onQueryChange(event.target.value)
            setActiveIndex(-1)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />
        {query && (
          <button type="button" aria-label="Limpiar búsqueda" onClick={() => {
            onQueryChange('')
            inputRef.current?.focus()
          }}>
            <X size={19} aria-hidden="true" />
          </button>
        )}
      </form>

      <SearchPopover activeIndex={activeIndex} entityGroups={entityGroups} featured={featured} hasQuery={hasQuery} listboxId={listboxId} onChoose={choose} onHistoryRemove={removeHistory} open={open} queryLength={query.trim().length} queryRows={queryRows} rows={rows} />
    </div>
  )
}
