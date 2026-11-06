import { Check, Compass, Copy, Download, ExternalLink, Heart, Headphones, LayoutGrid, Library, Link2, Link2Off, ListMusic, LoaderCircle, Play, Sparkles, UserRound, WifiOff } from 'lucide-react'
import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import ArtistSongsView from '../collections/ArtistSongsView.jsx'
import ArtistView from '../collections/ArtistView.jsx'
import CollectionDetailView from '../collections/CollectionDetailView.jsx'
import CatalogSearchControls from '../discovery/CatalogSearchControls.jsx'
import HomeRail from '../discovery/HomeRail.jsx'
import CommunityShelf from './CommunityShelf.jsx'
import { applyHomeLayout, CARD_SIZES, DEFAULT_LAYOUT, shelfKey } from './homeLayout.js'
import { prefetchHandlers } from './prefetchDetail.js'
import { translateShelfTitle } from './shelfTitles.js'
import useHomeLayout from './useHomeLayout.js'
import SongList from '../discovery/SongList.jsx'
import { adaptAlbum, adaptArtist, adaptBrowseItem, adaptReleases, adaptSong } from './lib/adapters.js'

const HomeLayoutPanel = lazy(() => import('./HomeLayoutPanel.jsx'))

const ignorePreview = () => {}

function SongResults({ controller, sourceSongs, title = 'Canciones' }) {
  const { likedSongIds, onAddToPlaylist, openAlbum, openArtist, player, playSongs, renderSongActions, toggleSongFavorite } = controller
  return (
    <SongList
      emptyMessage="No se encontraron canciones."
      likedSongIds={likedSongIds}
      onAddToPlaylist={onAddToPlaylist}
      onAlbumSelect={openAlbum}
      onArtistSelect={openArtist}
      onPlaybackToggle={player.togglePlay}
      onPreviewStart={ignorePreview}
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

function SearchRail({ emptyMessage, items, onSelect, title, variant }) {
  if (!items) return null
  return <HomeRail emptyMessage={emptyMessage} items={items} onSelect={onSelect} title={title} variant={variant} {...intentProps(searchRailKind(variant))} />
}

function getGroupedResults(results) {
  if (results.type === 'all') return { songs: results.songs, artists: results.artists, albums: results.albums }
  return {
    songs: results.type === 'song' ? results.items : null,
    artists: results.type === 'artist' ? results.items : null,
    albums: results.type === 'album' ? results.items : null,
  }
}

function SearchResults({ controller }) {
  const { browse, openAlbum, openArtist } = controller
  if (!browse.results) return <div className="collection-empty">Busca canciones, artistas o álbumes para comenzar.</div>
  const grouped = getGroupedResults(browse.results)

  return (
    <>
      {grouped.songs && <SongResults controller={controller} sourceSongs={grouped.songs} />}
      <SearchRail items={grouped.artists?.map(adaptArtist)} onSelect={openArtist} title="Artistas" variant="artist" emptyMessage={browse.results.pending?.includes('artist') ? 'Cargando artistas…' : 'No se encontraron artistas.'} />
      <SearchRail items={grouped.albums?.map(adaptAlbum)} onSelect={openAlbum} title="Álbumes" emptyMessage={browse.results.pending?.includes('album') ? 'Cargando álbumes…' : 'No se encontraron álbumes.'} />
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

function CatalogTabs({ browse, downloads, player, showDownloads, showingDownloads }) {
  return (
    <nav className="yt-hub__navigation" aria-label="Navegación de YouTube Music">
      <button className={browse.view.kind === 'home' ? 'is-active' : ''} type="button" onClick={browse.showHome}><Headphones size={16} aria-hidden="true" /> Inicio</button>
      <button className={browse.view.kind === 'explore' ? 'is-active' : ''} type="button" onClick={browse.showExplore}><Compass size={16} aria-hidden="true" /> Explorar</button>
      {player.currentSong && <button className={browse.view.kind === 'recommendations' ? 'is-active' : ''} type="button" onClick={() => browse.showRecommendations(player.currentSong.id)}><Sparkles size={16} aria-hidden="true" /> Recomendado</button>}
      <button className={showingDownloads ? 'is-active' : ''} type="button" onClick={showDownloads}><Download size={16} aria-hidden="true" /> Descargas{downloads.downloads.items.length ? ` (${downloads.downloads.items.length})` : ''}</button>
      {browse.view.data && browse.view.kind === 'official-library' && <button className="is-active" type="button"><Library size={16} aria-hidden="true" /> Biblioteca</button>}
    </nav>
  )
}

function CatalogNavigation({ controller, editingHome = false, onEditHome }) {
  const { account, accountError, actionError, browse, changeTab, downloads, player, searchType, showDownloads } = controller
  const showingDownloads = browse.view.kind === 'downloads'
  const heading = getCatalogHeading(browse.view.kind, account?.personalized)

  return (
    <header className="yt-hub">
      <h1 className="sr-only">{heading}</h1>
      {accountError && <div className="collection-empty" role="alert">{accountError}</div>}
      <div className="yt-hub__tabs-row">
        {onEditHome && <button className="yt-edit-home" type="button" aria-label="Editar inicio" aria-expanded={editingHome} title="Editar inicio" onClick={onEditHome}><LayoutGrid size={16} aria-hidden="true" /></button>}
        <CatalogTabs browse={browse} downloads={downloads} player={player} showDownloads={showDownloads} showingDownloads={showingDownloads} />
      </div>
      {actionError && <div className="collection-empty" role="alert">{actionError}</div>}
      {(browse.view.kind === 'search' || showingDownloads) && (
        <CatalogSearchControls activeType={searchType} downloadsActive={showingDownloads} downloadsLabel={`Descargas${downloads.downloads.items.length ? ` (${downloads.downloads.items.length})` : ''}`} onDownloadsSelect={showDownloads} onQueryChange={browse.setQuery} onSubmit={() => browse.runSearch(browse.query, searchType)} onTypeSelect={changeTab} query={browse.query} showField={false} showDownloads={false} />
      )}
    </header>
  )
}

const COMMUNITY_KEY = 'de la comunidad'

function BrowseShelves({ controller, shelves }) {
  const { openAlbum, openArtist, openPlaylist, player, playSongs, startPlaylist } = controller
  if (!shelves.length) return <div className="collection-empty">No hay recomendaciones disponibles por ahora.</div>
  return shelves.map((shelf) => (shelfKey(shelf.title) === COMMUNITY_KEY && shelf.items.every((item) => item.kind === 'playlist')
    ? (
      <CommunityShelf
        currentSongId={player.currentSong?.id}
        items={shelf.items.map(adaptBrowseItem)}
        key={`${shelf.title}-${shelf.items[0]?.id}`}
        onOpen={openPlaylist}
        onPlayPlaylist={startPlaylist}
        onPlaySong={playSongs}
        title={translateShelfTitle(shelf.title)}
      />
    )
    : <HomeRail
      items={shelf.items.map(adaptBrowseItem)}
      key={`${shelf.title}-${shelf.items[0]?.id}`}
      {...intentProps((item) => shelf.items.find((entry) => entry.id === item.id)?.kind)}
      onArtistSelect={openArtist}
      onDetailSelect={openAlbum}
      onPlaybackToggle={player.togglePlay}
      onSelect={(id) => {
        const item = shelf.items.find((entry) => entry.id === id)
        if (item?.kind === 'song') playSongs(shelf.items.filter((entry) => entry.kind === 'song'), id)
        if (item?.kind === 'artist') openArtist(id)
        if (item?.kind === 'album') openAlbum(id)
        if (item?.kind === 'playlist') openPlaylist(id)
      }}
      selectedId={player.currentSong?.id}
      selectedItemPlaying={player.isPlaying}
      title={translateShelfTitle(shelf.title)}
      variant={shelf.items.every((item) => item.kind === 'artist') ? 'artist' : 'default'}
    />
  ))
}

function LandingView({ controller }) {
  const { browse } = controller
  const isHome = browse.view.kind === 'home'
  const { layout, reset, update } = useHomeLayout()
  const [editing, setEditing] = useState(false)
  const rawShelves = browse.view.data?.shelves
  // Orden y visibilidad solo en el inicio; Explorar y Recomendado muestran todo tal como llega.
  const applied = useMemo(() => applyHomeLayout(rawShelves, isHome ? layout : DEFAULT_LAYOUT), [isHome, layout, rawShelves])
  const closePanel = useCallback(() => setEditing(false), [])

  return (
    <div className="home-page yt-landing" style={{ '--shelf-card': CARD_SIZES[layout.cardSize].css }}>
      <CatalogNavigation controller={controller} onEditHome={isHome ? () => setEditing((open) => !open) : undefined} editingHome={editing} />
      {browse.error && <div className="collection-empty" role="alert">{browse.error}</div>}
      {browse.loading && <div className="yt-feed-skeleton" role="status" aria-label="Cargando recomendaciones"><i /><i /><i /></div>}
      {!browse.loading && browse.view.data && <BrowseShelves controller={controller} shelves={applied.visible} />}
      {!browse.loading && !browse.view.data && !browse.error && <div className="collection-empty">No hay contenido disponible por ahora.</div>}
      {editing && isHome && (
        <Suspense fallback={null}>
          <HomeLayoutPanel layout={layout} onChange={update} onClose={closePanel} onReset={reset} sections={applied.sections} />
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

function LibraryArtwork({ artwork, fallback: Fallback }) {
  return artwork
    ? <img src={artwork} alt="" loading="eager" decoding="async" />
    : <span aria-hidden="true"><Fallback size={22} strokeWidth={1.7} /></span>
}

function LibraryOverview({ controller, data }) {
  const artwork = [
    ...data.playlists.map((playlist) => playlist.thumbnail),
    ...data.likedSongs.map((song) => song.thumbnail),
  ].filter(Boolean).slice(0, 4)
  const canPlayLikes = data.likedSongs.length > 0

  return (
    <section className="yt-library-overview" aria-labelledby="yt-library-overview-title">
      <div className="yt-library-overview__copy">
        <span>COLECCIÓN PERSONAL</span>
        <h2 id="yt-library-overview-title">Tu música, reunida</h2>
        <p>{data.playlists.length} playlists y {data.likedSongs.length} canciones que te gustan, sincronizadas con YouTube Music.</p>
        <button type="button" disabled={!canPlayLikes} onClick={() => controller.playSongs(data.likedSongs, data.likedSongs[0].id)}>
          <Play size={15} fill="currentColor" aria-hidden="true" /> Reproducir Me gusta
        </button>
      </div>
      <div className="yt-library-overview__mosaic" aria-hidden="true">
        {artwork.map((image, index) => <img loading="lazy" decoding="async" src={image} alt="" key={`${image}-${index}`} />)}
        {artwork.length === 0 && <span><Library size={34} strokeWidth={1.4} /></span>}
      </div>
    </section>
  )
}

function LibraryShortcuts({ controller, data }) {
  const playlists = data.playlists.slice(0, 3)
  return (
    <section className="yt-library-shortcuts" aria-labelledby="yt-library-shortcuts-title">
      <div className="yt-library-section-heading">
        <ListMusic size={18} aria-hidden="true" />
        <h2 id="yt-library-shortcuts-title">Accesos directos</h2>
      </div>
      <div className="yt-library-shortcuts__grid">
        <button type="button" disabled={!data.likedSongs.length} onClick={() => controller.playSongs(data.likedSongs, data.likedSongs[0].id)}>
          <span className="yt-library-shortcuts__artwork yt-library-shortcuts__artwork--liked"><LibraryArtwork artwork={data.likedSongs[0]?.thumbnail} fallback={Heart} /></span>
          <span><strong>Tus Me gusta</strong><small>{data.likedSongs.length} canciones</small></span>
          <Play size={16} fill="currentColor" aria-hidden="true" />
        </button>
        {playlists.map((playlist) => (
          <button type="button" key={playlist.id} onClick={() => controller.openPlaylist(playlist.id)}>
            <span className="yt-library-shortcuts__artwork"><LibraryArtwork artwork={playlist.thumbnail} fallback={ListMusic} /></span>
            <span><strong>{playlist.title}</strong><small>{playlist.itemCount} canciones</small></span>
            <Play size={16} fill="currentColor" aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  )
}

function OfficialLibraryView({ controller }) {
  const data = controller.browse.view.data
  const playlists = data.playlists.map((playlist) => ({
    artwork: playlist.thumbnail,
    artist: `${playlist.itemCount} canciones`,
    id: playlist.id,
    title: playlist.title,
  }))
  return (
    <div className="home-page yt-library">
      <CatalogNavigation controller={controller} />
      <LibraryOverview controller={controller} data={data} />
      <LibraryShortcuts controller={controller} data={data} />
      <HomeRail items={playlists} onSelect={controller.openPlaylist} title="Tus playlists de YouTube" />
      <SongResults controller={controller} sourceSongs={data.likedSongs} title="Canciones que te gustan" />
    </div>
  )
}

function ArtistDetail({ controller }) {
  const { browse, likedArtistIds, likedSongIds, onAddToPlaylist, openAlbum, openArtistSongs, player, playSongs, renderSongActions, toggleArtistFavorite, toggleSongFavorite } = controller
  const sourceSongs = browse.view.data.topSongs
  const artistDefaults = { artist: browse.view.data.name, artistId: browse.view.data.id }
  return <ArtistView artist={{ artistId: browse.view.data.id, artwork: browse.view.data.thumbnail, images: browse.view.data.images?.map((image) => image.url ?? image).filter(Boolean), title: browse.view.data.name }} likedArtistIds={likedArtistIds} likedSongIds={likedSongIds} onAddToPlaylist={onAddToPlaylist} onAlbumSelect={openAlbum} onBack={controller.goBack} onPlaybackToggle={player.togglePlay} onReleasePlay={(release) => openAlbum(release.id)} onSongSelect={(songId) => playSongs(sourceSongs, songId)} onToggleArtistFavorite={toggleArtistFavorite} onToggleFavorite={toggleSongFavorite} onViewAllSongs={() => openArtistSongs(browse.view.data.id)} releases={adaptReleases(browse.view.data.shelves)} renderSongActions={renderSongActions} selectedSongId={player.currentSong?.id} selectedSongPlaying={player.isPlaying} songs={sourceSongs.map((song, index) => adaptSong(song, index, artistDefaults))} />
}

function ArtistSongsDetail({ controller }) {
  const { browse, openAlbum, player, playSongs } = controller
  const sourceSongs = browse.view.data.songs
  const artistDefaults = { artist: browse.view.data.name, artistId: browse.view.data.id }
  return <ArtistSongsView artistName={browse.view.data.name} onAlbumSelect={openAlbum} onBack={controller.goBack} onPlaybackToggle={player.togglePlay} onSongSelect={(songId) => playSongs(sourceSongs, songId)} selectedSongId={player.currentSong?.id} selectedSongPlaying={player.isPlaying} songs={sourceSongs.map((song, index) => adaptSong(song, index, artistDefaults))} />
}

function AlbumDetail({ controller }) {
  const { browse, downloads, likedAlbumIds, likedSongIds, onAddToPlaylist, openArtist, player, playSongs, renderSongActions, toggleAlbumFavorite, toggleSongFavorite } = controller
  const data = browse.view.data
  const sourceSongs = data.tracks
  return <CollectionDetailView collection={{ albumId: data.id, artist: data.artist, artistArtwork: data.thumbnail, artistId: data.artistId, artwork: data.thumbnail, kind: 'Álbum', title: data.title, year: data.year }} collectionFavorite={likedAlbumIds.has(data.id)} likedSongIds={likedSongIds} onAddToPlaylist={onAddToPlaylist} onArtistSelect={openArtist} onBack={controller.goBack} onDownloadCollection={() => downloads.downloadMany(sourceSongs)} onPlaybackToggle={player.togglePlay} onSongSelect={(songId) => playSongs(sourceSongs, songId)} onToggleCollectionFavorite={(liked) => toggleAlbumFavorite(data.id, liked)} onToggleFavorite={toggleSongFavorite} renderTrackActions={renderSongActions} selectedSongId={player.currentSong?.id} selectedSongPlaying={player.isPlaying} songs={sourceSongs.map(adaptSong)} />
}

function PlaylistDetail({ controller }) {
  const { browse, downloads, likedSongIds, onAddToPlaylist, openAlbum, openArtist, player, playSongs, renderSongActions, toggleSongFavorite } = controller
  const data = browse.view.data
  const sourceSongs = data.songs
  return <CollectionDetailView collection={{ artist: 'YouTube Music', artwork: data.thumbnail, description: data.description, id: data.id, kind: 'Playlist', title: data.title }} likedSongIds={likedSongIds} onAddToPlaylist={onAddToPlaylist} onAlbumSelect={openAlbum} onArtistSelect={openArtist} onBack={controller.goBack} onDownloadCollection={() => downloads.downloadMany(sourceSongs)} onPlaybackToggle={player.togglePlay} onSongSelect={(songId) => playSongs(sourceSongs, songId)} onToggleFavorite={toggleSongFavorite} renderTrackActions={renderSongActions} selectedSongId={player.currentSong?.id} selectedSongPlaying={player.isPlaying} selectedSongSource="youtube" songs={sourceSongs.map(adaptSong)} />
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
  if (isLanding && controller.account === null) return null
  if (isLanding && !controller.account.connected) return <UnlinkedPrompt controller={controller} />
  if (kind === 'search') return <SearchView controller={controller} />
  if (['home', 'explore', 'recommendations'].includes(kind)) return <LandingView controller={controller} />
  if (kind === 'artist') return <ArtistDetail controller={controller} />
  if (kind === 'artist-songs') return <ArtistSongsDetail controller={controller} />
  if (kind === 'album') return <AlbumDetail controller={controller} />
  if (kind === 'playlist') return <PlaylistDetail controller={controller} />
  if (kind === 'downloads') return <DownloadsView controller={controller} />
  if (kind === 'official-library') return <OfficialLibraryView controller={controller} />
  return null
}
