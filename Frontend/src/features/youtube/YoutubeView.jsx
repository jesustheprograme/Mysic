import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import PlayerDock from '../../components/PlayerDock.jsx'
import NowPlayingOverlay from '../now-playing/NowPlayingOverlay.jsx'
import useListenTracker from '../stats/useListenTracker.js'
import { connectAudioAnalyser, disconnectAudioAnalyser, resumeAudioContext } from '../../lib/audioAnalyser.js'
import useGlobalMiniPlayer from '../mini-player/useGlobalMiniPlayer.js'
import { useBrowse } from './hooks/useBrowse.js'
import { preloadYoutubePlayer, usePlayer } from './hooks/usePlayer.js'
import { useYoutubeFavorites } from './hooks/useYoutubeFavorites.js'
import { adaptSong } from './lib/adapters.js'
import { captureYoutubeMusicSession, desktopSessionAvailable } from './lib/desktopSession.js'
import { persistedCache } from '../../lib/persistedCache.js'
import { api, clearDetailScope, fetchJson, setDetailScope } from './lib/api.js'
import { writeStorage } from './lib/storage.js'
import { ACCOUNT_STATUS, SERVER_DEGRADED_NOTICE_MS, accountForView, accountRetryDelay, initialAccountState, readAccountSnapshot, reduceAccount, shouldShowAccountNotice, writeAccountSnapshot } from './accountState.js'
import { fetchLibraryOverview, fetchLibraryPage, isUnsupportedLibraryRoute } from './libraryApi.js'
import { allowedSongs } from './blockList.js'
import { ContextMenuHost } from './ItemMenus.jsx'
import { noteCollectionPlay } from './recentListens.js'
import { readLiked, removeLiked, writeLiked } from './likedDb.js'
import { loadPlaylistIndex, setLikedAdded, syncPlaylistIndex } from './playlistIndex.js'
import SavedInPlaylists from './SavedInPlaylists.jsx'
import { dedupeById, MAX_LIKED_PAGES, mergeLikedHead, needsFullSync, pageIsKnown } from './likedSync.js'
import { chooseLibrary, LIBRARY_CACHE_KEY, libraryCacheKey, persistLibrary, withoutTrimMark } from './libraryCache.js'
import { applyOverview, applyPage, canLoadMore, emptyLibrary, emptyMeta, legacyMeta, withError, withLoading } from './libraryPages.js'
import { LIKED_NAV_ID, publishLibrarySummary, summarizeLibrary } from './librarySummary.js'
import { isEmptyLanding, isLandingKind, landingCache, landingScope, pickLandingView, shouldKeepLanding } from './landingCache.js'
import { perfMark, perfMarkOnce } from './perfMarks.js'
import MusicSearchPanel from './MusicSearchPanel.jsx'
import YoutubeCatalogContent from './YoutubeCatalogContent.jsx'
import { setAccountMenu } from './accountMenuBridge.js'
import { shuffled } from './queueOps.js'
import { showToast } from './toast.js'
import { spotifyImport } from '../link/spotifyImportStore.js'
import { trackQuery } from './ytLink.js'
import { AUTOPLAY_EVENT, freshSongs, needsTopUp, readAutoplay } from './autoplay.js'
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
const ANALYSER_DELAY_MS = 3000
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
  const [, setQueueLoadingKey] = useState(null)
  const player = usePlayer({
    enabled: active,
    isDownloaded: downloads.isDownloaded,
    onQueueEnd,
    onQueueStart,
  })
  // Petición desde otra sección: una canción, o una lista desde una posición (p. ej. el top de Estadísticas).
  const playRequestedSong = useEffectEvent((song, songs, index = 0) => {
    if (Array.isArray(songs) && songs.length) playFrom(songs, Math.max(0, Math.min(songs.length - 1, index)))
    else playFrom([song], 0, { preserveContext: true })
  })
  const closeRequestedPlayer = useEffectEvent(() => player.closePlayer())
  const playerAudioRef = player.audioProps.ref
  const playerSongId = player.currentSong?.id
  // El espectro escucha el <audio>: canciones descargadas y también las de streaming (directo por mysicstream:// o por el
  // servidor), que llegan con cabeceras CORS y Web Audio puede leer. Solo el iframe de respaldo no se puede analizar.
  const playerUsesElementAudio = player.isLocal || player.isStreamed
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
  // "Me gusta" completos: guardados en IndexedDB y sincronizados por detrás (ver likedSync.js). `likedCompleteRef`
  // indica que la lista en pantalla ya es la completa; `likedSyncRef` evita dos sincronizaciones a la vez.
  const likedCompleteRef = useRef(false)
  const likedSyncRef = useRef(null)
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
    if (!playerUsesElementAudio || !audio) {
      setPlayerAnalyser(null)
      return undefined
    }
    // Crear el AudioContext bloquea el hilo principal (232 ms medidos en el arranque). Con la canción restaurada en
    // pausa no hace falta todavía: se conecta pasados 3 s, con el Inicio ya pintado, o al reproducir si llega antes.
    let connected = false
    const connect = () => {
      if (connected) return
      connected = true
      setPlayerAnalyser(connectAudioAnalyser(audio))
    }
    const onPlay = () => {
      connect()
      resumeAudioContext().catch(() => {})
    }
    audio.addEventListener('play', onPlay)
    const timer = audio.paused ? setTimeout(connect, ANALYSER_DELAY_MS) : 0
    if (!audio.paused) connect()
    return () => {
      clearTimeout(timer)
      audio.removeEventListener('play', onPlay)
      if (connected) disconnectAudioAnalyser(audio)
      setPlayerAnalyser(null)
    }
  }, [playerAudioRef, playerSongId, playerUsesElementAudio])

  const { loadSection } = browse
  const { results } = browse
  useEffect(() => {
    if (results?.type !== 'all') return
    if (results.pending?.includes('artist')) void loadSection('artist')
    if (results.pending?.includes('album')) void loadSection('album')
  }, [loadSection, results?.pending, results?.query, results?.type])

  useEffect(() => {
    if (playbackRequest?.song?.id) playRequestedSong(playbackRequest.song, playbackRequest.songs, playbackRequest.index)
  }, [playbackRequest?.nonce, playbackRequest?.song, playbackRequest?.song?.id, playbackRequest?.songs, playbackRequest?.index])

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

  // Una canción pulsada en un bloque (Selección rápida, Tu descubrimiento diario...) suena ella sola y la reproducción
  // automática le pone su radio detrás; antes sonaba "la siguiente del bloque", que no tiene relación con ella.
  // Con la reproducción automática apagada se mantiene el comportamiento anterior.
  function playSongRadio(sourceSongs, songId) {
    const song = sourceSongs.find((entry) => entry.id === songId)
    if (!song) return
    if (autoplay) playFrom([song], 0)
    else playSongs(sourceSongs, songId)
  }

  // Reproducción automática: al quedar poco por delante se pide la radio de la última canción de la cola y se añaden
  // las que no estén ya. Una petición por canción final (si la radio no trae nada nuevo no se insiste) y solo se aplica
  // si la cola no cambió mientras tanto (el usuario pudo elegir otra cosa): nunca pisa una cola nueva.
  const [autoplay, setAutoplay] = useState(readAutoplay)
  useEffect(() => {
    const onChange = (event) => setAutoplay(Boolean(event.detail))
    window.addEventListener(AUTOPLAY_EVENT, onChange)
    return () => window.removeEventListener(AUTOPLAY_EVENT, onChange)
  }, [])
  const latestPlayerRef = useRef(player)
  const topUpSeedRef = useRef(null)
  useEffect(() => {
    latestPlayerRef.current = player
  })
  const queueForTopUp = player.queue
  const indexForTopUp = player.currentIndex
  // Con YouTube Music al mando (no `suppressed`), esté o no visible su sección: la música sigue sonando aunque se
  // navegue a otra parte (antes dependía de `active` y la cola dejaba de rellenarse).
  useEffect(() => {
    if (!autoplay || suppressed || !needsTopUp({ currentIndex: indexForTopUp, queueLength: queueForTopUp.length })) return undefined
    const seed = queueForTopUp[queueForTopUp.length - 1]
    if (!seed?.id || seed.isLocal || topUpSeedRef.current === seed.id) return undefined
    topUpSeedRef.current = seed.id
    const controller = new AbortController()
    let finished = false
    api.radio(seed.id, controller.signal).then((radio) => {
      finished = true
      if (controller.signal.aborted || latestPlayerRef.current.queue !== queueForTopUp) return
      const more = allowedSongs(freshSongs(radio.songs, queueForTopUp))
      if (more.length) latestPlayerRef.current.enqueue(more)
    }).catch(() => {
      // Sin radio: se reintentará al cambiar la canción final (el seguro de arriba evita bucles).
      if (topUpSeedRef.current === seed.id) topUpSeedRef.current = null
    })
    return () => {
      controller.abort()
      // Una petición cortada por un cambio de cola (no terminada) debe poder repetirse.
      if (!finished && topUpSeedRef.current === seed.id) topUpSeedRef.current = null
    }
  }, [autoplay, indexForTopUp, queueForTopUp, suppressed])

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

  // La radio nunca trae artistas bloqueados ni canciones con "No me gusta" (la canción elegida sí suena).
  function startRadio(song) {
    void loadQueue(`radio:${song.id}`, async (signal) => {
      const radio = await api.radio(song.id, signal)
      return { ...radio, songs: (radio.songs ?? []).filter((entry, index) => index === 0 || allowedSongs([entry]).length) }
    })
  }
  function startPlaylist(playlistId) {
    void loadQueue(`playlist:${playlistId}`, async (signal) => {
      const playlist = await api.playlist(playlistId, signal)
      // Cuenta como escucha de la playlist (para "Volver a escuchar"), no de cada canción suelta.
      if (playlist.songs?.length) noteCollectionPlay('playlist', { id: playlistId, subtitle: 'Playlist', thumbnail: playlist.thumbnail, title: playlist.title }, playlist.songs)
      return playlist
    })
  }

  // Primer resultado de YouTube Music para un texto, con los métodos de búsqueda de siempre (api.search por tipo).
  async function firstMatch(query, type) {
    const result = await api.search(query, type)
    return result.items?.find((item) => item.id) ?? null
  }

  // "Abrir enlace": una canción suena con su radio detrás (como al pulsar cualquier canción); lo demás se abre.
  // Los enlaces de Spotify se buscan en YouTube Music por título y artista.
  async function openLinkTarget(target) {
    try {
      if (target?.kind === 'song') startRadio({ id: target.id })
      else if (target?.kind === 'playlist') openPlaylist(target.id)
      else if (target?.kind === 'album') openAlbum(target.id)
      else if (target?.kind === 'artist') openArtist(target.id)
      else if (target?.kind === 'spotify') await openSpotifyTarget(target)
    } catch (error) {
      showToast(error?.message || 'No se pudo abrir el enlace.')
    }
  }

  async function openSpotifyTarget({ cover, name, owner, tracks, truncated, type }) {
    const notFound = () => showToast('No se encontró en YouTube Music.')
    if (type === 'track') {
      const found = await firstMatch(trackQuery(tracks[0] ?? { title: name }), 'song')
      if (!found) return notFound()
      // Suena exactamente esa canción y detrás su radio (la radio no siempre empieza por la canción de origen).
      const radio = await api.radio(found.id).catch(() => null)
      return playFrom([found, ...(radio?.songs ?? []).filter((song) => song.id !== found.id)], 0)
    }
    if (type === 'artist') {
      const found = await firstMatch(name, 'artist')
      return found ? openArtist(found.id) : notFound()
    }
    if (type === 'album') {
      const found = await firstMatch([name, owner].filter(Boolean).join(' '), 'album')
      return found ? openAlbum(found.id) : notFound()
    }
    // Playlist: se abre el cuadro de importación (vista previa -> progreso -> listo), como en limusic. No abre ninguna
    // página: la playlist queda guardada y aparece la primera en la barra lateral.
    if (!tracks.length) return notFound()
    if (spotifyImport.openPreview({ cover, name, owner, tracks, truncated }).busy) showToast('Ya hay una importación en curso.')
  }

  // Acción de cada fila de canción: solo el ✓ de las que ya están en una playlist tuya (como limusic). Radio, descarga
  // y añadir a playlist siguen en el menú (clic derecho o "…").
  function renderSongActions(song) {
    return <SavedInPlaylists onOpen={openPlaylist} songId={song.id} />
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
    if ((!libraryCacheRef.current || libraryCacheRef.current.likedTotal != null) && accountConnected) void syncOfficialLibrary({ show: false, silent: true })
  }

  // La posición se guarda mientras se desplaza (no solo al abrir un detalle): al cambiar de sección esta vista queda
  // oculta y el scroll compartido se reinicia, y al volver se restaura la posición de esta vista. El oyente se retira
  // en el mismo commit que oculta la sección (layout effect), antes de que el reinicio del scroll lo sobrescriba.
  const workspaceKeyRef = useRef(workspaceKey)
  workspaceKeyRef.current = workspaceKey
  //
  // Rendimiento (medido con el perfil de CPU de un scroll rápido en la Biblioteca): antes se guardaba en cada fotograma
  // comprobando la visibilidad con `offsetParent`, que obliga al navegador a recalcular el diseño justo después de que
  // la cuadrícula monte filas nuevas (447 ms de 13,6 s de perfil, lo más costoso del código propio). Ahora la posición
  // y la vista se capturan en el propio evento de scroll (con el diseño ya calculado: lectura barata) y solo la
  // escritura se aplaza. Así, al cambiar de sección a mitad de un scroll, lo pendiente se guarda con la vista de la que
  // se sale, no con la nueva (Inicio y Biblioteca comparten este oyente: no hay desmontaje entre ellas).
  useLayoutEffect(() => {
    if (!active) return undefined
    const content = workspaceRef.current?.closest('.music-app__content')
    if (!content) return undefined
    let timer = 0
    let pendingSave = null
    const flush = () => {
      timer = 0
      if (pendingSave) scrollPositionsRef.current.set(pendingSave.key, pendingSave.positions)
      pendingSave = null
    }
    const onScroll = () => {
      if (!workspaceRef.current?.isConnected) return
      // Al cambiar de vista, el primer scroll de la nueva (el reinicio a 0) no debe pisar lo pendiente de la anterior.
      if (pendingSave && pendingSave.key !== workspaceKeyRef.current) flush()
      pendingSave = { key: workspaceKeyRef.current, positions: getScrollTargets(workspaceRef.current).map((target) => target.scrollTop) }
      clearTimeout(timer)
      timer = setTimeout(flush, 150)
    }
    content.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      content.removeEventListener('scroll', onScroll)
      clearTimeout(timer)
      flush()
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
    const real = withoutTrimMark(library)
    libraryCacheRef.current = real
    setLibraryData(real)
    clearTimeout(libraryPersistRef.current)
    libraryPersistRef.current = setTimeout(() => persistLibrary(persistedCache, libraryKey, libraryCacheRef.current ?? real), 1000)
  }
  function updateLibraryMeta(meta) {
    libraryMetaRef.current = meta
    setLibraryMeta(meta)
  }
  function forgetLibrary() {
    libraryRequestRef.current += 1 // cualquier respuesta en vuelo de la cuenta anterior se descarta
    libraryAbortRef.current?.abort()
    likedSyncRef.current?.controller.abort()
    likedSyncRef.current = null
    likedCompleteRef.current = false
    clearTimeout(libraryPersistRef.current)
    libraryCacheRef.current = null
    setLibraryData(null)
    updateLibraryMeta(emptyMeta())
    setLibraryStatus({ error: '', lastUpdated: null, loading: false, refreshing: false })
    persistedCache.remove(libraryKey)
    void removeLiked(libraryKey)
  }
  useEffect(() => () => {
    clearTimeout(libraryPersistRef.current)
    likedSyncRef.current?.controller.abort()
  }, [])

  // Pone en pantalla la lista completa de Me gusta (una sola vez, no página a página) y marca la categoría como
  // terminada: nada más que pedir, sin "+" en el contador y sin "Cargando…" en la página.
  function showCompleteLiked(songs) {
    likedCompleteRef.current = true
    rememberLibrary({ ...(libraryCacheRef.current ?? emptyLibrary()), likedSongs: songs })
    const meta = libraryMetaRef.current
    updateLibraryMeta({ ...meta, cursors: { ...meta.cursors, 'liked-songs': null }, hasMore: { ...meta.hasMore, 'liked-songs': false } })
  }

  // La biblioteca guardada se carga al montar: la barra lateral muestra tus playlists y Me gusta desde el primer
  // momento, sin visitar la Biblioteca ni esperar a la red (la sincronización la actualiza por detrás). Los Me gusta
  // completos llegan justo después desde IndexedDB (lectura asíncrona de pocos milisegundos).
  useEffect(() => {
    likedCompleteRef.current = false
    if (!libraryCacheRef.current) {
      const cached = persistedCache.read(libraryKey)
      if (cached) {
        libraryCacheRef.current = cached
        setLibraryData((current) => current ?? cached)
      }
    }
    let cancelled = false
    void loadPlaylistIndex(libraryKey)
    readLiked(libraryKey).then((stored) => {
      // Si una sincronización ya puso la lista completa, lo guardado (más viejo) no la pisa.
      if (cancelled || !stored?.complete || likedCompleteRef.current) return
      setLikedAdded(stored.addedAt)
      showCompleteLiked(stored.songs)
    })
    return () => { cancelled = true }
    // showCompleteLiked solo usa refs y setters estables.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraryKey])
  // Índice de playlists personales (✓ "Guardada en" y fecha de adición): se pone al día por detrás cuando llega la
  // lista de playlists. Solo pide las listas nuevas o cambiadas; sin cambios no hace ninguna petición. Se pide sin la
  // caché de detalle (api.playlist), que podría devolver una copia vieja.
  const libraryPlaylists = libraryData?.playlists
  const indexAllowed = Boolean(account?.connected)
  useEffect(() => {
    if (!libraryPlaylists?.length || !indexAllowed) return
    void syncPlaylistIndex(libraryPlaylists, async (id) => (await fetchJson(`/playlist/${encodeURIComponent(id)}`)).songs ?? [])
  }, [indexAllowed, libraryPlaylists])
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

  /**
   * Sincroniza los Me gusta "en secreto": junta las páginas sin pintarlas y cambia la lista de una sola vez al terminar.
   * Con una lista completa guardada solo pide la cabecera nueva (normalmente 0 páginas extra: la primera ya llegó con
   * la vista general); una vez al día hace la carga completa para notar canciones quitadas en otro dispositivo.
   * No depende de cada sincronización de la biblioteca (abrir la Biblioteca no la corta): solo una a la vez por cuenta.
   */
  async function syncLikedInBackground(firstPage, cursor) {
    if (likedSyncRef.current?.key === libraryKey) return
    const key = libraryKey
    const controller = new AbortController()
    likedSyncRef.current = { controller, key }
    try {
      const stored = await readLiked(key)
      const full = needsFullSync(stored)
      const knownIds = new Set(full ? [] : stored.songs.map((song) => song.id))
      const fetched = [...firstPage]
      let lastPage = firstPage
      let next = cursor
      for (let page = 0; next && page < MAX_LIKED_PAGES; page += 1) {
        if (!full && pageIsKnown(lastPage, knownIds)) break
        await new Promise((resolve) => setTimeout(resolve, 120)) // a ritmo tranquilo: es trabajo de fondo
        if (controller.signal.aborted) return
        const result = await fetchLibraryPage('liked-songs', next, controller.signal)
        lastPage = result.items ?? []
        fetched.push(...lastPage)
        next = result.hasMore ? result.continuation : null
      }
      if (controller.signal.aborted || likedSyncRef.current?.controller !== controller) return
      const songs = full ? dedupeById(fetched) : mergeLikedHead(fetched, stored.songs)
      // Solo es "completa" una lista que llegó hasta el final o que enlazó con lo guardado.
      const complete = !next || (!full && pageIsKnown(lastPage, knownIds))
      if (!songs.length || !complete) return
      // Fecha de adición: lo que no estaba en la lista guardada se vio hoy por primera vez; lo de antes conserva su
      // fecha. La primera sincronización (sin lista guardada) no fecha nada: no se sabe cuándo se añadió.
      const now = Date.now()
      const known = stored ? new Set(stored.songs.map((song) => song.id)) : null
      const addedAt = {}
      for (const song of songs) {
        if (stored?.addedAt?.[song.id]) addedAt[song.id] = stored.addedAt[song.id]
        else if (known && !known.has(song.id)) addedAt[song.id] = now
      }
      onAddSongFavorites(songs.map((song) => adaptSong(song)))
      setLikedAdded(addedAt)
      showCompleteLiked(songs)
      await writeLiked(key, { addedAt, complete: true, fullAt: full ? now : stored.fullAt, songs })
      perfMark('liked-sync-done', { full, pages: Math.ceil(fetched.length / 100), songs: songs.length })
    } catch {
      // Sin red o servidor caído: se queda la lista que había; se reintentará en la próxima sincronización.
    } finally {
      if (likedSyncRef.current?.controller === controller) likedSyncRef.current = null
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
      let likedCursor = null
      if (overview) {
        const applied = applyOverview(previous ?? emptyLibrary(), overview)
        fetched = applied.library
        meta = applied.meta
        favorites = overview.sections?.likedSongs?.items ?? []
        // Los Me gusta siguientes los pide la sincronización de fondo, no la página: con la lista completa en pantalla
        // la categoría queda como terminada (sin "Cargando…" ni contador que crece).
        likedCursor = meta.cursors['liked-songs'] ?? null
        if (likedCompleteRef.current) {
          meta = { ...meta, cursors: { ...meta.cursors, 'liked-songs': null }, hasMore: { ...meta.hasMore, 'liked-songs': false } }
          fetched = { ...fetched, likedSongs: libraryCacheRef.current?.likedSongs ?? fetched.likedSongs }
        }
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
      if (overview) void syncLikedInBackground(favorites, likedCursor)
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
      else if (view.type === 'artist' && view.id) openArtist(view.id)
      else if (view.type === 'album' && view.id) openAlbum(view.id)
      else if (view.type === 'liked') openLiked()
      else if (view.type === 'link') void openLinkTarget(view.target)
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
    likedArtistIds, likedSongIds, onAddToPlaylist, openAlbum, openArtist, openArtistSongs, openPlaylist, player, playSongRadio, playSongs,
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
  // Escuchas para Estadísticas (como Limusic): tiempo oído de verdad, guardado en el equipo.
  useListenTracker({ song: currentSong, position: player.currentTime, duration: player.progressMax, playing: player.isPlaying })
  const currentTrack = useMemo(() => (currentSong ? adaptSong(currentSong) : null), [currentSong])
  const playerQueue = player.queue
  const adaptedQueue = useMemo(() => playerQueue.map(adaptSong), [playerQueue])
  const handleQueueSelect = useCallback(
    (index) => playerRef.current.playFrom(playerRef.current.queue, index),
    [],
  )
  // Los enlaces del reproductor (artista y álbum, también en sus pestañas) llevan a su página; si esta sección está
  // oculta, se vuelve a ella. Estables por la misma razón: leen lo último a través de un ref.
  const dockNavRef = useRef(null)
  useEffect(() => {
    dockNavRef.current = { active, onSearchNavigate, openAlbum, openArtist }
  })
  // Sin id (vídeos subidos, artistas sin canal): se busca por nombre y se abre el que coincida, o el primero.
  const findByName = useCallback(async (type, query, name) => {
    const items = (await api.search(query, type))?.items ?? []
    const wanted = String(name || query).trim().toLocaleLowerCase()
    const label = (item) => String(item.name ?? item.title ?? '').trim().toLocaleLowerCase()
    return (items.find((item) => label(item) === wanted) ?? items[0])?.id ?? null
  }, [])
  const handleDockAlbum = useCallback(async (albumId, title, artist) => {
    const nav = dockNavRef.current
    const id = albumId || (title ? await findByName('album', [title, artist].filter(Boolean).join(' '), title).catch(() => null) : null)
    if (!id) return
    if (!nav.active) nav.onSearchNavigate?.()
    nav.openAlbum(id)
  }, [findByName])
  const handleDockArtist = useCallback(async (artistId, name) => {
    const nav = dockNavRef.current
    const id = artistId || (name ? await findByName('artist', name, name).catch(() => null) : null)
    if (!id) return
    if (!nav.active) nav.onSearchNavigate?.()
    nav.openArtist(id)
  }, [findByName])
  // Tercera forma del controlador (contraído, normal y extenso): "Reproduciendo ahora" a pantalla completa.
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false)
  const openNowPlaying = useCallback(() => setNowPlayingOpen(true), [])
  const closeNowPlaying = useCallback(() => setNowPlayingOpen(false), [])
  const seekFromNowPlaying = useCallback((time) => {
    const event = { target: { value: time } }
    playerRef.current.handleSeek(event)
    playerRef.current.commitSeek(event)
  }, [])
  const changeVolumeFromNowPlaying = useCallback((value) => playerRef.current.setVolume(value / 100), [])
  // Sin canción (se cerró el reproductor) o con otro reproductor al mando, la vista extensa se cierra sola. Un vacío
  // pasajero (al arrancar, la cola se restaura y la canción o el dueño de la reproducción parpadean ~1 s) no la cierra:
  // se mantiene con la última canción y solo se cierra si dura más de 1,5 s.
  const lastTrackRef = useRef(null)
  if (currentTrack) lastTrackRef.current = currentTrack
  const nowPlayingAvailable = Boolean(currentTrack) && !suppressed
  useEffect(() => {
    if (!nowPlayingOpen || nowPlayingAvailable) return undefined
    const timer = setTimeout(() => setNowPlayingOpen(false), 1500)
    return () => clearTimeout(timer)
  }, [nowPlayingAvailable, nowPlayingOpen])
  const nowPlayingTrack = currentTrack ?? lastTrackRef.current
  const showNowPlaying = nowPlayingOpen && Boolean(nowPlayingTrack)

  return (
    <div className="youtube-catalog">
      <ToastHost />
      <ContextMenuHost ctx={controller} />
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
          onAlbumSelect={handleDockAlbum}
          onArtistSelect={handleDockArtist}
          onClose={player.closePlayer}
          onOpenMiniPlayer={() => openMiniPlayer().catch(() => {})}
          onOpenNowPlaying={openNowPlaying}
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
      {showNowPlaying && (
        <NowPlayingOverlay
          currentIndex={player.currentIndex}
          currentTime={player.currentTime}
          duration={player.progressMax}
          isBuffering={player.isBuffering}
          isPlaying={player.isPlaying}
          liked={likedSongIds.has(nowPlayingTrack.id)}
          onAlbumSelect={handleDockAlbum}
          onArtistSelect={handleDockArtist}
          onClose={closeNowPlaying}
          onNext={player.playNext}
          onPrevious={player.playPrev}
          onQueueSelect={handleQueueSelect}
          onSeek={seekFromNowPlaying}
          onToggleFavorite={(liked) => onToggleSongFavorite(nowPlayingTrack.id, liked, nowPlayingTrack)}
          onTogglePlayback={player.togglePlay}
          onVolumeChange={changeVolumeFromNowPlaying}
          queue={adaptedQueue}
          track={nowPlayingTrack}
          volume={Math.round(player.volume * 100)}
        />
      )}
    </div>
  )
}

export default YoutubeView
