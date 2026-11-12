import { Download, LoaderCircle, Radio, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import PlayerDock from '../../components/PlayerDock.jsx'
import { connectAudioAnalyser, disconnectAudioAnalyser, resumeAudioContext } from '../../lib/audioAnalyser.js'
import useGlobalMiniPlayer from '../mini-player/useGlobalMiniPlayer.js'
import { useBrowse } from './hooks/useBrowse.js'
import { preloadYoutubePlayer, usePlayer } from './hooks/usePlayer.js'
import { useYoutubeFavorites } from './hooks/useYoutubeFavorites.js'
import { adaptSong } from './lib/adapters.js'
import { captureYoutubeMusicSession, desktopSessionAvailable } from './lib/desktopSession.js'
import { persistedCache } from '../../lib/persistedCache.js'
import { api, clearDetailScope, setDetailScope } from './lib/api.js'
import { writeStorage } from './lib/storage.js'
import { ACCOUNT_STATUS, SERVER_DEGRADED_NOTICE_MS, accountForView, accountRetryDelay, initialAccountState, readAccountSnapshot, reduceAccount, shouldShowAccountNotice, writeAccountSnapshot } from './accountState.js'
import { fetchLibraryOverview, fetchLibraryPage, isUnsupportedLibraryRoute } from './libraryApi.js'
import { chooseLibrary, compactLibrary, LIBRARY_CACHE_KEY, libraryCacheKey } from './libraryCache.js'
import { applyOverview, applyPage, canLoadMore, emptyLibrary, emptyMeta, legacyMeta, withError, withLoading } from './libraryPages.js'
import { LIKED_NAV_ID, publishLibrarySummary, summarizeLibrary } from './librarySummary.js'
import { isEmptyLanding, isLandingKind, landingCache, landingScope, pickLandingView, shouldKeepLanding } from './landingCache.js'
import { perfMark, perfMarkOnce } from './perfMarks.js'
import MusicSearchPanel from './MusicSearchPanel.jsx'
import YoutubeCatalogContent from './YoutubeCatalogContent.jsx'
import { setAccountMenu } from './accountMenuBridge.js'
import { shuffled } from './queueOps.js'
import { showToast } from './toast.js'
import ToastHost from './ToastHost.jsx'

// Clave que useBrowse (generado) usa para recordar la última vista. La app siempre arranca en Inicio: lo último
// visto en otra sesión (Explorar, un artista...) no se restaura. Solo la primera vez que se monta en esta ejecución.
const BROWSE_RESTORE_KEY = 'mysic:youtube:browse-view'
let browseRestoreCleared = false
function clearBrowseRestoreOnce() {
  if (browseRestoreCleared) return
  browseRestoreCleared = true
  writeStorage(BROWSE_RESTORE_KEY, { kind: 'home' })
}

const ACCOUNT_REQUEST_TIMEOUT_MS = 15_000
// Un /account que no responde se corta a los 15 s y cuenta como fallo transitorio, nunca como cuenta desconectada.
function accountRequestSignal(signal) {
  return typeof AbortSignal.any === 'function' && typeof AbortSignal.timeout === 'function'
    ? AbortSignal.any([signal, AbortSignal.timeout(ACCOUNT_REQUEST_TIMEOUT_MS)])
    : signal
}

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
  onAddSongFavorites,
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
  // Cuándo llegó el último Inicio / Explorar real (no la copia guardada): decide si se puede conservar al volver.
  const landingLoadedRef = useRef({})
  const workspaceRef = useRef(null)
  const queueRequestRef = useRef(null)
  clearBrowseRestoreOnce()
  const browse = useBrowse({ progressive: true })
  const { ids: likedArtistIds, toggleFavorite: toggleArtistFavorite } = useYoutubeFavorites(
    `${favoriteStoragePrefix}:favorite-artists`,
    'mysic:youtube:favorite-artists',
  )
  const { ids: likedAlbumIds, toggleFavorite: toggleAlbumFavorite } = useYoutubeFavorites(
    `${favoriteStoragePrefix}:favorite-albums`,
    'mysic:youtube:favorite-albums',
  )
  // Máquina de estados de la cuenta (ver accountState.js): arranca con la instantánea no sensible guardada para
  // este usuario, de modo que una cuenta ya vinculada nunca se pinta como nueva mientras se confirma.
  const [accountState, dispatchAccount] = useReducer(reduceAccount, favoriteStoragePrefix, (prefix) => {
    const state = initialAccountState(readAccountSnapshot(prefix))
    perfMarkOnce('account-snapshot', { status: state.status })
    return state
  })
  const account = accountForView(accountState)
  const accountStateRef = useRef(accountState)
  accountStateRef.current = accountState
  const [, refreshAccountNotice] = useState(0)
  const accountLoadRef = useRef(null)
  const linkIntentRef = useRef(false)
  const [searchRoot, setSearchRoot] = useState(null)
  const [accountHelpOpen, setAccountHelpOpen] = useState(false)
  const [accountBusy, setAccountBusy] = useState(false)
  const [accountError, setAccountError] = useState('')
  const [officialLibraryBusy, setOfficialLibraryBusy] = useState(false)
  const [libraryData, setLibraryData] = useState(null)
  // "Música que me gusta" se abre como una página de playlist por encima de la vista actual. `likedAnchor` guarda la
  // vista del navegador desde la que se abrió: la página se ve mientras esa vista siga siendo la actual, de modo que
  // cualquier navegación la oculta y volver atrás desde un artista o álbum la recupera.
  const [likedAnchor, setLikedAnchor] = useState(null)
  const showLiked = likedAnchor !== null && browse.view === likedAnchor
  const [libraryMeta, setLibraryMeta] = useState(emptyMeta)
  const [libraryOpening, setLibraryOpening] = useState(false)
  const [libraryStatus, setLibraryStatus] = useState({ error: '', lastUpdated: null, loading: false, refreshing: false })
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
  // Una vinculación (iniciada aquí o confirmada por polling) renueva el Inicio y trae la biblioteca por detrás.
  // Nunca abre la Biblioteca: el destino estable es Inicio.
  const refreshPersonalizedHome = useEffectEvent(() => finishLinking())
  const syncFavoritesFromAccount = useEffectEvent(() => syncOfficialLibrary({ show: false, silent: true }))
  const startupSyncedRef = useRef(false)
  const libraryCacheRef = useRef(null)
  const libraryRequestRef = useRef(0)
  const libraryMetaRef = useRef(emptyMeta())
  const libraryPersistRef = useRef(null)
  const libraryAbortRef = useRef(null)
  const libraryKey = libraryCacheKey(favoriteStoragePrefix)
  const reportPlaybackState = useEffectEvent(() => onPlaybackStateChange?.({
    currentSong: player.currentSong,
    isPlaying: player.isPlaying,
  }))
  const toggleRequestedPlayback = useEffectEvent(() => player.togglePlay())

  useEffect(() => {
    preloadYoutubePlayer().catch(() => {})
    // La clave antigua de la biblioteca no era por usuario: se elimina y nunca se lee.
    persistedCache.remove(LIBRARY_CACHE_KEY)
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
    let timer = null
    let failures = 0
    let unverifiedRechecks = 0
    const load = () => {
      clearTimeout(timer)
      api.account(accountRequestSignal(controller.signal)).then((next) => {
        failures = 0
        dispatchAccount({ type: 'loaded', account: next })
        perfMarkOnce('account-confirmed', { status: next.status })
        // Una sesión aún no verificada se consulta pronto. Si el servidor ya está degradado, se respeta su
        // ventana de revalidación de 60 s y se sigue observando hasta que se recupere o confirme la revocación.
        if (next.connected && next.health === 'unverified' && unverifiedRechecks < 2) {
          unverifiedRechecks += 1
          timer = setTimeout(load, 12_000)
        } else if (next.connected && next.health === 'degraded') {
          timer = setTimeout(load, 60_000)
        }
      }).catch((error) => {
        if (controller.signal.aborted) return
        // Un fallo (red, tiempo agotado, 5xx) no es "cuenta desconectada": se conserva el estado y se reintenta.
        failures += 1
        dispatchAccount({ type: 'failed' })
        perfMark('account-failed', { failures, name: error.name })
        timer = setTimeout(load, accountRetryDelay(failures))
      })
    }
    accountLoadRef.current = load
    load()
    return () => {
      controller.abort()
      clearTimeout(timer)
      accountLoadRef.current = null
    }
  }, [])

  // `health: degraded` no interrumpe los datos visibles. El aviso aparece solo si persiste dos minutos.
  useEffect(() => {
    if (accountState.status !== ACCOUNT_STATUS.DEGRADED || accountState.degradedReason !== 'server') return undefined
    const remaining = SERVER_DEGRADED_NOTICE_MS - (Date.now() - accountState.degradedSince)
    if (remaining <= 0) return undefined
    const timer = setTimeout(() => refreshAccountNotice((value) => value + 1), remaining)
    return () => clearTimeout(timer)
  }, [accountState.degradedReason, accountState.degradedSince, accountState.status])

  // Instantánea no sensible para el próximo arranque: solo se actualiza ante una confirmación del servidor.
  useEffect(() => {
    if (accountState.status === ACCOUNT_STATUS.CONNECTED) writeAccountSnapshot(favoriteStoragePrefix, accountState.account)
    else if (accountState.status === ACCOUNT_STATUS.DISCONNECTED || accountState.status === ACCOUNT_STATUS.EXPIRED) writeAccountSnapshot(favoriteStoragePrefix, null)
  }, [accountState, favoriteStoragePrefix])

  useEffect(() => {
    if (account?.status !== 'pending') return undefined
    const controller = new AbortController()
    let polling = false
    const poll = () => {
      if (polling) return
      polling = true
      api.accountLinkStatus(controller.signal).then((nextAccount) => {
        dispatchAccount({ type: 'set', account: nextAccount })
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

  const workspaceKey = showLiked ? 'liked' : browse.view.data?.id
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
    if (showLiked) {
      setLikedAnchor(null)
      return
    }
    browse.goBack()
  }
  // Abre los Me gusta como página de playlist (si aún no hay biblioteca cargada, se pide por detrás).
  function openLiked() {
    saveCurrentScrollPosition()
    setLikedAnchor(browse.view)
    if (!libraryCacheRef.current && accountConnected) void syncOfficialLibrary({ show: false, silent: true })
  }

  // La posición se guarda mientras se desplaza (no solo al abrir un detalle): al cambiar de sección esta vista queda
  // oculta y el scroll compartido se reinicia, y al volver se restaura la posición de esta vista. El oyente se retira
  // en el mismo commit que oculta la sección (layout effect), antes de que el reinicio del scroll lo sobrescriba.
  const workspaceKeyRef = useRef(workspaceKey)
  workspaceKeyRef.current = workspaceKey
  useLayoutEffect(() => {
    if (!active) return undefined
    const content = workspaceRef.current?.closest('.music-app__content')
    if (!content) return undefined
    let frame = 0
    const save = () => {
      frame = 0
      if (!workspaceRef.current?.offsetParent) return
      scrollPositionsRef.current.set(workspaceKeyRef.current, getScrollTargets(workspaceRef.current).map((target) => target.scrollTop))
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(save)
    }
    content.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      content.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [active])

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
      linkIntentRef.current = true
      dispatchAccount({ type: 'set', account: await api.startAccountLink() })
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
      dispatchAccount({ type: 'set', account: nextAccount })
      await finishLinking()
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
      dispatchAccount({ type: 'set', account: nextAccount })
      await finishLinking()
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
      dispatchAccount({ type: 'set', account: await api.unlinkAccount() })
      forgetLibrary()
      clearLandingScopes()
      browse.showHome()
    } catch (error) {
      setAccountError(error.message || 'No se pudo desvincular la cuenta.')
    } finally {
      setAccountBusy(false)
    }
  }

  // Renueva el Inicio y Explorar tras vincular (el contenido anónimo ya no vale) y descarta lo guardado de ambos alcances.
  function clearLandingScopes() {
    landingCache.clearScope(landingScope(favoriteStoragePrefix, { connected: true }))
    landingCache.clearScope(landingScope(favoriteStoragePrefix, { connected: false }))
    // El detalle de álbumes, playlists y artistas también puede ser distinto con otra cuenta.
    clearDetailScope(landingScope(favoriteStoragePrefix, { connected: true }))
    clearDetailScope(landingScope(favoriteStoragePrefix, { connected: false }))
  }

  // Guarda la biblioteca en memoria y, con un pequeño retraso, en disco (compacta, por usuario): la próxima apertura,
  // incluso tras reiniciar, es instantánea. Cada página nueva no reescribe el disco: se agrupan. El estado de React
  // alimenta la Biblioteca para que se actualice en el sitio, sin cambiar de vista.
  function rememberLibrary(library) {
    libraryCacheRef.current = library
    setLibraryData(library)
    clearTimeout(libraryPersistRef.current)
    libraryPersistRef.current = setTimeout(() => persistedCache.write(libraryKey, compactLibrary(libraryCacheRef.current ?? library)), 1000)
  }
  function updateLibraryMeta(meta) {
    libraryMetaRef.current = meta
    setLibraryMeta(meta)
  }
  function forgetLibrary() {
    libraryRequestRef.current += 1 // cualquier respuesta en vuelo de la cuenta anterior se descarta
    libraryAbortRef.current?.abort()
    clearTimeout(libraryPersistRef.current)
    libraryCacheRef.current = null
    setLibraryData(null)
    updateLibraryMeta(emptyMeta())
    setLibraryStatus({ error: '', lastUpdated: null, loading: false, refreshing: false })
    persistedCache.remove(libraryKey)
  }
  useEffect(() => () => clearTimeout(libraryPersistRef.current), [])

  // La biblioteca guardada se carga al montar: la barra lateral muestra tus playlists y Me gusta desde el primer
  // momento, sin visitar la Biblioteca ni esperar a la red (la sincronización la actualiza por detrás).
  useEffect(() => {
    if (libraryCacheRef.current) return
    const cached = persistedCache.read(libraryKey)
    if (cached) {
      libraryCacheRef.current = cached
      setLibraryData((current) => current ?? cached)
    }
  }, [libraryKey])
  // Resumen para la barra lateral (playlists de la cuenta y Me gusta): se publica solo si cambia.
  useEffect(() => {
    publishLibrarySummary(summarizeLibrary(libraryData, { likedHasMore: Boolean(libraryMeta.hasMore?.['liked-songs']) }))
  }, [libraryData, libraryMeta])

  // Siguiente página de una categoría (la pide la Biblioteca al acercarse al final de lo cargado). Las páginas de
  // una sincronización anterior o de otra cuenta se ignoran; un fallo detiene la carga automática de esa categoría.
  async function loadMoreLibrary(kind) {
    const before = libraryMetaRef.current
    if (!canLoadMore(before, kind)) return false
    const requestId = libraryRequestRef.current
    updateLibraryMeta(withLoading(before, kind, true))
    try {
      const page = await fetchLibraryPage(kind, before.cursors[kind], libraryAbortRef.current?.signal)
      if (requestId !== libraryRequestRef.current) return false
      const next = applyPage(libraryCacheRef.current ?? emptyLibrary(), libraryMetaRef.current, kind, page)
      rememberLibrary(next.library)
      updateLibraryMeta(withLoading(next.meta, kind, false))
      if (kind === 'liked-songs') onAddSongFavorites(page.items.map((song) => adaptSong(song)))
      return true
    } catch (error) {
      if (error.name === 'AbortError' || requestId !== libraryRequestRef.current) return false
      updateLibraryMeta(withLoading(withError(libraryMetaRef.current, kind, error.code ?? (error.status === 410 ? 'CURSOR_EXPIRED' : 'LIBRARY_PAGE_FAILED')), kind, false))
      return false
    }
  }

  // Los Me gusta se completan por detrás (sin bloquear nada) para que los corazones de todas las listas estén al día.
  async function completeLikedSongsInBackground(requestId) {
    for (let page = 0; page < 20; page += 1) {
      if (requestId !== libraryRequestRef.current || !canLoadMore(libraryMetaRef.current, 'liked-songs')) return
      if (!(await loadMoreLibrary('liked-songs'))) return
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }

  // Trae la biblioteca de la cuenta vinculada: primero la primera página de cada categoría (rápido) y el resto bajo
  // demanda. Con show:false no cambia de vista (actualiza la Biblioteca en el sitio); con silent:true un fallo no
  // abre el panel de ayuda. Devuelve si tuvo éxito. Una respuesta de una petición anterior o de otra cuenta se
  // ignora, y una vacía nunca pisa una útil. Si el servidor no tiene la biblioteca por páginas, usa /library.
  async function syncOfficialLibrary(options) {
    const { show = true, silent = false, fresh = false } = options?.nativeEvent ? {} : options ?? {}
    const requestId = libraryRequestRef.current + 1
    libraryRequestRef.current = requestId
    libraryAbortRef.current?.abort()
    const controller = new AbortController()
    libraryAbortRef.current = controller
    const previous = libraryCacheRef.current ?? persistedCache.read(libraryKey)
    setOfficialLibraryBusy(true)
    setLibraryStatus((current) => ({ ...current, error: '', loading: !previous, refreshing: Boolean(previous) }))
    if (!silent) setAccountError('')
    try {
      let overview = null
      try {
        overview = await fetchLibraryOverview({ fresh, signal: controller.signal })
      } catch (error) {
        if (!isUnsupportedLibraryRoute(error)) throw error
      }
      if (requestId !== libraryRequestRef.current) return false

      let fetched
      let meta
      let favorites
      if (overview) {
        const applied = applyOverview(previous ?? emptyLibrary(), overview)
        fetched = applied.library
        meta = applied.meta
        favorites = overview.sections?.likedSongs?.items ?? []
      } else {
        fetched = await api.sessionLibrary({ fresh, signal: controller.signal })
        if (requestId !== libraryRequestRef.current) return false
        meta = legacyMeta()
        favorites = fetched.likedSongs ?? []
      }
      const { library } = chooseLibrary(previous, fetched)
      rememberLibrary(library)
      updateLibraryMeta(meta)
      onAddSongFavorites(favorites.map((song) => adaptSong(song)))
      perfMarkOnce('library-first-page', { paged: Boolean(overview) })
      perfMark('library-refresh-done', { fresh, paged: Boolean(overview) })
      setLibraryStatus({ error: '', lastUpdated: Date.now(), loading: false, refreshing: false })
      if (show) browse.showOfficialLibrary(library)
      if (show) setAccountHelpOpen(false)
      void completeLikedSongsInBackground(requestId)
      return true
    } catch (error) {
      if (error.name === 'AbortError' || requestId !== libraryRequestRef.current) return false
      const message = error.message || 'No se pudo sincronizar la biblioteca oficial de YouTube.'
      setLibraryStatus((current) => ({ ...current, error: message, loading: false, refreshing: false }))
      if (!silent) {
        setAccountError(message)
        // El panel de vinculación solo se ofrece si la cuenta no está vinculada: un fallo transitorio no lo abre.
        if (!accountForView(accountStateRef.current)?.connected) setAccountHelpOpen(true)
      }
      return false
    } finally {
      if (requestId === libraryRequestRef.current) setOfficialLibraryBusy(false)
    }
  }
  // Tras vincular: se renueva el Inicio y los Me gusta y playlists llegan por detrás. Nunca se abre la Biblioteca.
  async function finishLinking() {
    linkIntentRef.current = false
    clearLandingScopes()
    browse.showHome()
    void syncOfficialLibrary({ show: false, silent: true })
  }

  // Navegación desde la barra lateral (Inicio / Explorar / Biblioteca). Si esta vista aún no estaba montada
  // cuando se pidió, la petición queda en window.__mysicYoutubeNav y se aplica al montar.
  // Inicio y Explorar ya cargados y recientes se conservan (secciones, páginas extra y scroll): volver desde otra
  // sección no los vacía ni los pide de nuevo. Pulsar el mismo botón estando ya ahí sube al principio.
  const applySidebarNavigation = useEffectEvent((view) => {
    setLikedAnchor(null)
    // Una playlist o los Me gusta elegidos en la barra lateral llegan como objeto: { type: 'playlist', id } o { type: 'liked' }.
    if (view && typeof view === 'object') {
      if (view.type === 'playlist' && view.id) openPlaylist(view.id)
      else if (view.type === 'liked') openLiked()
      return
    }
    const kind = view === 'explore' ? 'explore' : view === 'library' ? null : 'home'
    if (kind && shouldKeepLanding({ error: browse.error, kind, loadedAt: landingLoadedRef.current[kind], view: browse.view })) {
      if (active) getScrollTargets(workspaceRef.current)[0]?.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    if (view === 'explore') browse.showExplore()
    else if (view === 'library') openLibrary()
    else browse.showHome()
  })

  // La biblioteca se abre al instante con lo último descargado (sin esperar a la red en cada clic) y se refresca
  // por detrás, en el sitio. Solo un fallo en frío (sin nada guardado) muestra un esqueleto mientras carga.
  function openLibrary() {
    if (browse.view.kind === 'official-library') return
    const cached = libraryCacheRef.current ?? persistedCache.read(libraryKey)
    if (cached) {
      libraryCacheRef.current = cached
      setLibraryData((current) => current ?? cached)
      browse.showOfficialLibrary(cached)
      perfMarkOnce('library-first-page', { source: 'cache' })
      void syncOfficialLibrary({ show: false, silent: true })
      return
    }
    setLibraryOpening(true)
    void syncOfficialLibrary().finally(() => setLibraryOpening(false))
  }
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
  // Con la cuenta ya vinculada, los Me gusta de YouTube Music se traen como favoritas al abrir la app.
  useEffect(() => {
    if (!accountConnected || startupSyncedRef.current) return
    startupSyncedRef.current = true
    // Unos segundos después de pintar, para no competir con la primera carga.
    const timer = setTimeout(syncFavoritesFromAccount, 4000)
    return () => {
      clearTimeout(timer)
      startupSyncedRef.current = false
    }
  }, [accountConnected])
  useEffect(() => {
    setAccountMenu(accountKnown
      ? { actions: accountMenuActions, busy: accountBusy, connected: accountConnected, syncBusy: officialLibraryBusy }
      : null)
    return () => setAccountMenu(null)
  }, [accountBusy, accountConnected, accountKnown, accountMenuActions, officialLibraryBusy])

  // Cache-first de Inicio y Explorar: el hook (generado) vacía la vista al navegar y espera a la red; aquí se
  // superpone la última copia guardada de este usuario y cuenta para no pintar nunca un hueco, y se guarda cada
  // respuesta válida. Una respuesta vacía no reemplaza una buena. La caché separa usuario y cuenta personalizada.
  const liveView = browse.view
  const landingReadScope = landingScope(favoriteStoragePrefix, account)
  // Antes de que cualquier hijo pida un detalle en este render: la caché de detalle usa el mismo alcance.
  setDetailScope(landingReadScope)
  const cachedLanding = useMemo(
    () => (isLandingKind(liveView.kind) && isEmptyLanding(liveView.data) ? landingCache.get(landingReadScope, liveView.kind) : null),
    [landingReadScope, liveView.data, liveView.kind],
  )
  const { source: landingSource, view: pickedView } = pickLandingView(liveView, cachedLanding)
  const shownView = showLiked ? { kind: 'liked', data: null } : pickedView
  // La barra lateral resalta la sección o la playlist abierta: se le dice qué vista hay y de qué elemento es.
  const shownViewId = showLiked ? LIKED_NAV_ID : shownView.data?.id ?? null
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('mysic:youtube-view', { detail: { id: shownViewId, kind: shownView.kind } }))
  }, [shownView.kind, shownViewId])
  useEffect(() => {
    if (!isLandingKind(liveView.kind) || isEmptyLanding(liveView.data)) return
    // El propio servidor dice si la respuesta es personalizada: ese dato decide el alcance, no la cuenta que se crea tener.
    const connected = typeof liveView.data.personalized === 'boolean' ? liveView.data.personalized : Boolean(account?.connected)
    landingCache.set(landingScope(favoriteStoragePrefix, { connected }), liveView.kind, liveView.data)
    landingLoadedRef.current[liveView.kind] = Date.now()
    perfMarkOnce('landing-first-content', { kind: liveView.kind, source: 'live' })
  }, [account?.connected, favoriteStoragePrefix, liveView.data, liveView.kind])
  useEffect(() => {
    if (landingSource !== 'live') perfMarkOnce('landing-first-content', { kind: shownView.kind, source: landingSource })
  }, [landingSource, shownView.kind])
  const shownBrowse = { ...browse, view: shownView }
  const accountNotice = shouldShowAccountNotice(accountState)
    ? accountState.degradedReason === 'server'
      ? 'YouTube Music lleva varios minutos sin poder verificar tu sesión. Tus datos guardados siguen disponibles.'
      : 'No se pudo comprobar tu cuenta de YouTube Music. Mostrando lo último guardado.'
    : ''

  const controller = {
    accountNotice, landing: { refreshing: browse.loading && !isEmptyLanding(shownView.data), scope: landingReadScope, source: landingSource },
    libraryData, libraryMeta, libraryOpening, libraryStatus, loadMoreLibrary, retryAccount: () => accountLoadRef.current?.(),    downloadedIds: downloads.downloadedIds, enqueueSongs, playShuffled: playShuffledSongs, startRadio, toggleDownload,
    account, accountBusy, accountError, accountHelpOpen, actionError, browse: shownBrowse, changeTab, connectDesktopSession, connectMusicSession, desktopSessionAvailable, disconnectAccount, downloads, goBack, likedAlbumIds, openLiked,
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
          // Los enlaces del reproductor (artista y álbum) llevan a su página; si esta sección está oculta, se vuelve a ella.
          onAlbumSelect={(albumId) => { if (!active) onSearchNavigate?.(); openAlbum(albumId) }}
          onArtistSelect={(artistId) => { if (!active) onSearchNavigate?.(); openArtist(artistId) }}
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
