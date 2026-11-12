import { ArrowDownAZ, RefreshCw, Search } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { sizedImage } from '../../lib/imageSize.js'
import ArtistCard from '../discovery/ArtistCard.jsx'
import HomeRail from '../discovery/HomeRail.jsx'
import { CardMenu } from './ItemMenus.jsx'
import { adaptBrowseItem } from './lib/adapters.js'
import { buildLibrary, LIBRARY_TABS, LIKED_ID, REPEAT_ID } from './libraryModel.js'
import { emptyMeta, nextKindToLoad } from './libraryPages.js'
import { readTopPlays } from './playHistory.js'
import { prefetchHandlers } from './prefetchDetail.js'
import useVirtualGrid from './useVirtualGrid.js'
import { anchorShiftRows, GRID_ROW_GAP, isNearEnd } from './virtualGrid.js'
import './library-view.css'

// Estado que sobrevive al desmontaje (al entrar en un álbum o artista y volver, se reabre donde estabas):
// la pestaña activa. La altura de la cuadrícula se reserva entera desde el primer render (useVirtualGrid),
// así que el scroll guardado vuelve a existir sin recordar cuántas tarjetas había.
let lastTab = 'all'

// YouTube entrega "4 songs" / "1 song": se muestra en español como el resto de la tarjeta.
const spanishCount = (text) => String(text).replace(/(\d[\d.,]*)\s+songs?\b/i, (_all, count) => `${count} ${count === '1' ? 'canción' : 'canciones'}`)

// Siete tarjetas por fila (seis con el reproductor lateral abierto) y solo un poco fluidas: la tarjeta reparte el
// ancho pero nunca baja de minWidth ni sube de maxWidth; si sobra sitio caben más columnas en vez de estirarla.
const GRID_SIZING = { columns: 7, maxWidth: 190, minWidth: 104, playerColumns: 6 }
// Las tarjetas de artista (3:4, sin texto debajo) admiten algo más de ancho que las de portada cuadrada.
const artistSizing = (sizing) => ({ ...sizing, maxWidth: sizing.maxWidth + 20, minWidth: sizing.minWidth + 8 })

// Las tarjetas son las del inicio: mismo adaptador, mismo HomeRail, mismo menú y misma precarga al pasar el cursor.
// Solo las tarjetas especiales ("Música que me gusta", "En repetición") se adaptan aparte.
const toCard = (entry) => (entry.kind === 'special'
  ? { artist: entry.subtitle, artwork: entry.thumbnail, detail: 'Lista', id: entry.id, title: entry.title }
  : adaptBrowseItem(entry))

/**
 * Cuadrícula ventaneada: en el DOM solo están las filas de tarjetas visibles más un margen; lo demás es
 * relleno arriba y abajo. Lo montado depende de lo que se ve, no de lo que hay cargado.
 */
function VirtualGrid({ artistCounts, controller, entries, loading = false, onNeedMore, onOpen, serverHasMore = false, sizing, title, variant }) {
  const isArtist = variant === 'artist'
  // Filas de alto fijo (portada + texto; las tarjetas de artista son 3:4): la altura total se conoce sin montar las tarjetas.
  const { cardWidth, columns, end, padBottom, padTop, ref, rowHeight, shiftScroll, start } = useVirtualGrid({
    ...(isArtist ? artistSizing(sizing) : sizing),
    aspect: isArtist ? 4 / 3 : 1,
    metaPx: isArtist ? 0 : undefined,
    total: entries.length,
  })
  const needMoreRef = useRef(onNeedMore)
  const anchorRef = useRef(null)
  const shown = useMemo(() => entries.slice(start, end), [end, entries, start])
  const items = useMemo(() => shown.map(toCard), [shown])
  const byId = useMemo(() => new Map(shown.map((entry) => [entry.id, entry])), [shown])
  const kindOf = (item) => byId.get(item.id)?.kind

  useEffect(() => {
    needMoreRef.current = onNeedMore
  })

  // En "Todo" una página nueva de playlists o álbumes entra por delante de lo que se está viendo. La ventana
  // sale del scroll, no de las tarjetas, así que se desplaza el scroll las filas que se movió una tarjeta de
  // referencia (la del centro de la ventana) y lo visible no salta. Arriba del todo no hay nada que compensar.
  useLayoutEffect(() => {
    const anchor = anchorRef.current
    if (anchor && entries[anchor.index]?.id !== anchor.id) {
      const rows = anchorShiftRows({ columns, from: anchor.index, to: entries.findIndex((entry) => entry.id === anchor.id) })
      if (rows) shiftScroll(rows * (rowHeight + GRID_ROW_GAP))
    }
    const index = start + Math.floor((end - start) / 2)
    anchorRef.current = start > 0 && entries[index] ? { id: entries[index].id, index } : null
  })

  // Cuando la ventana llega a las últimas filas cargadas se pide la página siguiente; al terminar esa
  // petición se vuelve a comprobar (una página sin tarjetas nuevas no detiene la carga).
  const nearEnd = isNearEnd({ columns, end, total: entries.length })
  useEffect(() => {
    if (nearEnd && serverHasMore && !loading) needMoreRef.current?.()
  }, [entries.length, loading, nearEnd, serverHasMore])

  // Artistas: la misma tarjeta que la página Artistas (retrato 3:4 con degradado del color de la foto).
  if (isArtist) {
    return (
      <div className="lib-grid" ref={ref} tabIndex={-1} style={{ '--lib-row': `${rowHeight}px`, '--lib-row-gap': `${GRID_ROW_GAP}px`, '--lib-card-w': `${cardWidth}px`, '--lib-cols': columns || 'auto-fill', paddingBottom: padBottom, paddingTop: padTop }}>
        <ul className="lib-grid__artists" aria-label={title}>
          {shown.map((entry) => {
            const songs = artistCounts?.songs.get(entry.id) ?? 0
            return (
              <ArtistCard
                albumCount={artistCounts?.albums.get(entry.id) || undefined}
                artist={{ artistId: entry.id, artwork: sizedImage(entry.thumbnail, cardWidth), meta: songs ? `${songs} ${songs === 1 ? 'canción' : 'canciones'}` : spanishCount(entry.subtitle ?? 'Artista'), title: entry.name ?? entry.title }}
                key={entry.id}
                onOpen={() => onOpen(entry)}
              />
            )
          })}
        </ul>
      </div>
    )
  }

  return (
    <div className="lib-grid" ref={ref} tabIndex={-1} style={{ '--lib-row': `${rowHeight}px`, '--lib-row-gap': `${GRID_ROW_GAP}px`, '--lib-card-w': `${cardWidth}px`, '--lib-cols': columns || 'auto-fill', paddingBottom: padBottom, paddingTop: padTop }}>
      <HomeRail
        // La tarjeta mide justo cardWidth: la carátula se pide al escalón de ese hueco, como en el inicio.
        artworkSize={cardWidth}
        items={items}
        onArtistSelect={controller.openArtist}
        onIntent={(item) => { const kind = kindOf(item); if (kind && kind !== 'special') prefetchHandlers(kind, item.id).start?.() }}
        onIntentEnd={(item) => { const kind = kindOf(item); if (kind && kind !== 'special') prefetchHandlers(kind, item.id).stop?.() }}
        onSelect={(id) => onOpen(byId.get(id))}
        renderMenu={(item) => {
          const entry = byId.get(item.id)
          return entry && entry.kind !== 'special' ? <CardMenu ctx={controller} entry={entry} title={item.title} /> : null
        }}
        title={title}
        variant={variant}
        wrap
      />
    </div>
  )
}

/**
 * Biblioteca: reutiliza las tarjetas del inicio. "Todo" junta playlists, álbumes y artistas en una sola cuadrícula
 * sin segmentar; cada pestaña filtra un tipo. La cuadrícula está ventaneada. El tamaño de las tarjetas es el de
 * "Editar inicio", igual que en el inicio.
 */
// Categorías del servidor que alimentan cada pestaña, en el orden en que se piden.
const TAB_KINDS = {
  all: ['playlists', 'albums', 'artists', 'uploads', 'subscriptions'],
  albums: ['albums'],
  artists: ['artists', 'subscriptions'],
  playlists: ['playlists'],
  uploads: ['uploads'],
}

export default function LibraryView({ controller, data, renderSongs }) {
  const { downloads, libraryStatus, loadMoreLibrary, officialLibraryBusy, openAlbum, openArtist, openPlaylist, playSongs, syncOfficialLibrary } = controller
  const meta = controller.libraryMeta ?? emptyMeta()
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
  const tabs = LIBRARY_TABS.filter((item) => item.id !== 'uploads' || library.totals.uploads > 0)
  const activeTab = tabs.some((item) => item.id === tab) ? tab : 'all'
  const searchable = activeTab !== 'downloads'
  const tabKinds = TAB_KINDS[activeTab] ?? []
  const serverHasMore = tabKinds.some((kind) => meta.hasMore[kind] && !meta.errors[kind])
  const serverLoading = tabKinds.some((kind) => meta.loading[kind])
  const needMore = () => {
    const kind = nextKindToLoad(meta, tabKinds)
    if (kind) loadMoreLibrary?.(kind)
  }
  // Al buscar o filtrar hay que mirar en toda la biblioteca: se traen las páginas que faltan, una tras otra.
  useEffect(() => {
    if (query.trim() && searchable) needMore()
  })
  const sectionErrors = Object.keys(meta.errors)

  function open(entry) {
    if (!entry) return
    // Los Me gusta se abren como una playlist (una canción por fila), no como un bloque de tarjetas.
    if (entry.id === LIKED_ID) controller.openLiked?.()
    else if (entry.id === REPEAT_ID) playSongs(repeat, repeat[0].id)
    else if (entry.kind === 'playlist') openPlaylist(entry.id)
    else if (entry.kind === 'album') openAlbum(entry.id)
    else if (entry.kind === 'artist') openArtist(entry.id)
  }

  const playlistEntries = [...library.pinned, ...library.playlists]
  const sections = [
    { entries: playlistEntries, key: 'playlists', title: 'Playlists' },
    { entries: library.albums, key: 'albums', title: 'Álbumes' },
    { entries: library.artists, key: 'artists', title: 'Artistas', variant: 'artist' },
    { entries: library.uploads, key: 'uploads', title: 'Subidos' },
  ]
  const everything = { entries: [...playlistEntries, ...library.albums, ...library.artists, ...library.uploads], key: 'all', title: 'Biblioteca' }
  const visibleSections = activeTab === 'all' ? [everything] : sections.filter((section) => section.key === activeTab)
  const nothingFound = searchable && visibleSections.every((section) => section.entries.length === 0)
  const sizing = GRID_SIZING
  // Álbumes y canciones guardadas por artista, para el detalle de la tarjeta de artista.
  const artistCounts = useMemo(() => {
    const count = (items) => items.reduce((map, item) => (item.artistId ? map.set(item.artistId, (map.get(item.artistId) ?? 0) + 1) : map), new Map())
    return { albums: count(data.albums ?? []), songs: count(data.likedSongs ?? []) }
  }, [data.albums, data.likedSongs])

  return (
    <div className="home-page lib-page">
      <div className="lib-page__head">
        <h1 className="lib-page__title">Biblioteca</h1>
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
          <button className="artists-page__pill" type="button" disabled={officialLibraryBusy} onClick={() => syncOfficialLibrary({ fresh: true, show: false })} title="Volver a traer tus Me gusta y playlists de YouTube Music">
            <RefreshCw className={officialLibraryBusy ? 'yt-spin' : undefined} size={15} strokeWidth={1.8} aria-hidden="true" /> Sincronizar
          </button>
        </div>
      </div>

      <div className="lib-page__row">
        <div className="lib-tabs" role="tablist" aria-label="Secciones de la biblioteca">
          {tabs.map((item) => (
            <button type="button" role="tab" aria-selected={activeTab === item.id} key={item.id} onClick={() => setTab(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {(libraryStatus?.error || sectionErrors.length > 0) && (
        <div className="yt-notice" role="status">
          <span>{libraryStatus?.error ? 'No se pudo actualizar tu biblioteca. Mostrando lo último guardado.' : 'No se pudo cargar una parte de tu biblioteca.'}</span>
          <button type="button" onClick={() => syncOfficialLibrary({ fresh: true, show: false })}>Reintentar</button>
        </div>
      )}

      {activeTab === 'downloads' && renderSongs(downloaded, 'Descargas')}

      {visibleSections.map((section) => (
        <VirtualGrid
          artistCounts={artistCounts}
          controller={controller}
          entries={section.entries}
          key={`${section.key}-${query}-${sortAZ}`}
          loading={serverLoading}
          onNeedMore={needMore}
          onOpen={open}
          serverHasMore={serverHasMore}
          sizing={sizing}
          title={section.title}
          variant={section.variant}
        />
      ))}

      {nothingFound && (
        <p className="collection-empty" role="status">{query ? 'No encontramos nada con esa búsqueda.' : 'Aún no hay nada en esta sección.'}</p>
      )}
    </div>
  )
}