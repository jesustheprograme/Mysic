import { Clock3, Search, Trash2, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { api, imageUrl } from './lib/api.js'

const TYPE_LABELS = {
  album: 'Álbum',
  artist: 'Artista',
  song: 'Canción',
}

export default function MusicSearchPanel({
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

  const rows = query.trim()
    ? [
        ...suggestions.texts.map((title) => ({ kind: 'query', title })),
        ...suggestions.entities,
      ]
    : history.map((title) => ({ kind: 'history', title }))

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

      <div className="yt-music-search__popover" id={listboxId} role="listbox" aria-label="Sugerencias de búsqueda" inert={!open}>
        {!query && history.length > 0 && <p className="yt-music-search__eyebrow">Búsquedas recientes</p>}
        {rows.map((row, index) => (
          <div
            className={`yt-music-search__option${activeIndex === index ? ' yt-music-search__option--active' : ''}`}
            key={`${row.kind}-${row.id ?? row.title}`}
          >
            <button
              type="button"
              className="yt-music-search__choice"
              id={`${listboxId}-${index}`}
              role="option"
              aria-selected={activeIndex === index}
              onClick={() => choose(row)}
            >
              {row.thumbnail ? (
                <img src={imageUrl(row.thumbnail)} alt="" />
              ) : row.kind === 'history' ? (
                <Clock3 size={19} aria-hidden="true" />
              ) : (
                <Search size={19} aria-hidden="true" />
              )}
              <span>
                <strong>{row.title}</strong>
                {row.subtitle && <small>{TYPE_LABELS[row.kind] ?? row.kind} · {row.subtitle}</small>}
              </span>
            </button>
            {row.kind === 'history' && (
              <button
                type="button"
                className="yt-music-search__remove"
                aria-label={`Eliminar ${row.title} del historial`}
                onClick={() => {
                  setActiveIndex(-1)
                  onHistoryRemove(row.title)
                }}
              >
                <Trash2 size={17} aria-hidden="true" />
              </button>
            )}
          </div>
        ))}
        {open && !rows.length && (
          <p className="yt-music-search__empty">{query.trim().length < 2 ? 'Escribe para buscar en YouTube Music.' : 'No hay sugerencias todavía.'}</p>
        )}
      </div>
    </div>
  )
}
