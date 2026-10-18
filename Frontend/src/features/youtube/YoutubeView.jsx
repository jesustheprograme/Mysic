import { Download, LoaderCircle, Trash2, WifiOff } from 'lucide-react'
import { useCallback, useEffect, useEffectEvent, useState } from 'react'
import { createPortal } from 'react-dom'
import PlayerDock from '../../components/PlayerDock.jsx'
import VisibleContent from '../../components/VisibleContent.jsx'
import ArtistView from '../collections/ArtistView.jsx'
import CollectionDetailView from '../collections/CollectionDetailView.jsx'
import CatalogSearchControls from '../discovery/CatalogSearchControls.jsx'
import HomeRail from '../discovery/HomeRail.jsx'
import SongList from '../discovery/SongList.jsx'
import useGlobalMiniPlayer from '../mini-player/useGlobalMiniPlayer.js'
import { useBrowse } from './hooks/useBrowse.js'
import { useDownloads } from './hooks/useDownloads.js'
import { usePlayer } from './hooks/usePlayer.js'
import { readStorage, writeStorage } from './lib/storage.js'

const ignorePreview = () => {}

function useFavoriteIds(storageKey) {
  const [ids, setIds] = useState(() => new Set(readStorage(storageKey, [])))

  function toggle(id, liked) {
    setIds((current) => {
      const next = new Set(current)
      if (liked) next.add(id)
      else next.delete(id)
      writeStorage(storageKey, [...next])
      return next
    })
  }

  return [ids, toggle]
}

function adaptSong(song, index = 0) {
  return {
    ...song,
    albumTitle: song.album,
    artwork: song.thumbnail ?? song.artwork,
    source: 'youtube',
    trackNo: song.index ?? index + 1,
  }
}

function adaptArtist(artist) {
  return {
    artwork: artist.thumbnail,
    id: artist.id,
    meta: artist.subtitle,
    title: artist.name,
  }
}

function adaptAlbum(album) {
  return {
    artwork: album.thumbnail,
    artist: album.kind !== 'Álbum' ? album.kind : album.artist,
    detail: album.year,
    id: album.id,
    title: album.title,
  }
}

function getReleaseType(title, kind) {
  if (/ep/i.test(kind) || /ep/i.test(title)) return 'ep'
  if (/single/i.test(title)) return 'single'
  return 'album'
}

function adaptReleases(shelves) {
  return shelves.flatMap((shelf) => shelf.items.map((release) => ({
    artwork: release.thumbnail,
    id: release.id,
    releaseDate: release.year ? `${release.year}-01-01` : null,
    releaseType: getReleaseType(shelf.title, release.kind),
    songCount: null,
    songs: [],
    subtitle: release.kind !== 'Álbum' ? release.kind : release.artist,
    title: release.title,
  })))
}

function YoutubeView({ active = true, onAddToPlaylist, onPlayerCollapseToggle, onPlayerVisibilityChange, playerCollapsed = false }) {
  const browse = useBrowse({ progressive: true })
  const { loadSection } = browse
  const loadArtists = useCallback(() => loadSection('artist'), [loadSection])
  const loadAlbums = useCallback(() => loadSection('album'), [loadSection])
  const downloads = useDownloads()
  const [likedSongIds, toggleSongFavorite] = useFavoriteIds('mysic:youtube:favorite-songs')
  const [likedArtistIds, toggleArtistFavorite] = useFavoriteIds('mysic:youtube:favorite-artists')
  const [likedAlbumIds, toggleAlbumFavorite] = useFavoriteIds('mysic:youtube:favorite-albums')
  const player = usePlayer({
    enabled: active,
    isDownloaded: downloads.isDownloaded,
    onPlayerVisibilityChange,
  })
  const { error, loading, results, searchType, view } = browse
  const openMiniPlayer = useGlobalMiniPlayer(player, browse)

  const playExternalSong = useEffectEvent((event) => {
    if (event.detail?.id) player.playFrom([event.detail], 0)
  })

  useEffect(() => {
    const listener = (event) => playExternalSong(event)
    window.addEventListener('mysic:play-youtube-song', listener)
    return () => window.removeEventListener('mysic:play-youtube-song', listener)
  }, [])

  function playSongs(sourceSongs, songId) {
    const index = sourceSongs.findIndex((song) => song.id === songId)
    if (index >= 0) player.playFrom(sourceSongs, index)
  }

  function toggleDownload(song) {
    if (downloads.downloadedIds.has(song.id)) {
      downloads.deleteDownload(song.id)
      return
    }
    downloads.downloadSong(song)
  }

  function renderDownloadAction(song) {
    const job = downloads.downloads.jobs[song.id]
    const downloaded = downloads.downloadedIds.has(song.id)
    const busy = job?.status === 'downloading'
    const Icon = busy ? LoaderCircle : downloaded ? Trash2 : Download
    const label = downloaded ? `Eliminar descarga de ${song.title}` : `Descargar ${song.title}`

    return (
      <button
        className="song-row__action collection-detail__track-action"
        type="button"
        aria-label={label}
        title={label}
        disabled={busy || (!downloads.online && !downloaded)}
        onClick={() => toggleDownload(song)}
      >
        <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
      </button>
    )
  }

  function renderSongResults(sourceSongs, title = 'Canciones') {
    const songs = sourceSongs.map(adaptSong)
    return (
      <SongList
        emptyMessage="No se encontraron canciones."
        likedSongIds={likedSongIds}
        onAddToPlaylist={onAddToPlaylist}
        onAlbumSelect={browse.openAlbum}
        onArtistSelect={browse.openArtist}
        onPlaybackToggle={player.togglePlay}
        onPreviewStart={ignorePreview}
        onPreviewStop={ignorePreview}
        onSongSelect={(songId) => playSongs(sourceSongs, songId)}
        onToggleFavorite={toggleSongFavorite}
        preview={null}
        renderSongActions={renderDownloadAction}
        selectedSongId={player.currentSong?.id}
        selectedSongPlaying={player.isPlaying}
        songs={songs}
        title={title}
      />
    )
  }

  function renderSearchResults() {
    if (!results) return <div className="collection-empty">Busca canciones, artistas o álbumes para comenzar.</div>

    const songs = results.type === 'all' ? results.songs : results.type === 'song' ? results.items : []
    const artists = results.type === 'all' ? results.artists : results.type === 'artist' ? results.items : []
    const albums = results.type === 'all' ? results.albums : results.type === 'album' ? results.items : []

    return (
      <>
        {songs.length > 0 && renderSongResults(songs)}
        {(results.type === 'all' || artists.length > 0) && (
          <VisibleContent key={`artists-${results.query}`} title="Artistas" onVisible={results.type === 'all' ? loadArtists : undefined}>
            <HomeRail deferArtwork items={artists.map(adaptArtist)} onSelect={browse.openArtist} title="Artistas" variant="artist"
              emptyMessage={results.pending?.includes('artist') ? 'Cargando artistas…' : 'No se encontraron artistas.'} />
          </VisibleContent>
        )}
        {(results.type === 'all' || albums.length > 0) && (
          <VisibleContent key={`albums-${results.query}`} title="Álbumes" onVisible={results.type === 'all' ? loadAlbums : undefined}>
            <HomeRail deferArtwork items={albums.map(adaptAlbum)} onSelect={browse.openAlbum} title="Álbumes"
              emptyMessage={results.pending?.includes('album') ? 'Cargando álbumes…' : 'No se encontraron álbumes.'} />
          </VisibleContent>
        )}
      </>
    )
  }

  function renderCatalogNavigation() {
    const showingDownloads = view.kind === 'downloads'

    return (
      <>
        <div className="collection-heading">
          <div>
            <span>CATÁLOGO GLOBAL</span>
            <h1>Mysic global</h1>
          </div>
        </div>

        <section className="catalog-search" aria-labelledby="catalog-search-title">
          <div className="collection-heading catalog-search__heading">
            <h2 id="catalog-search-title">Buscar</h2>
          </div>

          <CatalogSearchControls
            activeType={searchType}
            downloadsActive={showingDownloads}
            downloadsLabel={`Descargas${downloads.downloads.items.length ? ` (${downloads.downloads.items.length})` : ''}`}
            onDownloadsSelect={browse.showDownloads}
            onQueryChange={browse.setQuery}
            onSubmit={() => browse.runSearch(browse.query, searchType)}
            onTypeSelect={browse.changeTab}
            query={browse.query}
          />
        </section>
      </>
    )
  }

  function renderSearchView() {
    return (
      <div className="home-page">
        {renderCatalogNavigation()}

        {!downloads.online && (
          <div className="collection-empty" role="status">
            <WifiOff aria-hidden="true" /> Sin conexión. Solo están disponibles las descargas.
          </div>
        )}
        {error && <div className="collection-empty" role="alert">{error}</div>}
        {loading && !results ? <div className="collection-empty" role="status">Cargando canciones…</div> : renderSearchResults()}
      </div>
    )
  }

  function renderDownloadsView() {
    return (
      <div className="home-page">
        {renderCatalogNavigation()}
        {!downloads.online && (
          <div className="collection-empty" role="status">
            <WifiOff aria-hidden="true" /> Sin conexión. Solo están disponibles las descargas.
          </div>
        )}
        {error && <div className="collection-empty" role="alert">{error}</div>}
        {renderSongResults(downloads.downloads.items, 'Descargas')}
      </div>
    )
  }

  function renderArtistView() {
    const sourceSongs = view.data.topSongs
    const songs = sourceSongs.map(adaptSong)
    return (
      <ArtistView
        artist={{
          artistId: view.data.id,
          artwork: view.data.thumbnail,
          images: view.data.images?.map((image) => image.url ?? image).filter(Boolean),
          title: view.data.name,
        }}
        likedArtistIds={likedArtistIds}
        likedSongIds={likedSongIds}
        onAddToPlaylist={onAddToPlaylist}
        onAlbumSelect={browse.openAlbum}
        onBack={browse.goBack}
        onPlaybackToggle={player.togglePlay}
        onReleasePlay={(release) => browse.openAlbum(release.id)}
        onSongSelect={(songId) => playSongs(sourceSongs, songId)}
        onToggleArtistFavorite={toggleArtistFavorite}
        onToggleFavorite={toggleSongFavorite}
        releases={adaptReleases(view.data.shelves)}
        renderSongActions={renderDownloadAction}
        selectedSongId={player.currentSong?.id}
        selectedSongPlaying={player.isPlaying}
        songs={songs}
      />
    )
  }

  function renderAlbumView() {
    const sourceSongs = view.data.tracks
    const songs = sourceSongs.map(adaptSong)
    return (
      <CollectionDetailView
        collection={{
          albumId: view.data.id,
          artist: view.data.artist,
          artistArtwork: view.data.thumbnail,
          artistId: view.data.artistId,
          artwork: view.data.thumbnail,
          kind: 'Álbum',
          title: view.data.title,
          year: view.data.year,
        }}
        collectionFavorite={likedAlbumIds.has(view.data.id)}
        likedSongIds={likedSongIds}
        onAddToPlaylist={onAddToPlaylist}
        onArtistSelect={browse.openArtist}
        onBack={browse.goBack}
        onDownloadCollection={() => downloads.downloadMany(sourceSongs)}
        onPlaybackToggle={player.togglePlay}
        onSongSelect={(songId) => playSongs(sourceSongs, songId)}
        onToggleCollectionFavorite={(liked) => toggleAlbumFavorite(view.data.id, liked)}
        onToggleFavorite={toggleSongFavorite}
        renderTrackActions={renderDownloadAction}
        selectedSongId={player.currentSong?.id}
        selectedSongPlaying={player.isPlaying}
        songs={songs}
      />
    )
  }

  const root = document.getElementById('music-home')
  const currentTrack = player.currentSong ? adaptSong(player.currentSong) : null

  return (
    <div className="youtube-catalog">
      <main className="music-app__main">
        <div className="music-workspace">
          {view.kind === 'search' && renderSearchView()}
          {view.kind === 'artist' && renderArtistView()}
          {view.kind === 'album' && renderAlbumView()}
          {view.kind === 'downloads' && renderDownloadsView()}
        </div>
      </main>

      <audio {...player.audioProps} />
      <div ref={player.iframeHostRef} className="youtube-player-engine" aria-hidden="true" />
      {active && currentTrack && root && createPortal(
        <PlayerDock
          collapsed={playerCollapsed}
          externalPlayback={{
            commitSeek: player.commitSeek,
            currentIndex: player.currentIndex,
            currentTime: player.currentTime,
            duration: player.progressMax,
            error: player.playerError,
            handleSeek: player.handleSeek,
            isBuffering: player.isBuffering,
            isPlaying: player.isPlaying,
            setVolume: player.setVolume,
            togglePlayback: player.togglePlay,
            volume: player.volume,
          }}
          onClose={player.closePlayer}
          onOpenMiniPlayer={() => openMiniPlayer().catch(() => {})}
          onNext={player.playNext}
          onPrevious={player.playPrev}
          onQueueSelect={(index) => player.playFrom(player.queue, index)}
          onToggleCollapsed={onPlayerCollapseToggle}
          liked={likedSongIds.has(player.currentSong.id)}
          onToggleFavorite={(liked) => toggleSongFavorite(player.currentSong.id, liked)}
          queue={player.queue.map(adaptSong)}
          track={currentTrack}
        />,
        root,
      )}
    </div>
  )
}

export default YoutubeView
