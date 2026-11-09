import { ArrowDownAZ, Play, RefreshCw, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import HomeRail from '../discovery/HomeRail.jsx'
import { SectionIcon } from './ShelfLayouts.jsx'
import { buildLibrary, LIBRARY_TABS, LIKED_ID, parseLibraryId } from './libraryModel.js'
import './library-view.css'

/**
 * Biblioteca: reutiliza las tarjetas de HomeRail. "Todo" es un resumen con un carrusel por tipo; cada pestaña
 * muestra su sección completa en cuadrícula. Búsqueda, orden A-Z y sincronización están siempre a mano.
 */
export default function LibraryView({ controller, data, renderSongs }) {
  const { downloads, officialLibraryBusy, openAlbum, openArtist, openPlaylist, playSongs, syncOfficialLibrary } = controller
  const [tab, setTab] = useState('all')
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
  const visibleSections = tab === 'all' ? sections.filter((section) => section.items.length) : sections.filter((section) => section.key === tab)
  const nothingFound = searchable && visibleSections.every((section) => section.items.length === 0)

  return (
    <div className="home-page lib-page">
      <div className="lib-page__head">
        <h1>Biblioteca</h1>
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

      <div className="lib-tabs" role="tablist" aria-label="Secciones de la biblioteca">
        {LIBRARY_TABS.map((item) => (
          <button type="button" role="tab" aria-selected={tab === item.id} key={item.id} onClick={() => setTab(item.id)}>
            {item.label}{counts[item.id] ? <span className="lib-tabs__count">{counts[item.id]}</span> : null}
          </button>
        ))}
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
        tab === 'all'
          ? <HomeRail fitColumns icon={<SectionIcon kind={section.kind} />} items={section.items} key={section.key} onSelect={open} title={section.title} variant={section.variant} />
          : <HomeRail items={section.items} key={section.key} onSelect={open} title={section.title} variant={section.variant} wrap />
      ))}

      {nothingFound && (
        <p className="collection-empty" role="status">{query ? 'No encontramos nada con esa búsqueda.' : 'Aún no hay nada en esta sección.'}</p>
      )}
    </div>
  )
}