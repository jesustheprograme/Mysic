import { ArrowDownAZ, Play, RefreshCw, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import HomeRail from '../discovery/HomeRail.jsx'
import { buildLibrary, LIBRARY_TABS, LIKED_ID, parseLibraryId, REPEAT_ID } from './libraryModel.js'
import { readTopPlays } from './playHistory.js'
import './library-view.css'

// Con bibliotecas de miles de elementos no se pintan todos a la vez: la cuadrícula va creciendo por tandas
// al acercarse al final.
const GRID_BATCH = 60

// Estado que sobrevive al desmontaje (al entrar en un álbum o artista y volver, se reabre donde estabas):
// la pestaña activa y cuántas tarjetas estaban reveladas en cada una, para que el scroll guardado exista otra vez.
let lastTab = 'all'
const revealedDepth = new Map()

/** Cuadrícula que crece por tandas: solo hay en el DOM lo que ya se ha desplazado más lo siguiente. */
function ProgressiveGrid({ depthKey, items, onSelect, title, variant }) {
  const [limit, setLimit] = useState(() => (depthKey && revealedDepth.get(depthKey)) || GRID_BATCH)
  const sentinelRef = useRef(null)
  const hasMore = limit < items.length

  useEffect(() => {
    if (depthKey) revealedDepth.set(depthKey, limit)
  }, [depthKey, limit])

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
export default function LibraryView({ controller, data, renderSongs }) {
  const { downloads, officialLibraryBusy, openAlbum, openArtist, openPlaylist, playSongs, syncOfficialLibrary } = controller
  const [tab, setTabState] = useState(lastTab)
  const setTab = (next) => {
    lastTab = next
    setTabState(next)
  }
  const [query, setQuery] = useState('')
  const [sortAZ, setSortAZ] = useState(false)
  // "En repetición": lo más escuchado en los últimos 30 días, del historial local (se lee al abrir la biblioteca).
  const repeat = useMemo(() => readTopPlays(), [])
  const library = useMemo(() => buildLibrary(data, { query, repeat, sort: sortAZ ? 'az' : 'recent' }), [data, query, repeat, sortAZ])
  const downloaded = downloads.downloads.items
  const counts = {
    all: null,
    albums: library.totals.albums,
    artists: library.totals.artists,
    downloads: downloaded.length,
    playlists: library.totals.playlists + library.pinned.length,
    songs: data.likedSongs.length,
    uploads: library.totals.uploads,
  }
  const tabs = LIBRARY_TABS.filter((item) => item.id !== 'uploads' || library.totals.uploads > 0)
  const activeTab = tabs.some((item) => item.id === tab) ? tab : 'all'
  const searchable = activeTab !== 'songs' && activeTab !== 'downloads'

  function open(value) {
    const { kind, id } = parseLibraryId(value)
    if (kind === LIKED_ID) setTab('songs')
    else if (kind === REPEAT_ID) playSongs(repeat, repeat[0].id)
    else if (kind === 'pl') openPlaylist(id)
    else if (kind === 'al') openAlbum(id)
    else if (kind === 'ar') openArtist(id)
  }

  const playlistItems = [...library.pinned, ...library.playlists]
  const sections = [
    { items: playlistItems, key: 'playlists', title: 'Playlists' },
    { items: library.albums, key: 'albums', title: 'Álbumes' },
    { items: library.artists, key: 'artists', title: 'Artistas' },
    { items: library.uploads, key: 'uploads', title: 'Subidos' },
  ]
  const everything = { items: [...playlistItems, ...library.albums, ...library.artists, ...library.uploads], key: 'all', title: 'Biblioteca' }
  const visibleSections = activeTab === 'all' ? [everything] : sections.filter((section) => section.key === activeTab)
  const nothingFound = searchable && visibleSections.every((section) => section.items.length === 0)

  return (
    <div className="home-page lib-page">
      <h1 className="lib-page__title">Biblioteca</h1>

      <div className="lib-page__row">
        <div className="lib-tabs" role="tablist" aria-label="Secciones de la biblioteca">
          {tabs.map((item) => (
            <button type="button" role="tab" aria-selected={activeTab === item.id} key={item.id} onClick={() => setTab(item.id)}>
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

      {activeTab === 'songs' && (
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
      {activeTab === 'downloads' && renderSongs(downloaded, 'Descargas')}

      {visibleSections.map((section) => (
        <ProgressiveGrid depthKey={query ? null : section.key} items={section.items} key={`${section.key}-${query}-${sortAZ}`} onSelect={open} title={section.title} variant={section.variant} />
      ))}

      {nothingFound && (
        <p className="collection-empty" role="status">{query ? 'No encontramos nada con esa búsqueda.' : 'Aún no hay nada en esta sección.'}</p>
      )}
    </div>
  )
}