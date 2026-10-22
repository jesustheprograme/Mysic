import { Check, Compass, Copy, Download, ExternalLink, Headphones, Info, Link2Off, LoaderCircle, Sparkles, UserRound, WifiOff } from 'lucide-react'
import { useState } from 'react'
import ArtistView from '../collections/ArtistView.jsx'
import CollectionDetailView from '../collections/CollectionDetailView.jsx'
import CatalogSearchControls from '../discovery/CatalogSearchControls.jsx'
import HomeRail from '../discovery/HomeRail.jsx'
import SongList from '../discovery/SongList.jsx'
import MusicSearchPanel from './MusicSearchPanel.jsx'
import { adaptAlbum, adaptArtist, adaptBrowseItem, adaptReleases, adaptSong } from './lib/adapters.js'

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

function SearchRail({ emptyMessage, items, onSelect, title, variant }) {
  if (!items) return null
  return <HomeRail emptyMessage={emptyMessage} items={items} onSelect={onSelect} title={title} variant={variant} />
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
  let title = 'Conecta tus recomendaciones reales'
  let description = 'El acceso con Google identifica YouTube, pero no permite leer el Inicio privado de YouTube Music. Añade una sesión verificada para usar tus gustos reales.'
  if (pending) {
    title = 'Autoriza este dispositivo'
    description = 'Abre YouTube, inicia sesión si hace falta e introduce el código temporal.'
  }
  if (account?.connected) {
    title = 'Tu Inicio real de YouTube Music está conectado'
    description = 'La sesión fue comprobada contra el feed personal. Inicio, radios y recomendaciones ya usan esta cuenta.'
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
        <li>Abre <a href="https://music.youtube.com" target="_blank" rel="noreferrer">music.youtube.com</a> con la cuenta correcta.</li>
        <li>En DevTools → Red → Fetch/XHR, recarga la página y elige <code>account_menu</code>, <code>browse</code> o <code>next</code>.</li>
        <li>Clic derecho sobre la solicitud → Copiar → Copiar como cURL, y pégala aquí.</li>
      </ol>
      <label htmlFor="yt-music-request">Solicitud de YouTube Music</label>
      <textarea id="yt-music-request" value={requestText} onChange={(event) => setRequestText(event.target.value)} autoComplete="off" spellCheck="false" placeholder="curl 'https://music.youtube.com/youtubei/v1/account/account_menu?...' ..." />
      <div className="yt-account-session__footer">
        <span>Contiene una sesión sensible: no la compartas. Mysic la cifra y no guarda este texto en el navegador.</span>
        <button className="yt-account-action yt-account-action--primary" type="submit" disabled={busy || !requestText.trim()}>{busy ? <LoaderCircle className="yt-spin" size={16} aria-hidden="true" /> : <UserRound size={16} aria-hidden="true" />} Verificar y conectar</button>
      </div>
    </form>
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

function AccountHelp({ account, busy, error, onConnect, onDisconnect, open }) {
  const pending = account?.status === 'pending'

  return (
    <div className={`yt-account-help${open ? ' yt-account-help--open' : ''}`} id="yt-account-help" inert={!open}>
      <div>
        <AccountIntro account={account} pending={pending} />
        {pending && <AccountCode account={account} />}
        <AccountActions account={account} busy={busy} onDisconnect={onDisconnect} pending={pending} />
        {!account?.connected && !pending && <MusicSessionForm busy={busy} onConnect={onConnect} />}
        {error && <p className="yt-account-help__error" role="alert">{error}</p>}
      </div>
    </div>
  )
}

function getCatalogHeading(kind, personalized) {
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
    </nav>
  )
}

function CatalogNavigation({ controller }) {
  const { account, accountBusy, accountError, accountHelpOpen, actionError, browse, changeTab, connectMusicSession, disconnectAccount, downloads, player, searchType, selectSearchEntity, setAccountHelpOpen, showDownloads } = controller
  const showingDownloads = browse.view.kind === 'downloads'
  const heading = getCatalogHeading(browse.view.kind, account?.personalized)

  return (
    <header className="yt-hub">
      <div className="yt-hub__topline">
        <div><span className="yt-hub__eyebrow">YOUTUBE MUSIC</span><h1>{heading}</h1></div>
        <button className={`yt-account${account?.connected ? ' yt-account--connected' : ''}`} type="button" aria-controls="yt-account-help" aria-expanded={accountHelpOpen} onClick={() => setAccountHelpOpen((open) => !open)}>
          <UserRound size={17} aria-hidden="true" /><span>{account?.connected ? 'Personalización verificada' : 'Conectar recomendaciones'}</span><Info size={15} aria-hidden="true" />
        </button>
      </div>
      <AccountHelp account={account} busy={accountBusy} error={accountError} onConnect={connectMusicSession} onDisconnect={disconnectAccount} open={accountHelpOpen} />
      <MusicSearchPanel history={browse.history} onEntitySelect={selectSearchEntity} onHistoryRemove={browse.removeFromHistory} onQueryChange={browse.setQuery} onSubmit={(text) => browse.runSearch(text, searchType)} query={browse.query} />
      <CatalogTabs browse={browse} downloads={downloads} player={player} showDownloads={showDownloads} showingDownloads={showingDownloads} />
      {actionError && <div className="collection-empty" role="alert">{actionError}</div>}
      {(browse.view.kind === 'search' || showingDownloads) && (
        <CatalogSearchControls activeType={searchType} downloadsActive={showingDownloads} downloadsLabel={`Descargas${downloads.downloads.items.length ? ` (${downloads.downloads.items.length})` : ''}`} onDownloadsSelect={showDownloads} onQueryChange={browse.setQuery} onSubmit={() => browse.runSearch(browse.query, searchType)} onTypeSelect={changeTab} query={browse.query} showField={false} showDownloads={false} />
      )}
    </header>
  )
}

function BrowseShelves({ controller, data }) {
  const { openAlbum, openArtist, player, playSongs, startPlaylist } = controller
  if (!data?.shelves?.length) return <div className="collection-empty">No hay recomendaciones disponibles por ahora.</div>
  return data.shelves.map((shelf) => (
    <HomeRail
      items={shelf.items.map(adaptBrowseItem)}
      key={`${shelf.title}-${shelf.items[0]?.id}`}
      onPlaybackToggle={player.togglePlay}
      onSelect={(id) => {
        const item = shelf.items.find((entry) => entry.id === id)
        if (item?.kind === 'song') playSongs(shelf.items.filter((entry) => entry.kind === 'song'), id)
        if (item?.kind === 'artist') openArtist(id)
        if (item?.kind === 'album') openAlbum(id)
        if (item?.kind === 'playlist') startPlaylist(id)
      }}
      selectedId={player.currentSong?.id}
      selectedItemPlaying={player.isPlaying}
      title={shelf.title}
      variant={shelf.items.every((item) => item.kind === 'artist') ? 'artist' : 'default'}
    />
  ))
}

function LandingView({ controller }) {
  const { browse } = controller
  return (
    <div className="home-page yt-landing">
      <CatalogNavigation controller={controller} />
      {browse.error && <div className="collection-empty" role="alert">{browse.error}</div>}
      {browse.loading && <div className="yt-feed-skeleton" role="status" aria-label="Cargando recomendaciones"><i /><i /><i /></div>}
      {!browse.loading && browse.view.data && <BrowseShelves controller={controller} data={browse.view.data} />}
      {!browse.loading && !browse.view.data && !browse.error && <div className="collection-empty">No hay contenido disponible por ahora.</div>}
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

function ArtistDetail({ controller }) {
  const { browse, likedArtistIds, likedSongIds, onAddToPlaylist, openAlbum, player, playSongs, renderSongActions, toggleArtistFavorite, toggleSongFavorite } = controller
  const sourceSongs = browse.view.data.topSongs
  return <ArtistView artist={{ artistId: browse.view.data.id, artwork: browse.view.data.thumbnail, images: browse.view.data.images?.map((image) => image.url ?? image).filter(Boolean), title: browse.view.data.name }} likedArtistIds={likedArtistIds} likedSongIds={likedSongIds} onAddToPlaylist={onAddToPlaylist} onAlbumSelect={openAlbum} onBack={controller.goBack} onPlaybackToggle={player.togglePlay} onReleasePlay={(release) => openAlbum(release.id)} onSongSelect={(songId) => playSongs(sourceSongs, songId)} onToggleArtistFavorite={toggleArtistFavorite} onToggleFavorite={toggleSongFavorite} releases={adaptReleases(browse.view.data.shelves)} renderSongActions={renderSongActions} selectedSongId={player.currentSong?.id} selectedSongPlaying={player.isPlaying} songs={sourceSongs.map(adaptSong)} />
}

function AlbumDetail({ controller }) {
  const { browse, downloads, likedAlbumIds, likedSongIds, onAddToPlaylist, openArtist, player, playSongs, renderSongActions, toggleAlbumFavorite, toggleSongFavorite } = controller
  const data = browse.view.data
  const sourceSongs = data.tracks
  return <CollectionDetailView collection={{ albumId: data.id, artist: data.artist, artistArtwork: data.thumbnail, artistId: data.artistId, artwork: data.thumbnail, kind: 'Álbum', title: data.title, year: data.year }} collectionFavorite={likedAlbumIds.has(data.id)} likedSongIds={likedSongIds} onAddToPlaylist={onAddToPlaylist} onArtistSelect={openArtist} onBack={controller.goBack} onDownloadCollection={() => downloads.downloadMany(sourceSongs)} onPlaybackToggle={player.togglePlay} onSongSelect={(songId) => playSongs(sourceSongs, songId)} onToggleCollectionFavorite={(liked) => toggleAlbumFavorite(data.id, liked)} onToggleFavorite={toggleSongFavorite} renderTrackActions={renderSongActions} selectedSongId={player.currentSong?.id} selectedSongPlaying={player.isPlaying} songs={sourceSongs.map(adaptSong)} />
}

export default function YoutubeCatalogContent({ controller }) {
  const kind = controller.browse.view.kind
  if (kind === 'search') return <SearchView controller={controller} />
  if (['home', 'explore', 'recommendations'].includes(kind)) return <LandingView controller={controller} />
  if (kind === 'artist') return <ArtistDetail controller={controller} />
  if (kind === 'album') return <AlbumDetail controller={controller} />
  if (kind === 'downloads') return <DownloadsView controller={controller} />
  return null
}
