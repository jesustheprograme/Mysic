import { ArrowDownAZ, Play, RefreshCw, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import HomeRail from '../discovery/HomeRail.jsx'
import { buildLibrary, LIBRARY_TABS, LIKED_ID, parseLibraryId } from './libraryModel.js'
import './library-view.css'

// Con bibliotecas de miles de elementos no se pintan todos a la vez: la cuadrícula va creciendo por tandas\n// al acercarse al final.\nconst GRID_BATCH = 60

// La pestaña activa sobrevive al desmontaje: al volver de un álbum o artista se reabre donde estabas.
let lastTab = 'all'

/** Cuadrícula que crece por tandas: solo hay en el DOM lo que ya se ha desplazado más lo siguiente. */
function ProgressiveGrid({ items, onSelect, title, variant }) {
  const [limit, setLimit] = useState(GRID_BATCH)
  const sentinelRef = useRef(null)
  const hasMore = limit < items.length

  useEffect(() => {
    const node = sentinelRef.current
    if (!node || !hasMore) return undefined
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setLimit((current) => current + GRID_BATCH)
    }, { rootMargin: '900px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [hasMore, limit])

  return (
    <>
      <HomeRail items={items.slice(0, limit)} onSelect={onSelect} title={title} variant={variant} wrap />
      {hasMore && <div className="lib-page__sentinel" ref={sentinelRef} aria-hidden="true" />}
    </>
  )
}

/**
 * Biblioteca: reutiliza las tarjetas de HomeRail. "Todo" es un resumen con un carrusel corto por tipo; cada
 * pestaña muestra su sección completa en una cuadrícula progresiva. Búsqueda, orden A-Z y sincronización siempre a mano.
 */
export default function LibraryView({ controller, data, renderSongs }) {
  const { downloads, officialLibraryBusy, openAlbum, openArtist, openPlaylist, playSongs, syncOfficialLibrary } = controller
  const [tab, setTabState] = useState(lastTab)
  const setTab = (next) => {
    lastTab = next
    setTabState(next)
  }
  const [query, setQuery] = useState('')
  const [sortAZ, setSortAZ] = useState(false)
  const library = useMemo(() => buildLibrary(data, { query, sort: sortAZ ? 'az' : 'recent' }), [data, query, sortAZ])
  const downloaded = downloads.downloads.items
  const counts = {
    all: null,
    albums: library.totals.albums,
    artists: library.totals.artists,
    downloads: downloaded.length,
    playlists: library.totals.playlists + 1,
    songs: data.likedSongs.length,
  }
  const searchable = tab !== 'songs' && tab !== 'downloads'

  function open(value) {
    const { kind, id } = parseLibraryId(value)
    if (kind === LIKED_ID) setTab('songs')
    else if (kind === 'pl') openPlaylist(id)
    else if (kind === 'al') openAlbum(id)
    else if (kind === 'ar') openArtist(id)
  }

  const playlistItems = library.liked ? [library.liked, ...library.playlists] : library.playlists
  const sections = [
    { items: playlistItems, kind: 'rail', key: 'playlists', title: 'Playlists' },
    { items: library.albums, kind: 'rail', key: 'albums', title: 'Álbumes' },
    { items: library.artists, kind: 'artists', key: 'artists', title: 'Artistas', variant: 'artist' },
  ]
  const everything = { items: [...playlistItems, ...library.albums, ...library.artists], key: 'all', title: 'Biblioteca' }
  const visibleSections = tab === 'all' ? [everything] : sections.filter((section) => section.key === tab)
  const nothingFound = searchable && visibleSections.every((section) => section.items.length === 0)

  return (
    <div className="home-page lib-page">
      <h1 className="lib-page__title">Biblioteca</h1>

      <div className="lib-page__row">
        <div className="lib-tabs" role="tablist" aria-label="Secciones de la biblioteca">
          {LIBRARY_TABS.map((item) => (
            <button type="button" role="tab" aria-selected={tab === item.id} key={item.id} onClick={() => setTab(item.id)}>
              {item.label}{counts[item.id] ? <span className="lib-tabs__count">{counts[item.id]}</span> : null}
            </button>
          ))}
        </div>
        <div className="lib-page__tools">
          {searchable && (
            <label className="artists-page__search">
              <Search size={16} strokeWidth={1.8} aria-hidden="true" />
              <input type="search" placeholder="Buscar en tu biblioteca..." value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
          )}
          {searchable && (
            <button className={`artists-page__pill${sortAZ ? ' is-active' : ''}`} type="button" aria-pressed={sortAZ} onClick={() => setSortAZ((current) => !current)}>
              <ArrowDownAZ size={15} strokeWidth={1.8} aria-hidden="true" /> A-Z
            </button>
          )}
          <button className="artists-page__pill" type="button" disabled={officialLibraryBusy} onClick={() => syncOfficialLibrary()} title="Volver a traer tus Me gusta y playlists de YouTube Music">
            <RefreshCw className={officialLibraryBusy ? 'yt-spin' : undefined} size={15} strokeWidth={1.8} aria-hidden="true" /> Sincronizar
          </button>
        </div>
      </div>

      {tab === 'songs' && (
        <>
          {data.likedSongs.length > 0 && (
            <div className="lib-page__bar">
              <button className="sl-play-all" type="button" onClick={() => playSongs(data.likedSongs, data.likedSongs[0].id)}>
                <Play size={14} aria-hidden="true" /> Reproducir todo
              </button>
            </div>
          )}
          {renderSongs(data.likedSongs, 'Canciones que te gustan')}
        </>
      )}
      {tab === 'downloads' && renderSongs(downloaded, 'Descargas')}

      {visibleSections.map((section) => (
        <ProgressiveGrid items={section.items} key={`${section.key}-${query}-${sortAZ}`} onSelect={open} title={section.title} variant={section.variant} />
      ))}

      {nothingFound && (
        <p className="collection-empty" role="status">{query ? 'No encontramos nada con esa búsqueda.' : 'Aún no hay nada en esta sección.'}</p>
      )}
    </div>
  )
}