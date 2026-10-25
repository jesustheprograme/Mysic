import { lazy, Suspense, useCallback, useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react'
import AppHeader from '../../components/AppHeader.jsx'
import AppSidebar from '../../components/AppSidebar.jsx'
import AlbumView from '../collections/AlbumView.jsx'
import ArtistView from '../collections/ArtistView.jsx'
import PlaylistEditorModal from '../playlists/PlaylistEditorModal.jsx'
import PlaylistPickerModal from '../playlists/PlaylistPickerModal.jsx'
import PlaylistView from '../playlists/PlaylistView.jsx'
import HomeDiscoveryPrompt from './HomeDiscoveryPrompt.jsx'
import HomeRail from './HomeRail.jsx'
import SectionRoute from './SectionRoute.jsx'
import SongList from './SongList.jsx'
import {
  listenToMiniPlayerCommands,
  claimMiniPlayer,
  ownsMiniPlayer,
  publishPlaybackState,
} from '../mini-player/playerBridge.ts'
import { openMiniPlayerWindow } from '../mini-player/openMiniPlayerWindow.tsx'
import { catalogApi } from '../../lib/api.js'
import { primeAutoplay } from '../auth/autoplayUnlock.js'
import { canImportMusic } from '../music-import/musicImportAccess.js'

const MusicImportView = lazy(() => import('../music-import/MusicImportView.jsx'))
const NewArtistSpotlight = lazy(() => import('./NewArtistSpotlight.jsx'))
const PlayerDock = lazy(() => import('../../components/PlayerDock.jsx'))
const YoutubeView = lazy(() => import('../youtube/YoutubeView.jsx'))
import {
  createAlbumItems,
  createArtistItems,
  getAlbumIdFromHash,
  getArtistIdFromHash,
  getFollowingSongs,
  getPlaylistIdFromHash,
  getSectionFromHash,
  sectionHashes,
  shuffleSongs,
} from './utilidades/navegacionDescubrimiento.js'

function useSongPreview(disabled) {
  const [preview, setPreview] = useState(null)
  const audioRef = useRef(null)
  const unlockedRef = useRef(false)
  const itemIdRef = useRef(null)
  const timerRef = useRef(null)

  useEffect(() => {
    const audio = new Audio()
    const clearPreview = () => {
      itemIdRef.current = null
      setPreview(null)
    }
    const removeUnlockListeners = () => {
      document.removeEventListener('click', unlockAudio, true)
      document.removeEventListener('keydown', unlockAudio, true)
    }
    const unlockAudio = () => {
      if (unlockedRef.current || !audio.src) return
      audio.volume = 0
      audio.play().then(() => {
        audio.pause()
        audio.currentTime = 0
        audio.volume = 0.35
        unlockedRef.current = true
        removeUnlockListeners()
      }).catch(() => { audio.volume = 0.35 })
    }

    audio.preload = 'metadata'
    audio.addEventListener('ended', clearPreview)
    document.addEventListener('click', unlockAudio, true)
    document.addEventListener('keydown', unlockAudio, true)
    audioRef.current = audio
    return () => {
      clearTimeout(timerRef.current)
      itemIdRef.current = null
      audio.pause()
      audio.removeEventListener('ended', clearPreview)
      removeUnlockListeners()
      audio.removeAttribute('src')
      audio.load()
      audioRef.current = null
    }
  }, [])

  function startPreview(item) {
    const audio = audioRef.current
    if (disabled || !audio || !item.audioUrl || itemIdRef.current === item.id) return
    clearTimeout(timerRef.current)
    audio.pause()
    itemIdRef.current = item.id
    setPreview({ itemId: item.id, status: 'loading' })
    timerRef.current = setTimeout(async () => {
      if (itemIdRef.current !== item.id) return
      if (audio.src !== new URL(item.audioUrl, window.location.href).href) {
        audio.src = item.audioUrl
        audio.load()
      }
      audio.currentTime = 0
      audio.volume = 0.35
      try {
        await audio.play()
        if (itemIdRef.current === item.id) setPreview({ itemId: item.id, status: 'playing' })
      } catch {
        if (itemIdRef.current === item.id) {
          itemIdRef.current = null
          setPreview(null)
        }
      }
    }, 3000)
  }

  function stopPreview() {
    const audio = audioRef.current
    clearTimeout(timerRef.current)
    itemIdRef.current = null
    setPreview(null)
    if (!audio) return
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
  }

  return { preview, startPreview, stopPreview }
}

function usePlaylistActions({
  activePlaylist, addSongToPlaylist, createPlaylist, navigateTo, navigateToPlaylist,
  onDeletePlaylist, onSetExternalSongInPlaylist, onUpdatePlaylist, setActivePlaylistId,
  setPlaylistPickerSong,
}) {
  const [playlistEditor, setPlaylistEditor] = useState(null)

  function openCreatePlaylist(pendingSong = null) {
    setPlaylistPickerSong(null)
    setPlaylistEditor({ mode: 'create', initialPlaylist: null, pendingSong })
  }

  function openEditPlaylist(playlist) {
    const target = playlist?.id ? playlist : activePlaylist
    if (target) setPlaylistEditor({ mode: 'edit', initialPlaylist: target, pendingSong: null })
  }

  async function savePlaylist(details) {
    if (!playlistEditor) return
    if (playlistEditor.mode === 'create') {
      const playlistId = await createPlaylist(details)
      if (!playlistId) return
      const pendingSong = playlistEditor.pendingSong
      if (pendingSong?.source === 'youtube') await onSetExternalSongInPlaylist(playlistId, pendingSong, true)
      else if (pendingSong?.id) await addSongToPlaylist(playlistId, pendingSong.id)
      setPlaylistEditor(null)
      navigateToPlaylist(playlistId)
      return
    }
    const updated = await onUpdatePlaylist(playlistEditor.initialPlaylist.id, details)
    if (updated) setPlaylistEditor(null)
  }

  function togglePlaylistPinned(playlist) {
    const target = playlist?.id ? playlist : activePlaylist
    if (target) onUpdatePlaylist(target.id, { pinned: !target.pinned })
  }

  async function deletePlaylist(playlist) {
    const deleted = await onDeletePlaylist?.(playlist.id)
    if (!deleted) return false
    setActivePlaylistId(null)
    navigateTo('playlists')
    return true
  }

  return { deletePlaylist, openCreatePlaylist, openEditPlaylist, playlistEditor, savePlaylist, setPlaylistEditor, togglePlaylistPinned }
}

function useSongSelection({
  autoSpotlightBlockedRef, discoveryLoadingTimerRef, onSongSelect, playbackSongs, selectedSongId,
  setDiscoveryLoading, setDiscoveryMix, setPlayerAnimationNonce, setPlayerFadeInNonce,
  setSelectedSongContext, setSelectedSongPlaying, songs, stopPreview,
}) {
  function selectSong(songId, {
    animatePlayer = true,
    contextSong = null,
    contextSongs = null,
    fadeIn = false,
    preserveDiscoveryMix = false,
  } = {}) {
    if (songId !== null) autoSpotlightBlockedRef.current = true
    clearTimeout(discoveryLoadingTimerRef.current)
    setDiscoveryLoading(false)
    if (contextSongs) setDiscoveryMix(contextSongs)
    else if (!preserveDiscoveryMix) setDiscoveryMix([])
    setSelectedSongContext(contextSong?.id === songId ? contextSong : null)
    stopPreview()
    setSelectedSongPlaying(false)
    if (songId !== null && animatePlayer) setPlayerAnimationNonce((nonce) => nonce + 1)
    if (songId !== null && fadeIn) setPlayerFadeInNonce((nonce) => nonce + 1)
    onSongSelect(songId)
  }

  function selectRelativeSong(offset) {
    const currentIndex = playbackSongs.findIndex((song) => song.id === selectedSongId)
    const startIndex = currentIndex >= 0 ? currentIndex : 0
    const nextIndex = (startIndex + offset + playbackSongs.length) % playbackSongs.length
    selectSong(playbackSongs[nextIndex].id, { animatePlayer: false, contextSong: playbackSongs[nextIndex], preserveDiscoveryMix: true })
  }

  function startWeeklyDiscovery() {
    const weeklyMix = shuffleSongs(songs)
    const firstSong = weeklyMix[0]
    if (!firstSong) return
    autoSpotlightBlockedRef.current = true
    clearTimeout(discoveryLoadingTimerRef.current)
    stopPreview()
    setDiscoveryMix(weeklyMix)
    setSelectedSongContext(null)
    setDiscoveryLoading(false)
    setSelectedSongPlaying(false)
    setPlayerAnimationNonce((nonce) => nonce + 1)
    onSongSelect(firstSong.id)
  }

  return { selectRelativeSong, selectSong, startWeeklyDiscovery }
}

function useMiniPlayerCommandListener({ playbackSongs, selectRelativeSong, selectSong }) {
  const handleCommand = useEffectEvent((command) => {
    if (!ownsMiniPlayer('mysic')) return
    if (command.type === 'next') return selectRelativeSong(1)
    if (command.type === 'previous') return selectRelativeSong(-1)
    if (command.type === 'select') {
      selectSong(command.songId, {
        animatePlayer: false,
        contextSong: playbackSongs.find((song) => song.id === command.songId) ?? null,
        preserveDiscoveryMix: true,
      })
    }
  })

  useEffect(() => {
    let unlisten = () => {}
    let disposed = false
    listenToMiniPlayerCommands(handleCommand).then((cleanup) => {
      if (disposed) cleanup()
      else unlisten = cleanup
    })
    return () => {
      disposed = true
      unlisten()
    }
  }, [])
}

function useDiscoveryNavigation({
  activeSection, autoSpotlightBlockedRef, mayImportMusic, setActiveAlbumId, setActiveArtistId,
  setActivePlaylistId, setActiveSection, setYoutubeVisited,
}) {
  function pushHash(nextHash, fallbackHash) {
    if (window.location.hash !== nextHash) {
      window.history.pushState({ previousAppHash: window.location.hash || fallbackHash }, '', nextHash)
    }
  }

  function resetDetailIds() {
    setActiveAlbumId(null)
    setActiveArtistId(null)
    setActivePlaylistId(null)
  }

  function navigateTo(section) {
    if (section === 'import' && !mayImportMusic) return
    const nextHash = sectionHashes[section]
    if (!nextHash) return
    autoSpotlightBlockedRef.current = true
    if (section === 'youtube') {
      setYoutubeVisited(true)
      if (activeSection === 'youtube') window.dispatchEvent(new CustomEvent('mysic:global-home'))
    }
    setActiveSection(section)
    resetDetailIds()
    pushHash(nextHash, sectionHashes.home)
  }

  function navigateToPlaylist(playlistId) {
    autoSpotlightBlockedRef.current = true
    setActiveSection('playlist')
    setActiveAlbumId(null)
    setActiveArtistId(null)
    setActivePlaylistId(playlistId)
    pushHash(`#playlist-${playlistId}`, sectionHashes.playlists)
  }

  function navigateToAlbum(albumId) {
    autoSpotlightBlockedRef.current = true
    setActiveSection('album')
    setActiveAlbumId(albumId)
    setActiveArtistId(null)
    setActivePlaylistId(null)
    pushHash(`#${albumId}`, sectionHashes.albums)
  }

  function navigateToArtist(artistId) {
    if (!artistId) return
    autoSpotlightBlockedRef.current = true
    setActiveSection('artist')
    setActiveArtistId(artistId)
    setActiveAlbumId(null)
    setActivePlaylistId(null)
    pushHash(`#artist-${artistId}`, sectionHashes.artists)
  }

  function navigateBack(fallbackSection) {
    autoSpotlightBlockedRef.current = true
    if (window.history.state?.previousAppHash) window.history.back()
    else navigateTo(fallbackSection)
  }

  return { navigateBack, navigateTo, navigateToAlbum, navigateToArtist, navigateToPlaylist }
}

function resolveSelectedSong(selectedSongContext, selectedSongId, songs) {
  if (selectedSongContext?.id === selectedSongId) return selectedSongContext
  return songs.find((song) => song.id === selectedSongId) ?? null
}

function resolveActiveArtist(activeArtistItem, activeArtistProfile, activeArtistId) {
  if (!activeArtistItem || activeArtistProfile?.id !== activeArtistId) return activeArtistItem
  return {
    ...activeArtistItem,
    artwork: activeArtistProfile.artwork,
    images: activeArtistProfile.images,
  }
}

function getMobileContextTitle(activeSection, activeArtist, activeAlbum, activePlaylist) {
  const contextTitles = {
    artist: activeArtist?.title,
    album: activeAlbum?.title,
    playlist: activePlaylist?.title,
  }
  return contextTitles[activeSection] ?? null
}

function useDiscoveryPage({
  addSongToPlaylist,
  catalogHasMore,
  catalogLoadingMore,
  createPlaylist,
  likedAlbumIds,
  likedArtistIds,
  likedSongIds,
  onImportNav,
  onCatalogRefresh,
  onCatalogLoadMore,
  onLogout,
  onDeletePlaylist,
  onReorderPlaylist,
  onSearchChange,
  onSetExternalSongInPlaylist,
  onSetSongInPlaylist,
  onSongSelect,
  onToggleAlbumFavorite,
  onToggleArtistFavorite,
  onToggleFavorite,
  onUpdatePlaylist,
  playlists,
  searchQuery,
  searchSongs,
  selectedSongId,
  songs,
  user,
}) {
  const mayImportMusic = canImportMusic(user)
  const [activeSection, setActiveSection] = useState(() => {
    const requestedSection = getSectionFromHash()
    return requestedSection === 'import' && !mayImportMusic ? 'home' : requestedSection
  })
  // YouTube Music se monta la primera vez que se visita y ya no se desmonta (la música sigue al cambiar de sección)
  const [youtubeVisited, setYoutubeVisited] = useState(activeSection === 'youtube')
  const [youtubePlayerVisible, setYoutubePlayerVisible] = useState(false)
  const [activeAlbumId, setActiveAlbumId] = useState(getAlbumIdFromHash)
  const [activeArtistId, setActiveArtistId] = useState(getArtistIdFromHash)
  const [activeArtistProfile, setActiveArtistProfile] = useState(null)
  const [spotlightArtist, setSpotlightArtist] = useState(null)
  const [activePlaylistId, setActivePlaylistId] = useState(getPlaylistIdFromHash)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileBrandHidden, setMobileBrandHidden] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [playerCollapsed, setPlayerCollapsed] = useState(false)
  const [discoveryLoading, setDiscoveryLoading] = useState(false)
  const [discoveryMix, setDiscoveryMix] = useState([])
  const [selectedSongContext, setSelectedSongContext] = useState(null)
  const [selectedSongPlaying, setSelectedSongPlaying] = useState(false)
  const [playerAnimationNonce, setPlayerAnimationNonce] = useState(0)
  const [playerFadeInNonce, setPlayerFadeInNonce] = useState(0)
  const [playbackToggleNonce, setPlaybackToggleNonce] = useState(0)
  const [playerAnalyser, setPlayerAnalyser] = useState(null)
  const [playlistPickerSong, setPlaylistPickerSong] = useState(null)
  const autoSpotlightBlockedRef = useRef(false)
  const playbackStateRef = useRef({ currentTime: 0, duration: 0, isPlaying: false, volume: 75 })
  const contentRef = useRef(null)
  const discoveryLoadingTimerRef = useRef(null)
  const scrollPositionsRef = useRef(new Map())
  const mobileBrandHiddenRef = useRef(false)
  const activeRouteKey = `${activeSection}-${activePlaylistId ?? activeAlbumId ?? activeArtistId ?? ''}`
  const selectedSong = resolveSelectedSong(selectedSongContext, selectedSongId, songs)
  const playbackSongs = discoveryMix.length ? discoveryMix : songs
  const nextSongs = getFollowingSongs(playbackSongs, selectedSongId)
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase()
  const filteredSongs = normalizedQuery ? searchSongs : songs

  useEffect(() => {
    if (!mobileMenuOpen) return undefined

    function closeMobileMenu(event) {
      if (event.key === 'Escape') setMobileMenuOpen(false)
    }

    document.addEventListener('keydown', closeMobileMenu)
    return () => document.removeEventListener('keydown', closeMobileMenu)
  }, [mobileMenuOpen])

  // Si empieza a sonar YouTube Music, se pausa el reproductor de Mysic
  useEffect(() => {
    if (!selectedSongPlaying) return undefined
    const pauseMysicPlayer = () => setPlaybackToggleNonce((nonce) => nonce + 1)
    window.addEventListener('yotubei:play', pauseMysicPlayer)
    return () => window.removeEventListener('yotubei:play', pauseMysicPlayer)
  }, [selectedSongPlaying])

  function getShelfSongs(titles) {
    const selectedSongs = titles.reduce((selected, title) => {
      const song = filteredSongs.find((item) => item.title === title)
      if (song) selected.push(song)
      return selected
    }, [])
    const selectedIds = new Set(selectedSongs.map((song) => song.id))
    const additionalSongs = filteredSongs.filter((song) => !selectedIds.has(song.id)).slice(0, 6)
    return [...selectedSongs, ...additionalSongs]
  }

  const recentSongs = getShelfSongs([
    'After Hours 3',
    'Tidal Memory 3',
    'Golden Hour 3',
    'Red Horizon 3',
    'Quiet Signal 3',
    'Low Tide 3',
  ])
  const newReleaseSongs = getShelfSongs([
    'Open Roads 3',
    'Paper Moons 3',
    'Slow Signal 3',
    'Northern Lines 3',
    'Soft Focus 3',
    'Ember Glass 3',
  ]).map((song) => ({ ...song, badge: 'NUEVO', detail: 'EP \u00b7 2024' }))
  const albumItems = createAlbumItems(filteredSongs)
  const allAlbumItems = createAlbumItems(songs)
  const artistItems = createArtistItems(filteredSongs)
  const availableSongIds = new Set(songs.map((song) => song.id))
  const resolvedPlaylists = playlists.map((playlist) => ({
    ...playlist,
    externalSongs: playlist.externalSongs ?? [],
    songIds: playlist.songIds.filter((songId) => availableSongIds.has(songId)),
  }))
  const playlistsWithArtwork = resolvedPlaylists.map((playlist) => {
    if (playlist.artwork) return playlist
    const firstSong = playlist.songIds
      .map((songId) => songs.find((song) => song.id === songId))
      .find(Boolean) ?? playlist.externalSongs[0]
    return firstSong?.artwork ? { ...playlist, artwork: firstSong.artwork } : playlist
  })
  const orderedPlaylists = playlistsWithArtwork
    .toSorted((first, second) => Number(second.pinned) - Number(first.pinned))
    .map((playlist) => ({ ...playlist, meta: `${playlist.songIds.length + playlist.externalSongs.length} canciones` }))
  const activePlaylist = playlistsWithArtwork.find((playlist) => playlist.id === activePlaylistId) ?? null
  const activeAlbum = allAlbumItems.find((album) => album.id === activeAlbumId) ?? null
  const allArtistItems = createArtistItems(songs)
  const activeArtistItem = allArtistItems.find((artist) => artist.artistId === activeArtistId) ?? null
  const activeArtist = resolveActiveArtist(activeArtistItem, activeArtistProfile, activeArtistId)
  const mobileContextTitle = getMobileContextTitle(activeSection, activeArtist, activeAlbum, activePlaylist)

  useEffect(() => {
    function syncSectionFromHash() {
      const requestedSection = getSectionFromHash()
      const nextSection = requestedSection === 'import' && !mayImportMusic ? 'home' : requestedSection
      if (requestedSection === 'import' && !mayImportMusic) {
        window.history.replaceState(window.history.state, '', sectionHashes.home)
      }
      if (nextSection !== 'home') autoSpotlightBlockedRef.current = true
      if (nextSection === 'youtube') setYoutubeVisited(true)
      setActiveSection(nextSection)
      setActiveAlbumId(getAlbumIdFromHash)
      setActiveArtistId(getArtistIdFromHash)
      setActivePlaylistId(getPlaylistIdFromHash)
    }

    window.addEventListener('hashchange', syncSectionFromHash)
    window.addEventListener('popstate', syncSectionFromHash)
    syncSectionFromHash()

    return () => {
      window.removeEventListener('hashchange', syncSectionFromHash)
      window.removeEventListener('popstate', syncSectionFromHash)
    }
  }, [mayImportMusic])

  useLayoutEffect(() => {
    const content = contentRef.current
    if (!content) return undefined

    const scrollTargets = [
      content,
      content.querySelector('.artist-profile__content'),
      content.querySelector('.collection-detail__tracks'),
    ].filter(Boolean)
    const scrollPositions = scrollPositionsRef.current
    const savedPositions = scrollPositions.get(activeRouteKey)

    scrollTargets.forEach((target, index) => {
      target.scrollTop = savedPositions?.[index] ?? 0
    })

    const mobileViewport = window.matchMedia('(max-width: 760px)')
    const titleSelector = activeSection === 'artist'
      ? '#artist-profile-title'
      : ['album', 'playlist'].includes(activeSection)
        ? '#collection-detail-title'
        : null

    function syncMobileBrand() {
      const title = titleSelector ? content.querySelector(titleSelector) : null
      const header = document.querySelector('.app-header')
      const nextHidden = Boolean(
        mobileViewport.matches
        && title
        && header
        && title.getBoundingClientRect().bottom <= header.getBoundingClientRect().bottom,
      )

      if (nextHidden === mobileBrandHiddenRef.current) return
      mobileBrandHiddenRef.current = nextHidden
      setMobileBrandHidden(nextHidden)
    }

    syncMobileBrand()
    scrollTargets.forEach((target) => target.addEventListener('scroll', syncMobileBrand, { passive: true }))
    mobileViewport.addEventListener('change', syncMobileBrand)

    return () => {
      scrollPositions.set(
        activeRouteKey,
        scrollTargets.map((target) => target.scrollTop),
      )
      scrollTargets.forEach((target) => target.removeEventListener('scroll', syncMobileBrand))
      mobileViewport.removeEventListener('change', syncMobileBrand)
    }
  }, [activeAlbum?.title, activeArtist?.title, activePlaylist?.title, activeRouteKey, activeSection])

  useEffect(() => () => clearTimeout(discoveryLoadingTimerRef.current), [])

  useEffect(() => {
    let cancelled = false

    setActiveArtistProfile(null)
    if (!activeArtistId) return undefined

    catalogApi.getArtist(activeArtistId)
      .then((profile) => {
        if (!cancelled) setActiveArtistProfile(profile)
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [activeArtistId])

  function presentArtistSpotlight(artist) {
    setSpotlightArtist(artist)
    setPlayerCollapsed(true)

    const firstSong = artist?.songs?.[0]
    if (!firstSong) return

    selectSong(firstSong.id, {
      animatePlayer: true,
      contextSong: firstSong,
      contextSongs: artist.songs,
      fadeIn: true,
    })
  }

  useEffect(() => {
    let cancelled = false

    if (activeSection !== 'home' || !user || autoSpotlightBlockedRef.current) return undefined

    catalogApi.getArtistSpotlight()
      .then((artist) => {
        if (!cancelled && !autoSpotlightBlockedRef.current) setSpotlightArtist(artist)
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [activeSection, user])

  const { preview, startPreview, stopPreview } = useSongPreview(selectedSongPlaying)
  const { selectRelativeSong, selectSong, startWeeklyDiscovery } = useSongSelection({
    autoSpotlightBlockedRef,
    discoveryLoadingTimerRef,
    onSongSelect,
    playbackSongs,
    selectedSongId,
    setDiscoveryLoading,
    setDiscoveryMix,
    setPlayerAnimationNonce,
    setPlayerFadeInNonce,
    setSelectedSongContext,
    setSelectedSongPlaying,
    songs,
    stopPreview,
  })
  useMiniPlayerCommandListener({ playbackSongs, selectRelativeSong, selectSong })

  const publishMiniPlayerSnapshot = useCallback((playbackState) => {
    playbackStateRef.current = playbackState
    publishPlaybackState({
      ...playbackState,
      queue: getFollowingSongs(playbackSongs, selectedSongId),
      track: selectedSong,
      updatedAt: Date.now(),
    }).catch(() => {})
  }, [playbackSongs, selectedSong, selectedSongId])

  useEffect(() => {
    if (selectedSong) {
      const playbackState = playbackStateRef.current
      publishPlaybackState({
        ...playbackState,
        currentTime: 0,
        duration: selectedSong.durationSeconds ?? playbackState.duration,
        isPlaying: false,
        queue: getFollowingSongs(playbackSongs, selectedSong.id),
        track: selectedSong,
        updatedAt: Date.now(),
      }).catch(() => {})
      return
    }

    publishPlaybackState({
      currentTime: 0,
      duration: 0,
      isPlaying: false,
      queue: [],
      track: null,
      updatedAt: Date.now(),
      volume: 0,
    }).catch(() => {})
  }, [playbackSongs, selectedSong])

  const { navigateBack, navigateTo, navigateToAlbum, navigateToArtist, navigateToPlaylist } = useDiscoveryNavigation({
    activeSection,
    autoSpotlightBlockedRef,
    mayImportMusic,
    setActiveAlbumId,
    setActiveArtistId,
    setActivePlaylistId,
    setActiveSection,
    setYoutubeVisited,
  })

  function dismissArtistSpotlight() {
    const artistId = spotlightArtist?.artistId
    setSpotlightArtist(null)
    if (artistId) catalogApi.markArtistSpotlightViewed(artistId).catch(() => {})
  }

  function openLatestArtistSpotlight() {
    primeAutoplay()
    catalogApi.getArtistSpotlight({ includeViewed: true })
      .then(presentArtistSpotlight)
      .catch(() => {})
  }

  function playExternalSong(song) {
    navigateTo('youtube')
    requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent('mysic:play-youtube-song', { detail: song }))
    })
  }

  const {
    deletePlaylist, openCreatePlaylist, openEditPlaylist, playlistEditor, savePlaylist,
    setPlaylistEditor, togglePlaylistPinned,
  } = usePlaylistActions({
    activePlaylist,
    addSongToPlaylist,
    createPlaylist,
    navigateTo,
    navigateToPlaylist,
    onDeletePlaylist,
    onSetExternalSongInPlaylist,
    onUpdatePlaylist,
    setActivePlaylistId,
    setPlaylistPickerSong,
  })

  const playerVisible = Boolean(
    (selectedSong && !spotlightArtist && activeSection !== 'youtube')
    || (activeSection === 'youtube' && youtubePlayerVisible),
  )

  function renderPage() {
    return (
    <div className={`music-app${sidebarCollapsed ? ' music-app--sidebar-collapsed' : ''}${playerVisible ? ' music-app--player-open' : ''}${playerVisible && playerCollapsed ? ' music-app--player-collapsed' : ''}`} id="music-home">
      <AppHeader
        collapsed={sidebarCollapsed}
        mobileBrandHidden={mobileBrandHidden}
        mobileContextTitle={mobileContextTitle}
        mobileMenuOpen={mobileMenuOpen}
        onArtistSpotlightOpen={openLatestArtistSpotlight}
        onHome={() => navigateTo('home')}
        onLogout={onLogout}
        onMobileMenuClose={() => setMobileMenuOpen(false)}
        onMobileMenuToggle={() => setMobileMenuOpen((open) => !open)}
        onSearchChange={onSearchChange}
        onSidebarToggle={() => setSidebarCollapsed((collapsed) => !collapsed)}
        searchQuery={searchQuery}
        user={user}
      />
      <AppSidebar
        activePlaylistId={activePlaylistId}
        activeSection={activeSection}
        canImportMusic={mayImportMusic}
        collapsed={sidebarCollapsed}
        mobileOpen={mobileMenuOpen}
        onCreatePlaylist={() => {
          setMobileMenuOpen(false)
          openCreatePlaylist()
        }}
        onEditPlaylist={openEditPlaylist}
        onImportNav={() => {
          setMobileMenuOpen(false)
          autoSpotlightBlockedRef.current = true
          onImportNav?.()
        }}
        onMobileClose={() => setMobileMenuOpen(false)}
        onNavigate={(section) => {
          setMobileMenuOpen(false)
          navigateTo(section)
        }}
        onOpenPlaylist={(playlistId) => {
          setMobileMenuOpen(false)
          navigateToPlaylist(playlistId)
        }}
        onTogglePlaylistPinned={togglePlaylistPinned}
        playlists={orderedPlaylists}
      />

      <div className="music-app__content" ref={contentRef}>
        {activeSection === 'import' && mayImportMusic ? (
          <Suspense fallback={<div className="collection-empty" role="status">Cargando importador…</div>}>
            <MusicImportView onCatalogRefresh={onCatalogRefresh} />
          </Suspense>
        ) : activeSection === 'youtube' ? null : (
        <main className="music-app__main">
          <div className="music-workspace" key={activeRouteKey}>
            {activeSection === 'home' && (
              <div className="home-page">
                <HomeDiscoveryPrompt
                  disabled={!songs.length}
                  loading={discoveryLoading}
                  onDiscover={startWeeklyDiscovery}
                />

                {orderedPlaylists.length > 0 && (
                  <HomeRail items={orderedPlaylists} onSelect={navigateToPlaylist} selectedId={activePlaylistId} title="Tus playlists" />
                )}

                <SongList
                  hasMore={catalogHasMore}
                  key={normalizedQuery}
                  likedSongIds={likedSongIds}
                  loadingMore={catalogLoadingMore}
                  onAddToPlaylist={setPlaylistPickerSong}
                  onAlbumSelect={(albumId) => navigateToAlbum(`album-${albumId}`)}
                  onArtistSelect={navigateToArtist}
                  onLoadMore={onCatalogLoadMore}
                  onPlaybackToggle={() => setPlaybackToggleNonce((nonce) => nonce + 1)}
                  onPreviewStart={startPreview}
                  onPreviewStop={stopPreview}
                  onSongSelect={selectSong}
                  onToggleFavorite={onToggleFavorite}
                  preview={preview}
                  selectedSongId={selectedSongId}
                  selectedSongPlaying={selectedSongPlaying}
                  songs={filteredSongs}
                />

                <HomeRail
                  items={recentSongs}
                  onPlaybackToggle={() => setPlaybackToggleNonce((nonce) => nonce + 1)}
                  onPreviewStart={startPreview}
                  onPreviewStop={stopPreview}
                  onSelect={selectSong}
                  preview={preview}
                  selectedId={selectedSongId}
                  selectedItemPlaying={selectedSongPlaying}
                  title="Escuchado recientemente"
                />

                <HomeRail
                  items={newReleaseSongs}
                  onPlaybackToggle={() => setPlaybackToggleNonce((nonce) => nonce + 1)}
                  onPreviewStart={startPreview}
                  onPreviewStop={stopPreview}
                  onSelect={selectSong}
                  preview={preview}
                  selectedId={selectedSongId}
                  selectedItemPlaying={selectedSongPlaying}
                  title="Nuevos lanzamientos"
                />
              </div>
            )}

            {activeSection !== 'home' && activeSection !== 'downloads' && activeSection !== 'radio' && activeSection !== 'playlists' && activeSection !== 'playlist' && activeSection !== 'album' && activeSection !== 'artist' && activeSection !== 'youtube' && (
              <SectionRoute
                albumItems={albumItems}
                artistItems={artistItems}
                likedAlbumIds={likedAlbumIds}
                likedArtistIds={likedArtistIds}
                likedSongIds={likedSongIds}
                newReleaseSongs={newReleaseSongs}
                onAddToPlaylist={setPlaylistPickerSong}
                onAlbumSelect={navigateToAlbum}
                onArtistSelect={navigateToArtist}
                onPlaybackToggle={() => setPlaybackToggleNonce((nonce) => nonce + 1)}
                onPreviewStart={startPreview}
                onPreviewStop={stopPreview}
                onSongSelect={selectSong}
                onToggleFavorite={onToggleFavorite}
                preview={preview}
                recentSongs={recentSongs}
                searchKey={normalizedQuery}
                section={activeSection}
                selectedSongId={selectedSongId}
                selectedSongPlaying={selectedSongPlaying}
                songs={filteredSongs}
              />
            )}

            {activeSection === 'album' && activeAlbum && (
              <AlbumView
                album={activeAlbum}
                likedAlbumIds={likedAlbumIds}
                likedSongIds={likedSongIds}
                onAddToPlaylist={setPlaylistPickerSong}
                onBack={() => navigateBack('albums')}
                onArtistSelect={navigateToArtist}
                onPlaybackToggle={() => setPlaybackToggleNonce((nonce) => nonce + 1)}
                onSongSelect={selectSong}
                onToggleAlbumFavorite={onToggleAlbumFavorite}
                onToggleFavorite={onToggleFavorite}
                selectedSongId={selectedSongId}
                selectedSongAlbumId={selectedSong?.albumId}
                selectedSongPlaying={selectedSongPlaying}
                songs={songs}
              />
            )}

            {activeSection === 'album' && !activeAlbum && (
              <div className="collection-empty" role="status">No encontramos este álbum.</div>
            )}

            {activeSection === 'artist' && activeArtist && (
              <ArtistView
                artist={activeArtist}
                likedArtistIds={likedArtistIds}
                likedSongIds={likedSongIds}
                onAddToPlaylist={setPlaylistPickerSong}
                onAlbumSelect={(albumId) => navigateToAlbum(`album-${albumId}`)}
                onBack={() => navigateBack('artists')}
                onPlaybackToggle={() => setPlaybackToggleNonce((nonce) => nonce + 1)}
                onSongSelect={selectSong}
                onToggleArtistFavorite={onToggleArtistFavorite}
                onToggleFavorite={onToggleFavorite}
                selectedSongId={selectedSongId}
                selectedSongPlaying={selectedSongPlaying}
                songs={songs}
              />
            )}

            {activeSection === 'artist' && !activeArtist && (
              <div className="collection-empty" role="status">No encontramos este artista.</div>
            )}

            {activeSection === 'playlists' && (
              <div className="route-page playlist-library-page">
                <div className="collection-heading">
                  <h1>Playlists</h1>
                  <button className="song-pagination__step" type="button" onClick={() => openCreatePlaylist()}>
                    Crear playlist
                  </button>
                </div>
                <HomeRail items={orderedPlaylists} onSelect={navigateToPlaylist} selectedId={activePlaylistId} title="Tus playlists" />
              </div>
            )}

            {activeSection === 'playlist' && activePlaylist && (
              <PlaylistView
                likedSongIds={likedSongIds}
                onAddToPlaylist={setPlaylistPickerSong}
                onAlbumSelect={(albumId) => navigateToAlbum(`album-${albumId}`)}
                onArtistSelect={navigateToArtist}
                onBack={() => navigateBack('playlists')}
                onDelete={deletePlaylist}
                onEdit={openEditPlaylist}
                onExternalSongSelect={playExternalSong}
                onPlaybackToggle={() => setPlaybackToggleNonce((nonce) => nonce + 1)}
                onReorderPlaylist={onReorderPlaylist}
                onSongSelect={selectSong}
                onToggleFavorite={onToggleFavorite}
                onTogglePinned={togglePlaylistPinned}
                playlist={activePlaylist}
                selectedSongId={selectedSongId}
                selectedSongPlaying={selectedSongPlaying}
                songs={songs}
              />
            )}

            {activeSection === 'playlist' && !activePlaylist && (
              <div className="collection-empty" role="status">No encontramos esta playlist.</div>
            )}

            {activeSection === 'downloads' && (
              <section className="library-view" aria-labelledby="downloads-title">
                <div className="collection-heading">
                  <h1 id="downloads-title">Descargas</h1>
                </div>
                <div className="collection-empty">Aún no tienes música descargada.</div>
              </section>
            )}

            {activeSection === 'radio' && (
              <section className="library-view" aria-labelledby="radio-title">
                <div className="collection-heading">
                  <h1 id="radio-title">Radio</h1>
                  <span>00</span>
                </div>
                <div className="collection-empty">Las estaciones apareceran aqui.</div>
              </section>
            )}
          </div>
        </main>
      )}
        {youtubeVisited && (
          <div className="youtube-section" hidden={activeSection !== 'youtube'}>
            <Suspense fallback={<div className="collection-empty" role="status">Cargando Mysic global…</div>}>
              <YoutubeView
                active={activeSection === 'youtube'}
                onAddToPlaylist={setPlaylistPickerSong}
                onPlayerCollapseToggle={() => setPlayerCollapsed((collapsed) => !collapsed)}
                onPlayerVisibilityChange={setYoutubePlayerVisible}
                playerCollapsed={playerCollapsed}
              />
            </Suspense>
          </div>
        )}
    </div>

      {spotlightArtist && (
        <Suspense fallback={null}>
          <NewArtistSpotlight
            artist={spotlightArtist}
            artistLiked={likedArtistIds?.has(spotlightArtist.artistId)}
            likedSongIds={likedSongIds}
            onAddToPlaylist={setPlaylistPickerSong}
            onAlbumSelect={(albumId) => navigateToAlbum(`album-${albumId}`)}
            onArtistSelect={navigateToArtist}
            onDismiss={dismissArtistSpotlight}
            onPlaybackToggle={() => setPlaybackToggleNonce((nonce) => nonce + 1)}
            onPreviewStart={startPreview}
            onPreviewStop={stopPreview}
            onSongSelect={selectSong}
            onToggleFavorite={onToggleFavorite}
            onToggleArtistFavorite={onToggleArtistFavorite}
            preview={preview}
            selectedSongId={selectedSongId}
            selectedSongPlaying={selectedSongPlaying}
            songs={spotlightArtist.songs}
          />
        </Suspense>
      )}

      {selectedSong && (
        <Suspense fallback={null}>
          <PlayerDock
          animationNonce={playerAnimationNonce}
          collapsed={playerCollapsed}
          fadeInNonce={playerFadeInNonce}
          isLoading={discoveryLoading}
          onAnalyserChange={setPlayerAnalyser}
          onClose={() => selectSong(null)}
          onNext={() => selectRelativeSong(1)}
          onOpenMiniPlayer={() => {
            claimMiniPlayer('mysic')
            publishMiniPlayerSnapshot(playbackStateRef.current)
            openMiniPlayerWindow().catch(() => {})
          }}
          onPlaybackChange={(playing) => {
            setSelectedSongPlaying(playing)
            // Si empieza a sonar Mysic, se pausa YouTube Music
            if (playing) {
              claimMiniPlayer('mysic')
              window.dispatchEvent(new CustomEvent('yotubei:pause'))
            }
          }}
          onPlaybackStateChange={publishMiniPlayerSnapshot}
          onPrevious={() => selectRelativeSong(-1)}
          onQueueSelect={(songId) => selectSong(songId, {
            animatePlayer: false,
            contextSong: playbackSongs.find((song) => song.id === songId) ?? null,
            preserveDiscoveryMix: true,
          })}
          liked={likedSongIds?.has(selectedSong.id)}
          onToggleFavorite={(liked) => onToggleFavorite?.(selectedSong.id, liked)}
          onToggleCollapsed={() => setPlayerCollapsed((collapsed) => !collapsed)}
          playbackToggleNonce={playbackToggleNonce}
          queue={nextSongs}
          suppressed={Boolean(spotlightArtist) || activeSection === 'youtube'}
          track={selectedSong}
          />
        </Suspense>
      )}

      {playlistEditor && (
        <PlaylistEditorModal
          initialPlaylist={playlistEditor.initialPlaylist}
          mode={playlistEditor.mode}
          onClose={() => setPlaylistEditor(null)}
          onSave={savePlaylist}
          playlists={resolvedPlaylists}
          songs={songs}
        />
      )}

      {playlistPickerSong && (
        <PlaylistPickerModal
          analyser={playerAnalyser}
          onAdd={async (selectedPlaylistIds) => {
            const selectedIds = new Set(selectedPlaylistIds)
            const results = await Promise.all(playlists.map((playlist) => (
              playlistPickerSong.source === 'youtube'
                ? onSetExternalSongInPlaylist(playlist.id, playlistPickerSong, selectedIds.has(playlist.id))
                : onSetSongInPlaylist(playlist.id, playlistPickerSong.id, selectedIds.has(playlist.id))
            )))
            if (results.every(Boolean)) setPlaylistPickerSong(null)
          }}
          onClose={() => setPlaylistPickerSong(null)}
          onCreate={() => openCreatePlaylist(playlistPickerSong)}
          playing={selectedSongPlaying && selectedSongId === playlistPickerSong.id}
          playlists={resolvedPlaylists}
          song={playlistPickerSong}
        />
      )}
    </div>
    )
  }

  return renderPage()
}

function DiscoveryView(props) {
  return useDiscoveryPage(props)
}

export default DiscoveryView
