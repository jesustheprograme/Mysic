import { Download, LoaderCircle, Radio, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import PlayerDock from '../../components/PlayerDock.jsx'
import { connectAudioAnalyser, disconnectAudioAnalyser, resumeAudioContext } from '../../lib/audioAnalyser.js'
import useGlobalMiniPlayer from '../mini-player/useGlobalMiniPlayer.js'
import { useBrowse } from './hooks/useBrowse.js'
import { preloadYoutubePlayer, usePlayer } from './hooks/usePlayer.js'
import { useYoutubeFavorites } from './hooks/useYoutubeFavorites.js'
import { adaptSong } from './lib/adapters.js'
import { captureYoutubeMusicSession, desktopSessionAvailable } from './lib/desktopSession.js'
import { api } from './lib/api.js'
import MusicSearchPanel from './MusicSearchPanel.jsx'
import YoutubeCatalogContent from './YoutubeCatalogContent.jsx'
import { setAccountMenu } from './accountMenuBridge.js'
import { shuffled } from './queueOps.js'
import { showToast } from './toast.js'
import ToastHost from './ToastHost.jsx'

function getScrollTargets(workspace) {
  const content = workspace?.closest('.music-app__content')
  if (!workspace || !content) return []
  return [content, workspace.querySelector('.artist-profile__content'), workspace.querySelector('.collection-detail__tracks')].filter(Boolean)
}

function YoutubeView({
  active = true,
  downloads,
  likedSongIds,
  onAddToPlaylist,
  onPlaybackOwnerClaim,
  onPlaybackStateChange,
  onPlayerCollapseToggle,
  onQueueEnd,
  onQueueStart,
  onSearchNavigate,
  onToggleSongFavorite,
  favoriteStoragePrefix = 'mysic:youtube',
  playbackToggleNonce = 0,
  playerCollapsed = false,
  playbackRequest,
  searchRequest,
  stopNonce = 0,
  suppressed = false,
}) {
  const scrollPositionsRef = useRef(new Map())
  const workspaceRef = useRef(null)
  const queueRequestRef = useRef(null)
  const browse = useBrowse({ progressive: true })
  const { ids: likedArtistIds, toggleFavorite: toggleArtistFavorite } = useYoutubeFavorites(
    `${favoriteStoragePrefix}:favorite-artists`,
    'mysic:youtube:favorite-artists',
  )
  const { ids: likedAlbumIds, toggleFavorite: toggleAlbumFavorite } = useYoutubeFavorites(
    `${favoriteStoragePrefix}:favorite-albums`,
    'mysic:youtube:favorite-albums',
  )
  const [account, setAccount] = useState(null)
  const [searchRoot, setSearchRoot] = useState(null)
  const [accountHelpOpen, setAccountHelpOpen] = useState(false)
  const [accountBusy, setAccountBusy] = useState(false)
  const [accountError, setAccountError] = useState('')
  const [officialLibraryBusy, setOfficialLibraryBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [queueLoadingKey, setQueueLoadingKey] = useState(null)
  const player = usePlayer({
    enabled: active,
    isDownloaded: downloads.isDownloaded,
    onQueueEnd,
    onQueueStart,
  })
  const playRequestedSong = useEffectEvent((song) => playFrom([song], 0, { preserveContext: true }))
  const closeRequestedPlayer = useEffectEvent(() => player.closePlayer())
  const playerAudioRef = player.audioProps.ref
  const playerSongId = player.currentSong?.id
  const playerUsesLocalAudio = player.isLocal
  const [playerAnalyser, setPlayerAnalyser] = useState(null)
  const openMiniPlayer = useGlobalMiniPlayer(player, browse)
  const refreshPersonalizedHome = useEffectEvent(() => browse.showHome())
  const reportPlaybackState = useEffectEvent(() => onPlaybackStateChange?.({
    currentSong: player.currentSong,
    isPlaying: player.isPlaying,
  }))
  const toggleRequestedPlayback = useEffectEvent(() => player.togglePlay())

  useEffect(() => {
    preloadYoutubePlayer().catch(() => {})
  }, [])

  function playFrom(songs, index, { preserveContext = false } = {}) {
    onPlaybackOwnerClaim?.({ preserveContext })
    player.playFrom(songs, index)
  }

  useLayoutEffect(() => {
    setSearchRoot(document.getElementById('global-header-search-root'))
  }, [])
  const applyHeaderSearch = useEffectEvent((request) => {
    browse.setQuery(request.query)
    if (request.nonce > 0) browse.runGlobalSearch(request.query)
  })
  useEffect(() => {
    if (!searchRequest?.query.trim()) return undefined
    applyHeaderSearch(searchRequest)
    return undefined
  }, [searchRequest])

  useEffect(() => {
    const controller = new AbortController()
    api.account(controller.signal).then(setAccount).catch((error) => {
      // Sin respuesta se trata como "no vinculada" para no dejar la portada vacía para siempre.
      if (error.name !== 'AbortError') setAccount({ connected: false, status: 'unknown' })
    })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (account?.status !== 'pending') return undefined
    const controller = new AbortController()
    let polling = false
    const poll = () => {
      if (polling) return
      polling = true
      api.accountLinkStatus(controller.signal).then((nextAccount) => {
        setAccount(nextAccount)
        if (nextAccount.connected) {
          setAccountError('')
          refreshPersonalizedHome()
        } else if (nextAccount.status === 'error') {
          setAccountError(nextAccount.error || 'No se pudo completar la vinculación.')
        }
      }).catch((error) => {
        if (error.name !== 'AbortError') {
          setAccountError(error.message || 'No se pudo comprobar la vinculación.')
        }
      }).finally(() => {
        polling = false
      })
    }
    const timer = setInterval(poll, Math.max(2000, Number(account.interval || 3) * 1000))
    poll()
    return () => {
      clearInterval(timer)
      controller.abort()
    }
  }, [account?.status, account?.interval])

  useEffect(() => () => queueRequestRef.current?.abort(), [])
  useEffect(() => { setActionError('') }, [browse.view.kind])

  useEffect(() => {
    const audio = playerAudioRef.current
    if (!playerUsesLocalAudio || !audio) {
      setPlayerAnalyser(null)
      return undefined
    }
    const analyser = connectAudioAnalyser(audio)
    const resumeAnalyser = () => resumeAudioContext().catch(() => {})
    audio.addEventListener('play', resumeAnalyser)
    setPlayerAnalyser(analyser)
    return () => {
      audio.removeEventListener('play', resumeAnalyser)
      disconnectAudioAnalyser(audio)
      setPlayerAnalyser(null)
    }
  }, [playerAudioRef, playerSongId, playerUsesLocalAudio])

  const { loadSection } = browse
  const { results } = browse
  useEffect(() => {
    if (results?.type !== 'all') return
    if (results.pending?.includes('artist')) void loadSection('artist')
    if (results.pending?.includes('album')) void loadSection('album')
  }, [loadSection, results?.pending, results?.query, results?.type])

  useEffect(() => {
    if (playbackRequest?.song?.id) playRequestedSong(playbackRequest.song)
  }, [playbackRequest?.nonce, playbackRequest?.song, playbackRequest?.song?.id])

  useEffect(() => {
    reportPlaybackState()
  }, [player.currentSong, player.isPlaying])

  const previousStopNonceRef = useRef(stopNonce)
  useEffect(() => {
    if (stopNonce === previousStopNonceRef.current) return
    previousStopNonceRef.current = stopNonce
    closeRequestedPlayer()
  }, [stopNonce])

  const previousPlaybackToggleNonceRef = useRef(playbackToggleNonce)
  useEffect(() => {
    if (playbackToggleNonce === previousPlaybackToggleNonceRef.current) return
    previousPlaybackToggleNonceRef.current = playbackToggleNonce
    toggleRequestedPlayback()
  }, [playbackToggleNonce])

  function playSongs(sourceSongs, songId) {
    const index = sourceSongs.findIndex((song) => song.id === songId)
    if (index >= 0) playFrom(sourceSongs, index)
  }

  function toggleDownload(song) {
    if (downloads.downloadedIds.has(song.id)) downloads.deleteDownload(song.id)
    else if (!account?.connected) {
      setAccountError('Conecta una sesión verificada de YouTube Music para descargar canciones.')
      setAccountHelpOpen(true)
    } else downloads.downloadSong(song)
  }

  async function loadQueue(key, loader) {
    queueRequestRef.current?.abort()
    const controller = new AbortController()
    queueRequestRef.current = controller
    setActionError('')
    setQueueLoadingKey(key)
    try {
      const queue = await loader(controller.signal)
      if (!queue.songs?.length) throw new Error('Esta selección no tiene canciones reproducibles.')
      if (queueRequestRef.current === controller) playFrom(queue.songs, 0)
    } catch (error) {
      if (error.name !== 'AbortError') setActionError(error.message || 'No se pudo iniciar la reproducción.')
    } finally {
      if (queueRequestRef.current === controller) {
        queueRequestRef.current = null
        setQueueLoadingKey(null)
      }
    }
  }

  // Cola: sin nada sonando, "a continuación" y "a la cola" empiezan a reproducir; con algo sonando
  // se insertan sin reiniciar la canción actual (player.enqueue).
  function enqueueSongs(songs, options) {
    if (!songs.length) return
    if (!player.currentSong) {
      playFrom(songs, 0)
      return
    }
    player.enqueue(songs, options)
    showToast(options?.next ? 'Se reproducirá a continuación' : 'Añadida a la cola')
  }
  function playShuffledSongs(songs) {
    if (songs.length) playFrom(shuffled(songs), 0)
  }

  function startRadio(song) {
    void loadQueue(`radio:${song.id}`, (signal) => api.radio(song.id, signal))
  }
  function startPlaylist(playlistId) {
    void loadQueue(`playlist:${playlistId}`, (signal) => api.playlist(playlistId, signal))
  }

  function renderSongActions(song) {
    const job = downloads.downloads.jobs[song.id]
    const downloaded = downloads.downloadedIds.has(song.id)
    const busy = job?.status === 'downloading'
    const Icon = busy ? LoaderCircle : downloaded ? Trash2 : Download
    const label = downloaded ? `Eliminar descarga de ${song.title}` : `Descargar ${song.title}`
    const startingRadio = queueLoadingKey === `radio:${song.id}`
    return (
      <>
        <button className="song-row__action collection-detail__track-action" type="button" aria-label={`Iniciar radio de ${song.title}`} title="Iniciar radio" disabled={startingRadio} onClick={() => startRadio(song)}>
          {startingRadio ? <LoaderCircle className="yt-spin" size={16} aria-hidden="true" /> : <Radio size={16} strokeWidth={1.8} aria-hidden="true" />}
        </button>
        <button className="song-row__action collection-detail__track-action" type="button" aria-label={label} title={label} disabled={busy || (!downloads.online && !downloaded)} onClick={() => toggleDownload(song)}>
          <Icon className={busy ? 'yt-spin' : undefined} size={16} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </>
    )
  }

  const workspaceKey = browse.view.data?.id
    ? `${browse.view.kind}-${browse.view.data.id}`
    : browse.view.kind === 'recommendations' && playerSongId
      ? `${browse.view.kind}-${playerSongId}`
      : browse.view.kind

  function saveCurrentScrollPosition() {
    const positions = getScrollTargets(workspaceRef.current).map((target) => target.scrollTop)
    scrollPositionsRef.current.set(workspaceKey, positions)
  }
  function openArtist(artistId) {
    saveCurrentScrollPosition()
    browse.openArtist(artistId)
  }
  function openAlbum(albumId) {
    saveCurrentScrollPosition()
    browse.openAlbum(albumId)
  }
  function openArtistSongs(artistId) {
    saveCurrentScrollPosition()
    browse.openArtistSongs(artistId)
  }
  function openPlaylist(playlistId) {
    saveCurrentScrollPosition()
    browse.openPlaylist(playlistId)
  }
  function showDownloads() {
    saveCurrentScrollPosition()
    browse.showDownloads()
  }
  function changeTab(type) {
    saveCurrentScrollPosition()
    browse.changeTab(type)
  }
  function goBack() {
    saveCurrentScrollPosition()
    browse.goBack()
  }

  useLayoutEffect(() => {
    if (!active) return undefined
    const scrollTargets = getScrollTargets(workspaceRef.current)
    if (!scrollTargets.length) return undefined
    const savedPositions = scrollPositionsRef.current.get(workspaceKey)
    scrollTargets.forEach((target, index) => target.scrollTo({ top: savedPositions?.[index] ?? 0, behavior: 'instant' }))
  }, [active, workspaceKey])

  function selectSearchEntity(entity) {
    if (entity.kind === 'song' && entity.song) playFrom([entity.song], 0)
    if (entity.kind === 'artist') {
      if (!active) onSearchNavigate?.()
      openArtist(entity.id)
    }
    if (entity.kind === 'album') {
      if (!active) onSearchNavigate?.()
      openAlbum(entity.id)
    }
  }

  async function startAccountLink() {
    setAccountBusy(true)
    setAccountError('')
    try {
      setAccount(await api.startAccountLink())
    } catch (error) {
      setAccountError(error.message || 'No se pudo iniciar la vinculación.')
    } finally {
      setAccountBusy(false)
    }
  }

  async function connectMusicSession(requestText) {
    setAccountBusy(true)
    setAccountError('')
    try {
      const nextAccount = await api.connectMusicSession(requestText)
      setAccount(nextAccount)
      browse.showHome()
      return true
    } catch (error) {
      setAccountError(error.message || 'No se pudo validar la sesión de YouTube Music.')
      return false
    } finally {
      setAccountBusy(false)
    }
  }

  async function connectDesktopSession() {
    setAccountBusy(true)
    setAccountError('')
    try {
      const session = await captureYoutubeMusicSession()
      const nextAccount = await api.connectCapturedSession(session)
      setAccount(nextAccount)
      browse.showHome()
      return true
    } catch (error) {
      setAccountError(error.message || 'No se pudo validar la sesión de YouTube Music.')
      return false
    } finally {
      setAccountBusy(false)
    }
  }

  async function disconnectAccount() {
    setAccountBusy(true)
    setAccountError('')
    try {
      setAccount(await api.unlinkAccount())
      browse.showHome()
    } catch (error) {
      setAccountError(error.message || 'No se pudo desvincular la cuenta.')
    } finally {
      setAccountBusy(false)
    }
  }

  async function syncOfficialLibrary() {
    setOfficialLibraryBusy(true)
    setAccountError('')
    try {
      const library = await api.sessionLibrary()
      library.likedSongs.forEach((song) => onToggleSongFavorite(song.id, true, adaptSong(song)))
      browse.showOfficialLibrary(library)
      setAccountHelpOpen(false)
    } catch (error) {
      setAccountError(error.message || 'No se pudo sincronizar la biblioteca oficial de YouTube.')
      setAccountHelpOpen(true)
    } finally {
      setOfficialLibraryBusy(false)
    }
  }

  // Navegación desde la barra lateral (Inicio / Explorar / Biblioteca). Si esta vista aún no estaba montada
  // cuando se pidió, la petición queda en window.__mysicYoutubeNav y se aplica al montar.
  const applySidebarNavigation = useEffectEvent((view) => {
    if (view === 'explore') browse.showExplore()
    else if (view === 'library') syncOfficialLibrary()
    else browse.showHome()
  })
  useEffect(() => {
    const pending = window.__mysicYoutubeNav
    if (pending) {
      window.__mysicYoutubeNav = null
      applySidebarNavigation(pending)
    }
    function onNavigate(event) {
      window.__mysicYoutubeNav = null
      applySidebarNavigation(event.detail?.view)
    }
    window.addEventListener('mysic:youtube-nav', onNavigate)
    return () => window.removeEventListener('mysic:youtube-nav', onNavigate)
  }, [])
  const browseViewKind = browse.view.kind
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('mysic:youtube-view', { detail: { kind: browseViewKind } }))
  }, [browseViewKind])

  // Opciones de cuenta en el menú de usuario de la barra de título (ver accountMenuBridge.js).
  // Las acciones viven en un ref para que la instantánea publicada no cambie en cada render.
  const accountActionsRef = useRef(null)
  useEffect(() => {
    accountActionsRef.current = {
      link: () => (desktopSessionAvailable ? connectDesktopSession() : setAccountHelpOpen(true)),
      sync: syncOfficialLibrary,
      unlink: disconnectAccount,
    }
  })
  const accountMenuActions = useMemo(() => ({
    link: () => accountActionsRef.current?.link(),
    sync: () => accountActionsRef.current?.sync(),
    unlink: () => accountActionsRef.current?.unlink(),
  }), [])
  const accountKnown = account !== null
  const accountConnected = Boolean(account?.connected)
  useEffect(() => {
    setAccountMenu(accountKnown
      ? { actions: accountMenuActions, busy: accountBusy, connected: accountConnected, syncBusy: officialLibraryBusy }
      : null)
    return () => setAccountMenu(null)
  }, [accountBusy, accountConnected, accountKnown, accountMenuActions, officialLibraryBusy])

  const controller = {
    downloadedIds: downloads.downloadedIds, enqueueSongs, playShuffled: playShuffledSongs, startRadio, toggleDownload,
    account, accountBusy, accountError, accountHelpOpen, actionError, browse, changeTab, connectDesktopSession, connectMusicSession, desktopSessionAvailable, disconnectAccount, downloads, goBack, likedAlbumIds,
    likedArtistIds, likedSongIds, onAddToPlaylist, openAlbum, openArtist, openArtistSongs, openPlaylist, player, playSongs,
    renderSongActions, searchType: browse.searchType, selectSearchEntity, setAccountHelpOpen, startAccountLink,
    officialLibraryBusy, showDownloads, startPlaylist, syncOfficialLibrary, toggleAlbumFavorite, toggleArtistFavorite, toggleSongFavorite: onToggleSongFavorite,
  }
  const root = document.getElementById('music-home')
  const focusHeaderSearch = searchRoot?.contains(document.activeElement)

  // usePlayer actualiza `currentTime` cada 500 ms, así que esta vista se repinta dos veces por
  // segundo mientras suena algo. Estos tres valores deben conservar su identidad entre ticks:
  // si se recrean, el dock repinta la cola entera y `memo` no sirve de nada.
  const playerRef = useRef(player)
  useEffect(() => {
    playerRef.current = player
  })
  const currentSong = player.currentSong
  const currentTrack = useMemo(() => (currentSong ? adaptSong(currentSong) : null), [currentSong])
  const playerQueue = player.queue
  const adaptedQueue = useMemo(() => playerQueue.map(adaptSong), [playerQueue])
  const handleQueueSelect = useCallback(
    (index) => playerRef.current.playFrom(playerRef.current.queue, index),
    [],
  )

  return (
    <div className="youtube-catalog">
      <ToastHost />
      <main className="music-app__main">
        <div className="music-workspace" key={workspaceKey} ref={workspaceRef}>
          <YoutubeCatalogContent controller={controller} />
        </div>
      </main>
      <audio {...player.audioProps}><track default kind="captions" label="Sin contenido hablado" src="/music-captions.vtt" srcLang="es" /></audio>
      <div ref={player.iframeHostRef} className="youtube-player-engine" aria-hidden="true" />
      {searchRoot && createPortal(
        <MusicSearchPanel
          focusOnMount={focusHeaderSearch}
          history={browse.history}
          onEntitySelect={selectSearchEntity}
          onHistoryAdd={browse.addToHistory}
          onHistoryRemove={browse.removeFromHistory}
          onPrefetch={browse.prefetchSearch}
          onQueryChange={browse.setQuery}
          onSubmit={browse.runGlobalSearch}
          query={browse.query}
        />,
        searchRoot,
      )}
      {currentTrack && root && createPortal(
        <PlayerDock
          collapsed={playerCollapsed}
          externalPlayback={{ analyser: playerAnalyser, commitSeek: player.commitSeek, currentIndex: player.currentIndex, currentTime: player.currentTime, duration: player.progressMax, error: player.playerError, handleSeek: player.handleSeek, isBuffering: player.isBuffering, isPlaying: player.isPlaying, setVolume: player.setVolume, togglePlayback: player.togglePlay, volume: player.volume }}
          onClose={player.closePlayer}
          onOpenMiniPlayer={() => openMiniPlayer().catch(() => {})}
          onNext={player.playNext}
          onPrevious={player.playPrev}
          onQueueSelect={handleQueueSelect}
          onToggleCollapsed={onPlayerCollapseToggle}
          liked={likedSongIds.has(player.currentSong.id)}
          onToggleFavorite={(liked) => onToggleSongFavorite(player.currentSong.id, liked, currentTrack)}
          queue={adaptedQueue}
          track={currentTrack}
          suppressed={suppressed}
        />,
        root,
      )}
    </div>
  )
}

export default YoutubeView
