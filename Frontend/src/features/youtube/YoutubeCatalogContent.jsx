import { Check, Copy, ExternalLink, LayoutGrid, Library, Link2, Link2Off, LoaderCircle, UserRound, WifiOff } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ArtistSongsView from '../collections/ArtistSongsView.jsx'
import ArtistView from '../collections/ArtistView.jsx'
import CollectionDetailView from '../collections/CollectionDetailView.jsx'
import CatalogSearchControls from '../discovery/CatalogSearchControls.jsx'
import HomeRail from '../discovery/HomeRail.jsx'
import CommunityShelf from './CommunityShelf.jsx'
import LibraryView from './LibraryView.jsx'
import QuickAccess from './QuickAccess.jsx'
import { filterShelves, useBlockList } from './blockList.js'
import { ctxMenu } from './contextMenuStore.js'
import { shortcutKey, usePinnedShortcuts } from './quickAccessStore.js'
import { LIKED_INDEX_ID, notePlaylistContents, useAddedAt } from './playlistIndex.js'
import { noteCollectionPlay, readRecentListens, withListenAgain } from './recentListens.js'
import { carryMissing, mergeShelves } from './homeMore.js'
import useHomeMood from './useHomeMood.js'
import { landingCache, NO_SHELVES } from './landingCache.js'
import useHomeMore from './useHomeMore.js'
import './landing-states.css'
import { CardMenu } from './ItemMenus.jsx'
import { applyHomeLayout, CARD_SIZES, chooseShelfLayout, DEFAULT_LAYOUT, layoutKeepingSeen } from './homeLayout.js'
import ArtistCard from '../discovery/ArtistCard.jsx'
import { sizedImage } from '../../lib/imageSize.js'
import { artistMeta } from './artistMeta.js'
import './library-view.css'
import useVirtualGrid from './useVirtualGrid.js'
import { artistGridSizing, GRID_ROW_GAP } from './virtualGrid.js'
import { SectionIcon, SeeAllButton, ShelfHeading, SongShelf, TileShelf } from './ShelfLayouts.jsx'
import { prefetchHandlers } from './prefetchDetail.js'
import { translateShelfTitle } from './shelfTitles.js'
import useHomeLayout from './useHomeLayout.js'
import SongList from '../discovery/SongList.jsx'
import { adaptAlbum, adaptArtist, adaptBrowseItem, adaptReleases, adaptSong } from './lib/adapters.js'

const HomeLayoutPanel = lazy(() => import('./HomeLayoutPanel.jsx'))

const LISTEN_AGAIN_KINDS = new Set(['song', 'album', 'playlist'])
const ignorePreview = () => {}
const EMPTY_SONGS = []

function SongResults({ controller, hasMore, loadingMore, onLoadMore, sourceSongs, title = 'Canciones' }) {
  const { likedSongIds, openAlbum, openArtist, player, playSongs, renderSongActions, toggleSongFavorite } = controller
  return (
    <SongList
      emptyMessage="No se encontraron canciones."
      hasMore={hasMore}
      likedSongIds={likedSongIds}
      loadingMore={loadingMore}
      onAlbumSelect={openAlbum}
      onArtistSelect={openArtist}
      onLoadMore={onLoadMore}
      onPlaybackToggle={player.togglePlay}
      onPreviewStart={player.warmSong}
      onPreviewStop={ignorePreview}
      onSongSelect={(songId) => playSongs(sourceSongs, songId)}
      onToggleFavorite={toggleSongFavorite}
      preview={null}
      renderSongActions={renderSongActions}
      selectedSongId={player.currentSong?.id}
      selectedSongPlaying={player.isPlaying}
      songs={sourceSongs.map(adaptSong)}
      title={title}
    />
  )
}

function intentProps(kindOf) {
  return {
    onIntent: (item) => prefetchHandlers(kindOf(item), item.id).start?.(),
    onIntentEnd: (item) => prefetchHandlers(kindOf(item), item.id).stop?.(),
  }
}

const searchRailKind = (variant) => () => (variant === 'artist' ? 'artist' : 'album')
// Los resultados usan la tarjeta por defecto (--shelf-card: 148 px).
const SEARCH_RAIL_ARTWORK_PX = 148

function SearchRail({ emptyMessage, items, onItemContextMenu, onSelect, title, variant }) {
  if (!items) return null
  return <HomeRail artworkSize={SEARCH_RAIL_ARTWORK_PX} fitColumns emptyMessage={emptyMessage} items={items} onItemContextMenu={onItemContextMenu} onSelect={onSelect} title={title} variant={variant} {...intentProps(searchRailKind(variant))} />
}

// Artistas de la búsqueda: LA MISMA cuadrícula que la pestaña Artistas de la Biblioteca. Usa su misma medida
// (useVirtualGrid + artistGridSizing: 7 por fila, 6 con el reproductor abierto, tarjeta 3:4 que reparte el ancho), su
// mismo CSS (.lib-grid / .lib-grid__artists) y su mismo componente ArtistCard. Plegado muestra una fila; "Ver todo"
// despliega todos los resultados. Debe montarse ya con los artistas (la medida se toma al montar).
const SEARCH_ARTIST_PX = 220

function SearchArtists({ artists, emptyMessage, onOpen }) {
  const [expanded, setExpanded] = useState(false)
  const { cardWidth, columns, ref, rowHeight } = useVirtualGrid({ ...artistGridSizing(), aspect: 4 / 3, metaPx: 0, total: artists.length })
  const perRow = columns || artistGridSizing().columns
  const canExpand = artists.length > perRow
  return (
    <section className="home-shelf search-artists" aria-labelledby="search-artists-title">
      <ShelfHeading action={canExpand ? <SeeAllButton expanded={expanded} onToggle={() => setExpanded((open) => !open)} /> : undefined} id="search-artists-title" kind="artists" title="Artistas" />
      {artists.length === 0 && <p className="collection-empty">{emptyMessage}</p>}
      <div className="lib-grid" ref={ref} tabIndex={-1} style={{ '--lib-row': `${rowHeight}px`, '--lib-row-gap': `${GRID_ROW_GAP}px`, '--lib-card-w': `${cardWidth}px`, '--lib-cols': columns || 'auto-fill' }}>
        <ul className="lib-grid__artists" aria-label="Artistas">
          {(expanded ? artists : artists.slice(0, perRow)).map((artist) => (
            <ArtistCard
              artist={{ artistId: artist.id, artwork: sizedImage(artist.artwork, Math.max(SEARCH_ARTIST_PX, cardWidth)), meta: artistMeta(artist.meta, { short: true }), title: artist.title }}
              key={artist.id}
              onContextMenu={ctxMenu('artist', { id: artist.id, name: artist.title, thumbnail: artist.artwork })}
              onOpen={onOpen}
            />
          ))}
        </ul>
      </div>
    </section>
  )
}
function getGroupedResults(results) {
  if (results.type === 'all') return { songs: results.songs, artists: results.artists, albums: results.albums }
  return {
    songs: results.type === 'song' ? results.items : null,
    videos: results.type === 'video' ? results.items : null,
    artists: results.type === 'artist' ? results.items : null,
    albums: results.type === 'album' ? results.items : null,
  }
}

function SearchResults({ controller }) {
  const { browse, openAlbum, openArtist, searchType } = controller
  if (!browse.results) return <div className="collection-empty">Busca canciones, vídeos, artistas o álbumes para comenzar.</div>
  // Un servidor sin soporte de vídeos responde la pestaña "Vídeos" como si fuera de canciones: se avisa en vez de mezclarlas.
  if (searchType === 'video' && browse.results.type !== 'video') {
    return <div className="collection-empty" role="status">La búsqueda de vídeos aún no está disponible en el servidor.</div>
  }
  const grouped = getGroupedResults(browse.results)

  return (
    <>
      {grouped.songs && <SongResults controller={controller} sourceSongs={grouped.songs} />}
      {grouped.videos && <SongResults controller={controller} sourceSongs={grouped.videos} title="Vídeos" />}
      {grouped.artists && <SearchArtists artists={grouped.artists.map(adaptArtist)} emptyMessage={browse.results.pending?.includes('artist') ? 'Cargando artistas…' : 'No se encontraron artistas.'} onOpen={openArtist} />}
      <SearchRail items={grouped.albums?.map(adaptAlbum)} onItemContextMenu={(item, event) => ctxMenu('album', grouped.albums.find((album) => album.id === item.id))(event)} onSelect={openAlbum} title="Álbumes" emptyMessage={browse.results.pending?.includes('album') ? 'Cargando álbumes…' : 'No se encontraron álbumes.'} />
    </>
  )
}

function AccountIntro({ account, pending }) {
  let title = 'Conecta YouTube Music'
  let description = 'Añade una sesión verificada para usar tus recomendaciones reales y descargar canciones de Mysic Global.'
  if (pending) {
    title = 'Autoriza este dispositivo'
    description = 'Abre YouTube, inicia sesión si hace falta e introduce el código temporal.'
  }
  if (account?.connected) {
    title = 'Tu Inicio real de YouTube Music está conectado'
    description = 'La sesión fue comprobada. Inicio, radios, recomendaciones y descargas ya usan esta cuenta.'
  }
  return <div className="yt-account-help__copy"><strong>{title}</strong><p>{description}</p></div>
}

function AccountCode({ account }) {
  const [copiedCode, setCopiedCode] = useState('')
  async function copyCode() {
    try {
      await navigator.clipboard.writeText(account.userCode)
      setCopiedCode(account.userCode)
    } catch {
      setCopiedCode('error')
    }
  }
  return (
    <>
      <div className="yt-account-code" role="status">
        <span>{account.userCode}</span>
        <button type="button" onClick={copyCode}><Copy size={15} aria-hidden="true" /> {copiedCode === account.userCode ? 'Copiado' : 'Copiar'}</button>
      </div>
      {copiedCode === 'error' && <p className="yt-account-help__error" role="alert">No se pudo copiar. Selecciona el código manualmente.</p>}
    </>
  )
}

function MusicSessionForm({ busy, onConnect }) {
  const [requestText, setRequestText] = useState('')
  async function submit(event) {
    event.preventDefault()
    if (await onConnect(requestText)) setRequestText('')
  }
  return (
    <form className="yt-account-session" onSubmit={submit}>
      <ol>
        <li>Abre una ventana privada, entra en <a href="https://music.youtube.com" target="_blank" rel="noreferrer">music.youtube.com</a> e inicia sesión con la cuenta correcta.</li>
        <li>En DevTools → Red → Fetch/XHR, recarga la página y elige <code>account_menu</code>, <code>browse</code> o <code>next</code>.</li>
        <li>Clic derecho sobre la solicitud → Copiar → Copiar como cURL, y pégala aquí.</li>
        <li>Cuando Mysic confirme la conexión, cierra la ventana privada.</li>
      </ol>
      <label htmlFor="yt-music-request">Solicitud de YouTube Music</label>
      <textarea id="yt-music-request" value={requestText} onChange={(event) => setRequestText(event.target.value)} autoComplete="off" spellCheck="false" placeholder="curl 'https://music.youtube.com/youtubei/v1/account/account_menu?...' ..." />
      <div className="yt-account-session__footer">
        <span>Contiene una sesión sensible: equivale a acceso a tu cuenta. Mysic extrae la cookie y los selectores de cuenta, los cifra y no conserva este texto en el navegador.</span>
        <button className="yt-account-action yt-account-action--primary" type="submit" disabled={busy || !requestText.trim()}>{busy ? <LoaderCircle className="yt-spin" size={16} aria-hidden="true" /> : <UserRound size={16} aria-hidden="true" />} Verificar y conectar</button>
      </div>
    </form>
  )
}

function DesktopSessionConnect({ busy, onConnect }) {
  return (
    <div className="yt-account-session">
      <p>Se abrirá una ventana segura de Google. Mysic detectará la sesión al llegar a YouTube Music y la enviará cifrada al servidor después de verificarla.</p>
      <div className="yt-account-session__footer">
        <span>La contraseña y la verificación en dos pasos se introducen únicamente en la página de Google.</span>
        <button className="yt-account-action yt-account-action--primary" type="button" disabled={busy} onClick={onConnect}>{busy ? <LoaderCircle className="yt-spin" size={16} aria-hidden="true" /> : <UserRound size={16} aria-hidden="true" />} Iniciar sesión con YouTube Music</button>
      </div>
    </div>
  )
}

function AccountActions({ account, busy, onDisconnect, pending }) {
  if (account?.connected) {
    return <div className="yt-account-help__actions"><span className="yt-account-connected"><Check size={15} aria-hidden="true" /> Vinculación activa</span><button className="yt-account-action" type="button" disabled={busy} onClick={onDisconnect}><Link2Off size={15} aria-hidden="true" /> Desvincular</button></div>
  }
  if (pending) {
    return <div className="yt-account-help__actions"><a className="yt-account-action yt-account-action--primary" href={account.verificationUrl} target="_blank" rel="noreferrer">Abrir YouTube <ExternalLink size={15} aria-hidden="true" /></a></div>
  }
  return null
}

function AccountHelp({ account, busy, desktopSession, error, onConnect, onDesktopConnect, onDisconnect, open }) {
  const pending = account?.status === 'pending'

  return (
    <div className={`yt-account-help${open ? ' yt-account-help--open' : ''}`} id="yt-account-help" inert={!open}>
      <div>
        <AccountIntro account={account} pending={pending} />
        {pending && <AccountCode account={account} />}
        <AccountActions account={account} busy={busy} onDisconnect={onDisconnect} pending={pending} />
        {!account?.connected && !pending && (desktopSession
          ? <DesktopSessionConnect busy={busy} onConnect={onDesktopConnect} />
          : <MusicSessionForm busy={busy} onConnect={onConnect} />)}
        {error && <p className="yt-account-help__error" role="alert">{error}</p>}
      </div>
    </div>
  )
}

function getCatalogHeading(kind, personalized) {
  if (kind === 'official-library') return 'Tu biblioteca de YouTube'
  if (kind === 'explore') return 'Explorar'
  if (kind === 'home') return personalized ? 'Hecho para ti' : 'Descubre música'
  if (kind === 'recommendations') return personalized ? 'Recomendado para ti' : 'Música relacionada'
  return 'Mysic global'
}

// Sin pastillas de Inicio/Explorar/Recomendado/Descargas: solo queda el indicador de la biblioteca.
function CatalogTabs({ browse }) {
  if (!(browse.view.data && browse.view.kind === 'official-library')) return null
  return (
    <nav className="yt-hub__navigation" aria-label="Navegación de YouTube Music">
      <button className="is-active" type="button"><Library size={16} aria-hidden="true" /> Biblioteca</button>
    </nav>
  )
}

// `children` va en la misma fila que el botón de editar (en el Inicio, las pastillas de estado de ánimo).
function CatalogNavigation({ children, controller, editingHome = false, onEditHome }) {
  const { account, accountError, accountNotice, actionError, browse, changeTab, downloads, retryAccount, searchType, showDownloads } = controller
  const showingDownloads = browse.view.kind === 'downloads'
  const heading = getCatalogHeading(browse.view.kind, account?.personalized)

  return (
    <header className="yt-hub">
      <h1 className="sr-only">{heading}</h1>
      {accountError && <div className="collection-empty" role="alert">{accountError}</div>}
      {accountNotice && <Notice onAction={retryAccount}>{accountNotice}</Notice>}
      <div className="yt-hub__tabs-row">
        {onEditHome && <button className="yt-edit-home" type="button" aria-label="Editar inicio" aria-expanded={editingHome} title="Editar inicio" onClick={onEditHome}><LayoutGrid size={16} aria-hidden="true" /></button>}
        <CatalogTabs browse={browse} />
        {children}
      </div>
      {actionError && <div className="collection-empty" role="alert">{actionError}</div>}
      {(browse.view.kind === 'search' || showingDownloads) && (
        <CatalogSearchControls activeType={searchType} includeVideos downloadsActive={showingDownloads} downloadsLabel={`Descargas${downloads.downloads.items.length ? ` (${downloads.downloads.items.length})` : ''}`} onDownloadsSelect={showDownloads} onQueryChange={browse.setQuery} onSubmit={() => browse.runSearch(browse.query, searchType)} onTypeSelect={changeTab} query={browse.query} showField={false} showDownloads={false} />
      )}
    </header>
  )
}

// Lado (px CSS) de una tarjeta de carrusel: es fijo (--shelf-card), así que la carátula se pide justo a ese tamaño.
const railArtworkPx = (cardSize) => (CARD_SIZES[cardSize] ?? CARD_SIZES[DEFAULT_LAYOUT.cardSize]).min

function BrowseShelves({ artworkSize = railArtworkPx(DEFAULT_LAYOUT.cardSize), controller, shelves }) {
  const { openAlbum, openArtist, openPlaylist, player, playSongRadio, playSongs, startPlaylist } = controller
  if (!shelves.length) return <div className="collection-empty">No hay recomendaciones disponibles por ahora.</div>

  // Misma lógica de selección para cualquier formato: una canción suena, lo demás se abre.
  const selectItem = (shelf, id) => {
    const item = shelf.items.find((entry) => entry.id === id)
    if (item?.kind === 'song') playSongRadio(shelf.items.filter((entry) => entry.kind === 'song'), id)
    if (item?.kind === 'artist') openArtist(id)
    if (item?.kind === 'album') openAlbum(id)
    if (item?.kind === 'playlist') openPlaylist(id)
  }

  return shelves.map((shelf) => {
    const key = `${shelf.title}-${shelf.items[0]?.id}`
    const title = translateShelfTitle(shelf.title)
    const kind = chooseShelfLayout(shelf)
    // Clic derecho sobre cualquier tarjeta de la sección: menú según el tipo del elemento original.
    const openItemMenu = (item, event) => {
      const entry = shelf.items.find((candidate) => candidate.id === item.id)
      if (entry) ctxMenu(entry.kind, entry)(event)
    }
    if (kind === 'community') {
      return <CommunityShelf currentSongId={player.currentSong?.id} items={shelf.items.map(adaptBrowseItem)} key={key} onItemContextMenu={openItemMenu} onOpen={openPlaylist} onPlayPlaylist={startPlaylist} onPlaySong={playSongs} title={title} />
    }
    if (kind === 'songs') return <SongShelf controller={controller} items={shelf.items} key={key} title={title} />
    if (kind === 'tiles') {
      // "Volver a escuchar" son tus últimas escuchas: solo canciones, álbumes y playlists (nada de artistas ni canales).
      const listened = shelf.items.filter((entry) => LISTEN_AGAIN_KINDS.has(entry.kind))
      if (!listened.length) return null
      return <TileShelf controller={controller} entries={listened} items={listened.map(adaptBrowseItem)} key={key} onAlbumSelect={openAlbum} onArtistSelect={openArtist} onItemContextMenu={openItemMenu} onSelect={(item) => selectItem(shelf, item.id)} selectedId={player.currentSong?.id} title={title} />
    }
    return (
      <HomeRail
        artworkSize={artworkSize}
        fitColumns
        icon={<SectionIcon kind={kind} />}
        items={shelf.items.map(adaptBrowseItem)}
        key={key}
        {...intentProps((item) => shelf.items.find((entry) => entry.id === item.id)?.kind)}
        onArtistSelect={openArtist}
        onDetailSelect={openAlbum}
        onItemContextMenu={openItemMenu}
        onPlaybackToggle={player.togglePlay}
        onSelect={(id) => selectItem(shelf, id)}
        renderMenu={(item) => {
          const entry = shelf.items.find((candidate) => candidate.id === item.id)
          return entry ? <CardMenu ctx={controller} entry={entry} title={item.title} /> : null
        }}
        selectedId={player.currentSong?.id}
        selectedItemPlaying={player.isPlaying}
        title={title}
        variant={kind === 'artists' ? 'artist' : 'default'}
      />
    )
  })
}
// Esqueleto de la portada mientras no hay nada que mostrar (arranque en frío). Nunca una cuenta falsa ni un hueco.
function FeedSkeleton({ label = 'Cargando recomendaciones' }) {
  return <div className="home-page yt-landing"><div className="yt-feed-skeleton" role="status" aria-label={label}><i /><i /><i /></div></div>
}

// Aviso discreto con reintento: la información que ya se ve se conserva.
function Notice({ actionLabel = 'Reintentar', children, onAction }) {
  return (
    <div className="yt-notice" role="status">
      <span>{children}</span>
      {onAction && <button type="button" onClick={onAction}>{actionLabel}</button>}
    </div>
  )
}

/** Final del Inicio: pide la siguiente página al acercarse; un fallo detiene la carga automática y ofrece reintentar. */
function HomeMoreFooter({ more, onReload }) {
  const sentinelRef = useRef(null)
  const { autoload, loadMore, pages } = more
  useEffect(() => {
    const node = sentinelRef.current
    if (!node || !autoload) return undefined
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) loadMore()
    }, { rootMargin: '700px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [autoload, loadMore, pages])

  if (more.status === 'failed') {
    const expired = more.failure === 'expired'
    return <Notice actionLabel={expired ? 'Actualizar Inicio' : 'Reintentar'} onAction={expired ? onReload : loadMore}>{expired ? 'Esta parte del Inicio caducó.' : 'No se pudieron cargar más secciones.'}</Notice>
  }
  return more.hasMore ? <div className="yt-more-sentinel" ref={sentinelRef} aria-hidden="true" /> : null
}

// Orden en que el Inicio mostró sus secciones por alcance: al volver de otra sección se respeta en vez de reordenar.
const SEEN_ORDER = new Map()

/**
 * Fila de estados de ánimo del Inicio (como limusic): "Todo" es el Inicio normal y cada pastilla pide a YouTube el
 * Inicio filtrado por ese ánimo (`?filter=`). Volver a pulsar la activa también vuelve a "Todo". Se envía la etiqueta
 * original de la API; solo se traduce para mostrarla.
 */
function MoodChips({ filters, onSelect, selected }) {
  return (
    <div className="yt-moods" role="group" aria-label="Estados de ánimo">
      <button className={`yt-mood${selected ? '' : ' yt-mood--active'}`} type="button" aria-pressed={!selected} onClick={() => onSelect(null)}>Todo</button>
      {filters.map((filter) => (
        <button className={`yt-mood${selected === filter ? ' yt-mood--active' : ''}`} key={filter} type="button" aria-pressed={selected === filter} onClick={() => onSelect(selected === filter ? null : filter)}>{translateShelfTitle(filter)}</button>
      ))}
    </div>
  )
}

function LandingView({ controller }) {
  const { browse, landing } = controller
  const isHome = browse.view.kind === 'home'
  const { layout, reset, update } = useHomeLayout()
  const [editing, setEditing] = useState(false)
  const data = browse.view.data
  // Pastilla de estado de ánimo elegida: su Inicio filtrado reemplaza al normal (en el orden de YouTube, sin tu disposición).
  const [mood, setMood] = useState(null)
  const moodFeed = useHomeMood(isHome ? mood : null)
  const feed = mood ? moodFeed.data : data
  // Las páginas siguientes solo se piden sobre datos reales de esta visita (la copia guardada no trae token válido).
  const more = useHomeMore({
    enabled: isHome && Boolean(feed?.continuation) && (mood ? true : landing.source === 'live'),
    resetKey: feed,
    token: feed?.continuation,
  })
  // Secciones extra que ya se vieron en esta ejecución (por usuario y cuenta): al volver al Inicio desde Explorar, la
  // Biblioteca o un detalle, la primera página se vuelve a pedir, pero lo ya cargado se sigue mostrando (y se
  // actualiza al llegar páginas nuevas) en vez de desaparecer y reaparecer.
  const extrasScope = isHome && !mood ? landing.scope : null
  const carriedExtras = extrasScope ? landingCache.getExtras(extrasScope) : NO_SHELVES
  const rawShelves = useMemo(() => {
    if (mood) {
      if (!moodFeed.data?.shelves) return undefined
      return more.shelves.length ? mergeShelves(moodFeed.data.shelves, more.shelves) : moodFeed.data.shelves
    }
    if (!data?.shelves) return undefined
    const withCarried = carriedExtras.length ? carryMissing(data.shelves, carriedExtras) : data.shelves
    return more.shelves.length ? mergeShelves(withCarried, more.shelves) : withCarried
  }, [carriedExtras, data, mood, moodFeed.data, more.shelves])
  // Lo que trajo esta petición también se recuerda: YouTube reparte el Inicio distinto cada vez y no debe perderse.
  const liveShelves = landing.source === 'live' ? data?.shelves : undefined
  useEffect(() => {
    if (extrasScope && liveShelves?.length) landingCache.setExtras(extrasScope, carryMissing(liveShelves, landingCache.getExtras(extrasScope)))
  }, [extrasScope, liveShelves])
  useEffect(() => {
    if (extrasScope && more.shelves.length) landingCache.setExtras(extrasScope, mergeShelves(landingCache.getExtras(extrasScope), more.shelves))
  }, [extrasScope, more.shelves])
  // Orden y visibilidad solo en el inicio; Explorar y Recomendado muestran todo tal como llega.
  const seenKeys = useRef(extrasScope ? SEEN_ORDER.get(extrasScope) ?? [] : [])
  // "Volver a escuchar" sale de tus escuchas en este equipo (se leen al llegar un Inicio nuevo, no en cada canción,
  // para que el bloque no se reordene mientras lo miras) y nada bloqueado llega a pintarse.
  const pinned = usePinnedShortcuts()
  const blockList = useBlockList()
  const recents = useMemo(() => (isHome && data ? readRecentListens() : NO_SHELVES), [data, isHome])
  const shownShelves = useMemo(() => {
    const personal = isHome && !mood ? withListenAgain(rawShelves, recents, pinned.map((entry) => shortcutKey(entry.kind, entry.id))) : rawShelves
    return filterShelves(personal, blockList)
  }, [blockList, isHome, mood, pinned, rawShelves, recents])
  const applied = useMemo(() => {
    if (mood) return { sections: [], visible: shownShelves ?? [] }
    if (!isHome) return applyHomeLayout(shownShelves, DEFAULT_LAYOUT)
    const result = applyHomeLayout(shownShelves, layoutKeepingSeen(layout, seenKeys.current))
    seenKeys.current = result.sections.map((section) => section.key)
    if (extrasScope) SEEN_ORDER.set(extrasScope, seenKeys.current)
    return result
  }, [extrasScope, isHome, layout, mood, shownShelves])
  const closePanel = useCallback(() => setEditing(false), [])
  // Con el panel abierto se piden todas las páginas restantes (sin esperar a desplazarse): la lista debe estar completa.
  const { autoload: canLoadMore, loadMore: loadMoreShelves } = more
  useEffect(() => {
    if (editing && isHome && canLoadMore) loadMoreShelves()
  }, [editing, isHome, canLoadMore, loadMoreShelves, more.pages])

  return (
    <div className="home-page yt-landing" aria-busy={landing.refreshing || undefined} style={{ '--shelf-card': CARD_SIZES[layout.cardSize].css, '--shelf-card-min': `${CARD_SIZES[layout.cardSize].min}px` }}>
      <CatalogNavigation controller={controller} onEditHome={isHome ? () => setEditing((open) => !open) : undefined} editingHome={editing}>
        {isHome && data?.filters?.length > 0 && <MoodChips filters={data.filters} onSelect={setMood} selected={mood} />}
      </CatalogNavigation>
      {/* Con contenido a la vista, un fallo al refrescar es un aviso con reintento; sin contenido, un error normal. */}
      {browse.error && (data
        ? <Notice onAction={isHome ? browse.showHome : browse.view.kind === 'explore' ? browse.showExplore : undefined}>{browse.error}</Notice>
        : <div className="collection-empty" role="alert">{browse.error}</div>)}
      {/* Esqueleto solo si no hay nada que mostrar: con datos (reales o guardados) se refresca por detrás sin borrarlos. */}
      {browse.loading && !data && <div className="yt-feed-skeleton" role="status" aria-label="Cargando recomendaciones"><i /><i /><i /></div>}
      {isHome && !mood && <QuickAccess controller={controller} data={controller.libraryData} />}
      {mood && moodFeed.status === 'loading' && <div className="yt-feed-skeleton" role="status" aria-label="Cargando recomendaciones"><i /><i /><i /></div>}
      {mood && moodFeed.status === 'failed' && <Notice actionLabel="Reintentar" onAction={moodFeed.retry}>No se pudo cargar esta selección.</Notice>}
      {data && (!mood || moodFeed.data) && <BrowseShelves artworkSize={railArtworkPx(layout.cardSize)} controller={controller} shelves={applied.visible} />}
      {isHome && feed && <HomeMoreFooter more={more} onReload={mood ? moodFeed.retry : browse.showHome} />}
      {!browse.loading && !data && !browse.error && <div className="collection-empty">No hay contenido disponible por ahora.</div>}
      {editing && isHome && (
        <Suspense fallback={null}>
          <HomeLayoutPanel layout={layout} loadingMore={more.hasMore && more.status !== 'failed'} onChange={update} onClose={closePanel} onReset={() => { seenKeys.current = []; if (extrasScope) SEEN_ORDER.delete(extrasScope); reset() }} sections={applied.sections} />
        </Suspense>
      )}
    </div>
  )
}
function ConnectivityNotice({ online }) {
  return !online && <div className="collection-empty" role="status"><WifiOff aria-hidden="true" /> Sin conexión. Solo están disponibles las descargas.</div>
}

function SearchView({ controller }) {
  const { browse, downloads } = controller
  return <div className="home-page"><CatalogNavigation controller={controller} /><ConnectivityNotice online={downloads.online} />{browse.error && <div className="collection-empty" role="alert">{browse.error}</div>}{browse.loading && !browse.results ? <div className="collection-empty" role="status">Cargando canciones…</div> : <SearchResults controller={controller} />}</div>
}

function DownloadsView({ controller }) {
  const { browse, downloads } = controller
  return <div className="home-page"><CatalogNavigation controller={controller} /><ConnectivityNotice online={downloads.online} />{browse.error && <div className="collection-empty" role="alert">{browse.error}</div>}<SongResults controller={controller} sourceSongs={downloads.downloads.items} title="Descargas" /></div>
}

function OfficialLibraryView({ controller }) {
  return (
    <LibraryView
      controller={controller}
      data={controller.libraryData ?? controller.browse.view.data}
      renderSongs={(songs, title, paging) => <SongResults controller={controller} sourceSongs={songs} title={title} {...paging} />}
    />
  )
}

// La foto del artista llena todo el panel: se pide a mayor resolución (los hosts de Google aceptan el tamaño en la URL).
const enlargeArtistImage = (url) => (typeof url === 'string' ? url.replace(/=w\d+-h\d+/, '=w1080-h1080').replace(/=s\d+/, '=s1080') : url)

function ArtistDetail({ controller }) {
  const { browse, likedArtistIds, likedSongIds, openAlbum, openArtistSongs, player, playSongs, renderSongActions, toggleArtistFavorite, toggleSongFavorite } = controller
  const sourceSongs = browse.view.data.topSongs
  const artistDefaults = { artist: browse.view.data.name, artistId: browse.view.data.id }
  // El fondo del encabezado rota por las portadas de sus álbumes (nítidas); la foto del artista, casi siempre pequeña, solo se usa si no hay lanzamientos.
  const releases = adaptReleases(browse.view.data.shelves)
  const covers = [...new Set(releases.map((release) => release.artwork).filter(Boolean))].slice(0, 8).map(enlargeArtistImage)
  const artistPhotos = browse.view.data.images?.map((image) => enlargeArtistImage(image.url ?? image)).filter(Boolean)
  return <ArtistView artist={{ artistId: browse.view.data.id, artwork: covers[0] ?? enlargeArtistImage(browse.view.data.thumbnail), images: covers.length ? covers : artistPhotos, title: browse.view.data.name }} likedArtistIds={likedArtistIds} likedSongIds={likedSongIds} onAlbumSelect={openAlbum} onBack={controller.goBack} onPlaybackToggle={player.togglePlay} onReleasePlay={(release) => openAlbum(release.id)} onSongSelect={(songId) => playSongs(sourceSongs, songId)} onToggleArtistFavorite={toggleArtistFavorite} onToggleFavorite={toggleSongFavorite} onViewAllSongs={() => openArtistSongs(browse.view.data.id)} releases={releases} renderSongActions={renderSongActions} selectedSongId={player.currentSong?.id} selectedSongPlaying={player.isPlaying} songs={sourceSongs.map((song, index) => adaptSong(song, index, artistDefaults))} />
}

function ArtistSongsDetail({ controller }) {
  const { browse, openAlbum, player, playSongs } = controller
  const sourceSongs = browse.view.data.songs
  const artistDefaults = { artist: browse.view.data.name, artistId: browse.view.data.id }
  return <ArtistSongsView artistName={browse.view.data.name} onAlbumSelect={openAlbum} onBack={controller.goBack} onPlaybackToggle={player.togglePlay} onSongSelect={(songId) => playSongs(sourceSongs, songId)} selectedSongId={player.currentSong?.id} selectedSongPlaying={player.isPlaying} songs={sourceSongs.map((song, index) => adaptSong(song, index, artistDefaults))} />
}

function AlbumDetail({ controller }) {
  const { browse, downloads, likedAlbumIds, likedSongIds, openArtist, player, playSongs, renderSongActions, toggleAlbumFavorite, toggleSongFavorite } = controller
  const data = browse.view.data
  const sourceSongs = data.tracks
  // Reproducir desde aquí cuenta como escucha del álbum (para "Volver a escuchar"), no de cada canción suelta.
  const noteListen = () => noteCollectionPlay('album', data, sourceSongs)
  return <CollectionDetailView collection={{ albumId: data.id, artist: data.artist, artistArtwork: data.thumbnail, artistId: data.artistId, artwork: data.thumbnail, kind: 'Álbum', title: data.title, year: data.year }} collectionFavorite={likedAlbumIds.has(data.id)} likedSongIds={likedSongIds} onArtistSelect={openArtist} onBack={controller.goBack} onDownloadCollection={() => downloads.downloadMany(sourceSongs)} onPlaybackToggle={player.togglePlay} onShuffle={() => { noteListen(); controller.playShuffled(sourceSongs) }} onSongIntent={player.warmSong} onSongSelect={(songId) => { noteListen(); playSongs(sourceSongs, songId) }} onToggleCollectionFavorite={(liked) => toggleAlbumFavorite(data.id, liked)} onToggleFavorite={toggleSongFavorite} renderTrackActions={renderSongActions} selectedSongId={player.currentSong?.id} selectedSongPlaying={player.isPlaying} songs={sourceSongs.map(adaptSong)} />
}

// "Música que me gusta": una página de playlist (una canción por fila, con su artista y su álbum como enlaces), no un
// bloque de tarjetas. La lista completa la trae la sincronización de fondo (YoutubeView: syncLikedInBackground) y
// llega de una sola vez: la página no pide páginas ni crece mientras la miras.
function LikedSongsDetail({ controller }) {
  const { libraryData, libraryMeta, likedSongIds, openAlbum, openArtist, player, playSongs, renderSongActions, toggleSongFavorite } = controller
  const sourceSongs = libraryData?.likedSongs ?? EMPTY_SONGS
  const songs = useMemo(() => sourceSongs.map(adaptSong), [sourceSongs])
  // Solo la primera vez (sin lista completa guardada) se avisa de que la lista aún no está entera.
  const syncing = Boolean(libraryMeta?.hasMore?.['liked-songs'] && !libraryMeta?.errors?.['liked-songs'])
  const collection = useMemo(() => ({
    artist: 'YouTube Music',
    artwork: sourceSongs[0]?.thumbnail,
    description: syncing ? 'Sincronizando tus canciones con YouTube Music: la lista completa aparecerá en un momento.' : undefined,
    id: 'liked',
    kind: 'Playlist',
    title: 'Música que me gusta',
  }), [sourceSongs, syncing])
  const addedAt = useAddedAt(LIKED_INDEX_ID)
  return <CollectionDetailView addedAt={addedAt ?? undefined} table collection={collection} likedSongIds={likedSongIds} onAlbumSelect={openAlbum} onArtistSelect={openArtist} onBack={controller.goBack} onPlaybackToggle={player.togglePlay} onShuffle={() => controller.playShuffled(sourceSongs)} onSongSelect={(songId) => playSongs(sourceSongs, songId)} onToggleFavorite={toggleSongFavorite} renderTrackActions={renderSongActions} selectedSongId={player.currentSong?.id} selectedSongPlaying={player.isPlaying} selectedSongSource="youtube" songs={songs} />
}

function PlaylistDetail({ controller }) {
  const { browse, downloads, likedSongIds, openAlbum, openArtist, player, playSongs, renderSongActions, toggleSongFavorite } = controller
  const data = browse.view.data
  const sourceSongs = data.songs
  const noteListen = () => noteCollectionPlay('playlist', { id: data.id, subtitle: 'Playlist', thumbnail: data.thumbnail, title: data.title }, sourceSongs)
  // Fecha de adición (solo en tus playlists indexadas); al abrir una, su contenido actual pone al día el índice.
  const addedAt = useAddedAt(data.id)
  useEffect(() => { notePlaylistContents(data, sourceSongs) }, [data, sourceSongs])
  return <CollectionDetailView addedAt={addedAt ?? undefined} table collection={{ artist: 'YouTube Music', artwork: data.thumbnail, description: data.description, id: data.id, kind: 'Playlist', title: data.title }} likedSongIds={likedSongIds} onAlbumSelect={openAlbum} onArtistSelect={openArtist} onBack={controller.goBack} onDownloadCollection={() => downloads.downloadMany(sourceSongs)} onPlaybackToggle={player.togglePlay} onShuffle={() => { noteListen(); controller.playShuffled(sourceSongs) }} onSongIntent={player.warmSong} onSongSelect={(songId) => { noteListen(); playSongs(sourceSongs, songId) }} onToggleFavorite={toggleSongFavorite} renderTrackActions={renderSongActions} selectedSongId={player.currentSong?.id} selectedSongPlaying={player.isPlaying} selectedSongSource="youtube" songs={sourceSongs.map(adaptSong)} />
}

// Playlist de Mysic (creada aquí o importada de Spotify): misma página que las de YouTube Music, sin indexarla en la biblioteca.
function MysicPlaylistDetail({ controller }) {
  const { browse, downloads, likedSongIds, openAlbum, openArtist, player, playSongs, renderSongActions, toggleSongFavorite } = controller
  const data = browse.view.data
  const sourceSongs = data.songs
  const songs = useMemo(() => sourceSongs.map(adaptSong), [sourceSongs])
  return <CollectionDetailView table collection={{ artist: 'Mysic', artwork: data.thumbnail, description: data.description, id: data.id, kind: 'Playlist', title: data.title }} likedSongIds={likedSongIds} onAlbumSelect={openAlbum} onArtistSelect={openArtist} onBack={controller.goBack} onDownloadCollection={() => downloads.downloadMany(sourceSongs)} onPlaybackToggle={player.togglePlay} onShuffle={() => controller.playShuffled(sourceSongs)} onSongIntent={player.warmSong} onSongSelect={(songId) => playSongs(sourceSongs, songId)} onToggleFavorite={toggleSongFavorite} renderTrackActions={renderSongActions} selectedSongId={player.currentSong?.id} selectedSongPlaying={player.isPlaying} selectedSongSource="youtube" songs={songs} />
}

// Sin cuenta vinculada la portada no muestra nada más que este botón centrado. La vinculación en
// escritorio abre la ventana segura de Google; en la web se despliega el formulario de sesión.
function UnlinkedPrompt({ controller }) {
  const { account, accountBusy, accountError, accountHelpOpen, connectDesktopSession, connectMusicSession, desktopSessionAvailable, setAccountHelpOpen } = controller
  const pending = account?.status === 'pending'
  const showHelp = pending || (!desktopSessionAvailable && accountHelpOpen)
  return (
    <div className="home-page yt-landing">
      <div className="yt-connect">
        <button className="yt-connect__button" type="button" disabled={accountBusy} onClick={() => (desktopSessionAvailable ? connectDesktopSession() : setAccountHelpOpen((open) => !open))}>
          {accountBusy ? <LoaderCircle className="yt-spin" size={18} aria-hidden="true" /> : <Link2 size={18} aria-hidden="true" />}
          <span>Vincular YT Music</span>
        </button>
        {desktopSessionAvailable && accountError && <p className="yt-account-help__error" role="alert">{accountError}</p>}
      </div>
      {showHelp && <AccountHelp account={account} busy={accountBusy} desktopSession={desktopSessionAvailable} error={accountError} onConnect={connectMusicSession} onDesktopConnect={connectDesktopSession} open />}
    </div>
  )
}

export default function YoutubeCatalogContent({ controller }) {
  const kind = controller.browse.view.kind
  const isLanding = ['home', 'explore', 'recommendations'].includes(kind)
  // Un fallo en frío no deja la portada vacía ni pinta una cuenta nueva: esqueleto hasta confirmar la cuenta.
  if (controller.libraryOpening) return <FeedSkeleton label="Cargando biblioteca" />
  if (isLanding && controller.account === null) return <FeedSkeleton />
  if (isLanding && !controller.account.connected) return <UnlinkedPrompt controller={controller} />
  if (kind === 'search') return <SearchView controller={controller} />
  if (['home', 'explore', 'recommendations'].includes(kind)) return <LandingView controller={controller} />
  if (kind === 'artist') return <ArtistDetail controller={controller} />
  if (kind === 'artist-songs') return <ArtistSongsDetail controller={controller} />
  if (kind === 'album') return <AlbumDetail controller={controller} />
  if (kind === 'liked') return <LikedSongsDetail controller={controller} />
  if (kind === 'playlist') return <PlaylistDetail controller={controller} />
  if (kind === 'mysic-playlist') return <MysicPlaylistDetail controller={controller} />
  if (kind === 'downloads') return <DownloadsView controller={controller} />
  if (kind === 'official-library') return <OfficialLibraryView controller={controller} />
  return null
}
