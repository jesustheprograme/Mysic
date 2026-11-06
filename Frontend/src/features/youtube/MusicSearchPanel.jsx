import { Search, X } from 'lucide-react'
import { useEffect, useEffectEvent, useId, useRef, useState } from 'react'
import { api } from './lib/api.js'
import SearchPopover from './SearchPopover.jsx'
import { buildSearchModel } from './searchModel.js'

const SUGGEST_DEBOUNCE_MS = 180
// La búsqueda completa es más pesada para YouTube que las sugerencias: se pide con menos prisa.
const SEARCH_DEBOUNCE_MS = 320

const normalizeKey = (text) => text.trim().toLocaleLowerCase()

/**
 * ¿El resultado completo guardado sirve para la consulta actual? Mientras se teclea, la consulta
 * crece o se acorta sobre la anterior; seguir mostrando el resultado previo evita que el panel
 * cambie de forma (completo → sugerencias → completo) con cada pulsación.
 */
function isRelevantSearch(storedKey, currentKey) {
  if (!storedKey || !currentKey) return false
  return storedKey === currentKey || currentKey.startsWith(storedKey) || storedKey.startsWith(currentKey)
}

export default function MusicSearchPanel({
  focusOnMount = false,
  history,
  onEntitySelect,
  onHistoryAdd,
  onHistoryRemove,
  onPrefetch,
  onQueryChange,
  onSubmit,
  query,
}) {
  const [open, setOpen] = useState(false)
  const [suggestions, setSuggestions] = useState({ texts: [], entities: [] })
  const [searchResult, setSearchResult] = useState({ key: '', data: null })
  const [activeIndex, setActiveIndex] = useState(-1)
  const rootRef = useRef(null)
  const inputRef = useRef(null)
  const suggestionsCacheRef = useRef(new Map())
  const listboxId = useId()

  const loadSuggestions = useEffectEvent((searchQuery, signal) => {
    const cacheKey = searchQuery.toLocaleLowerCase()
    const cached = suggestionsCacheRef.current.get(cacheKey)
    if (cached) {
      setSuggestions(cached)
      setActiveIndex(-1)
      return
    }

    onPrefetch?.(searchQuery)
    api.suggest(searchQuery, signal)
      .then((data) => {
        suggestionsCacheRef.current.set(cacheKey, data)
        setSuggestions(data)
        setActiveIndex(-1)
        const primaryArtist = data.entities?.find((entity) => entity.kind === 'artist' && entity.id)
        if (primaryArtist) api.prefetchArtist(primaryArtist.id)
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setSuggestions({ texts: [], entities: [] })
      })
  })

  const loadFullSearch = useEffectEvent((searchQuery, signal) => {
    api.search(searchQuery, 'all', signal)
      .then((data) => setSearchResult({ key: normalizeKey(searchQuery), data }))
      .catch(() => {
        // Sin resultado completo el panel sigue funcionando con las sugerencias.
      })
  })

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
      loadSuggestions(query.trim(), controller.signal)
    }, SUGGEST_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [open, query])

  useEffect(() => {
    if (!open || query.trim().length < 2) return undefined
    const controller = new AbortController()
    const timer = setTimeout(() => {
      loadFullSearch(query.trim(), controller.signal)
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [open, query])

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
  const currentKey = normalizeKey(query)
  const search = isRelevantSearch(searchResult.key, currentKey) ? searchResult.data : null
  const { featured, rows, sections } = buildSearchModel({ hasQuery, history, search, suggestions })

  function choose(row) {
    setActiveIndex(-1)
    setOpen(false)
    inputRef.current?.blur()

    if (row.kind === 'song' && row.song) {
      onHistoryAdd?.(query.trim() || row.title)
      onEntitySelect(row)
    } else if (row.kind === 'artist' || row.kind === 'album') {
      onHistoryAdd?.(query.trim() || row.title)
      onEntitySelect(row)
    } else {
      onQueryChange(row.title)
      onSubmit(row.title)
    }
  }

  function viewAll() {
    if (!query.trim()) return
    setActiveIndex(-1)
    setOpen(false)
    inputRef.current?.blur()
    onSubmit(query)
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
        className="sx-bar"
        role="search"
        onSubmit={(event) => {
          event.preventDefault()
          if (!query.trim()) return
          onSubmit(query)
          setOpen(false)
          inputRef.current?.blur()
        }}
      >
        <Search size={20} strokeWidth={1.8} aria-hidden="true" />
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
          <button
            type="button"
            className="sx-clear"
            aria-label="Limpiar búsqueda"
            onClick={() => {
              onQueryChange('')
              inputRef.current?.focus()
            }}
          >
            <X size={19} aria-hidden="true" />
          </button>
        )}
      </form>

      <SearchPopover
        activeIndex={activeIndex}
        featured={featured}
        hasQuery={hasQuery}
        listboxId={listboxId}
        onChoose={choose}
        onHistoryRemove={removeHistory}
        onViewAll={viewAll}
        open={open}
        queryLength={query.trim().length}
        rows={rows}
        sections={sections}
      />
    </div>
  )
}
