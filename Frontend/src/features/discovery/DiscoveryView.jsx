import { lazy, Suspense, useCallback, useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react'
import AppHeader from '../../components/AppHeader.jsx'
import AppSidebar from '../../components/AppSidebar.jsx'
import PlayerDock from '../../components/PlayerDock.jsx'
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
  publishPlaybackState,
} from '../mini-player/playerBridge.ts'
import { openMiniPlayerWindow } from '../mini-player/openMiniPlayerWindow.tsx'
import { catalogApi } from '../../lib/api.js'
import { primeAutoplay } from '../auth/autoplayUnlock.js'
import { canImportMusic } from '../music-import/musicImportAccess.js'

const MusicImportView = lazy(() => import('../music-import/MusicImportView.jsx'))
const NewArtistSpotlight = lazy(() => import('./NewArtistSpotlight.jsx'))
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

function DiscoveryView({
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
  const [activeAlbumId, setActiveAlbumId] = useState(getAlbumIdFromHash)
  const [activeArtistId, setActiveArtistId] = useState(getArtistIdFromHash)
  const [activeArtistProfile, setActiveArtistProfile] = useState(null)
  const [spotlightArtist, setSpotlightArtist] = useState(null)
  const [activePlaylistId, setActivePlaylistId] = useState(getPlaylistIdFromHash)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [playerCollapsed, setPlayerCollapsed] = useState(false)
  const [preview, setPreview] = useState(null)
  const [discoveryLoading, setDiscoveryLoading] = useState(false)
  const [discoveryMix, setDiscoveryMix] = useState([])
  const [selectedSongContext, setSelectedSongContext] = useState(null)
  const [selectedSongPlaying, setSelectedSongPlaying] = useState(false)
  const [playerAnimationNonce, setPlayerAnimationNonce] = useState(0)
  const [playerFadeInNonce, setPlayerFadeInNonce] = useState(0)
  const [playbackToggleNonce, setPlaybackToggleNonce] = useState(0)
  const [playerAnalyser, setPlayerAnalyser] = useState(null)
  const [playlistEditor, setPlaylistEditor] = useState(null)
  const [playlistPickerSong, setPlaylistPickerSong] = useState(null)
  const autoSpotlightBlockedRef = useRef(false)
  const playbackStateRef = useRef({ currentTime: 0, duration: 0, isPlaying: false, volume: 75 })
  const contentRef = useRef(null)
  const discoveryLoadingTimerRef = useRef(null)
  const previewAudioRef = useRef(null)
  const previewAudioUnlockedRef = useRef(false)
  const previewItemIdRef = useRef(null)
  const previewTimerRef = useRef(null)
  const scrollPositionsRef = useRef(new Map())
  const activeRouteKey = `${activeSection}-${activePlaylistId ?? activeAlbumId ?? activeArtistId ?? ''}`
  const selectedSong = selectedSongContext?.id === selectedSongId
    ? selectedSongContext
    : songs.find((song) => song.id === selectedSongId) ?? null
  const playbackSongs = discoveryMix.length ? discoveryMix : songs
  const nextSongs = getFollowingSongs(playbackSongs, selectedSongId)
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase()
  const filteredSongs = normalizedQuery ? searchSongs : songs
  const previewFallbackUrl = songs.find((song) => song.audioUrl)?.audioUrl

  useEffect(() => {
    if (!mobileMenuOpen) return undefined

    function closeMobileMenu(event) {
      if (event.key === 'Escape') setMobileMenuOpen(false)
    }

    document.addEventListener('keydown', closeMobileMenu)
    return () => document.removeEventListener('keydown', closeMobileMenu)
  }, [mobileMenuOpen])

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
    songIds: playlist.songIds.filter((songId) => availableSongIds.has(songId)),
  }))
  const playlistsWithArtwork = resolvedPlaylists.map((playlist) => {
    if (playlist.artwork) return playlist
    const firstSong = playlist.songIds
      .map((songId) => songs.find((song) => song.id === songId))
      .find(Boolean)
    return firstSong?.artwork ? { ...playlist, artwork: firstSong.artwork } : playlist
  })
  const orderedPlaylists = playlistsWithArtwork
    .toSorted((first, second) => Number(second.pinned) - Number(first.pinned))
    .map((playlist) => ({ ...playlist, meta: `${playlist.songIds.length} canciones` }))
  const activePlaylist = playlistsWithArtwork.find((playlist) => playlist.id === activePlaylistId) ?? null
  const activeAlbum = allAlbumItems.find((album) => album.id === activeAlbumId) ?? null
  const allArtistItems = createArtistItems(songs)
  const activeArtistItem = allArtistItems.find((artist) => artist.artistId === activeArtistId) ?? null
  const activeArtist = activeArtistItem && activeArtistProfile?.id === activeArtistId
    ? {
        ...activeArtistItem,
        artwork: activeArtistProfile.artwork,
        images: activeArtistProfile.images,
      }
    : activeArtistItem
  useEffect(() => {
    function syncSectionFromHash() {
      const requestedSection = getSectionFromHash()
      const nextSection = requestedSection === 'import' && !mayImportMusic ? 'home' : requestedSection
      if (requestedSection === 'import' && !mayImportMusic) {
        window.history.replaceState(window.history.state, '', sectionHashes.home)
      }
      if (nextSection !== 'home') autoSpotlightBlockedRef.current = true
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

    return () => {
      scrollPositions.set(
        activeRouteKey,
        scrollTargets.map((target) => target.scrollTop),
      )
    }
  }, [activeRouteKey])

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

  useEffect(() => {
    const previewAudio = new Audio()
    const clearFinishedPreview = () => {
      previewItemIdRef.current = null
      setPreview(null)
    }
    const removeUnlockListeners = () => {
      document.removeEventListener('click', unlockPreviewAudio, true)
      document.removeEventListener('keydown', unlockPreviewAudio, true)
    }
    const unlockPreviewAudio = () => {
      if (previewAudioUnlockedRef.current || !previewAudio.src) return

      previewAudio.volume = 0
      previewAudio.play().then(() => {
        previewAudio.pause()
        previewAudio.currentTime = 0
        previewAudio.volume = 0.35
        previewAudioUnlockedRef.current = true
        removeUnlockListeners()
      }).catch(() => {
        previewAudio.volume = 0.35
      })
    }

    previewAudio.preload = 'metadata'
    if (previewFallbackUrl) previewAudio.src = previewFallbackUrl
    previewAudio.addEventListener('ended', clearFinishedPreview)
    document.addEventListener('click', unlockPreviewAudio, true)
    document.addEventListener('keydown', unlockPreviewAudio, true)
    previewAudioRef.current = previewAudio

    return () => {
      clearTimeout(previewTimerRef.current)
      previewItemIdRef.current = null
      previewAudio.pause()
      previewAudio.removeEventListener('ended', clearFinishedPreview)
      removeUnlockListeners()
      previewAudio.removeAttribute('src')
      previewAudioRef.current = null
    }
  }, [previewFallbackUrl])

  function selectRelativeSong(offset) {
    const currentIndex = playbackSongs.findIndex((song) => song.id === selectedSongId)
    const startIndex = currentIndex >= 0 ? currentIndex : 0
    const nextIndex = (startIndex + offset + playbackSongs.length) % playbackSongs.length
    selectSong(playbackSongs[nextIndex].id, {
      animatePlayer: false,
      contextSong: playbackSongs[nextIndex],
      preserveDiscoveryMix: true,
    })
  }

  function startPreview(item) {
    if (selectedSongPlaying) return

    const audio = previewAudioRef.current
    if (!audio || !item.audioUrl) return
    if (previewItemIdRef.current === item.id) return

    clearTimeout(previewTimerRef.current)
    audio.pause()
    if (audio.src !== new URL(item.audioUrl, window.location.href).href) audio.src = item.audioUrl
    audio.currentTime = 0
    previewItemIdRef.current = item.id
    setPreview({ itemId: item.id, status: 'loading' })

    previewTimerRef.current = setTimeout(async () => {
      if (previewItemIdRef.current !== item.id) return
      audio.currentTime = 0
      audio.volume = 0.35

      try {
        await audio.play()
        if (previewItemIdRef.current === item.id) setPreview({ itemId: item.id, status: 'playing' })
      } catch {
        if (previewItemIdRef.current === item.id) {
          previewItemIdRef.current = null
          setPreview(null)
        }
      }
    }, 3000)
  }

  function stopPreview() {
    const audio = previewAudioRef.current
    clearTimeout(previewTimerRef.current)
    previewItemIdRef.current = null
    setPreview(null)
    if (!audio) return
    audio.pause()
    audio.currentTime = 0
  }

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

  const handleMiniPlayerCommand = useEffectEvent((command) => {
    if (command.type === 'next') {
      selectRelativeSong(1)
      return
    }
    if (command.type === 'previous') {
      selectRelativeSong(-1)
      return
    }
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

    listenToMiniPlayerCommands(handleMiniPlayerCommand).then((cleanup) => {
      if (disposed) cleanup()
      else unlisten = cleanup
    })

    return () => {
      disposed = true
      unlisten()
    }
  }, [])

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

  function navigateTo(section) {
    if (section === 'import' && !mayImportMusic) return
    const nextHash = sectionHashes[section]
    if (!nextHash) return
    autoSpotlightBlockedRef.current = true
    setActiveSection(section)
    setActiveAlbumId(null)
    setActiveArtistId(null)
    setActivePlaylistId(null)
    if (window.location.hash !== nextHash) {
      window.history.pushState({ previousAppHash: window.location.hash || sectionHashes.home }, '', nextHash)
    }
  }

  function navigateToPlaylist(playlistId) {
    const nextHash = `#playlist-${playlistId}`
    autoSpotlightBlockedRef.current = true
    setActiveSection('playlist')
    setActiveAlbumId(null)
    setActiveArtistId(null)
    setActivePlaylistId(playlistId)
    if (window.location.hash !== nextHash) {
      window.history.pushState({ previousAppHash: window.location.hash || sectionHashes.playlists }, '', nextHash)
    }
  }

  function navigateToAlbum(albumId) {
    const nextHash = `#${albumId}`
    autoSpotlightBlockedRef.current = true
    setActiveSection('album')
    setActiveAlbumId(albumId)
    setActivePlaylistId(null)
    setActiveArtistId(null)
    if (window.location.hash !== nextHash) {
      window.history.pushState({ previousAppHash: window.location.hash || sectionHashes.albums }, '', nextHash)
    }
  }

  function navigateToArtist(artistId) {
    if (!artistId) return
    const nextHash = `#artist-${artistId}`
    autoSpotlightBlockedRef.current = true
    setActiveSection('artist')
    setActiveArtistId(artistId)
    setActiveAlbumId(null)
    setActivePlaylistId(null)
    if (window.location.hash !== nextHash) {
      window.history.pushState({ previousAppHash: window.location.hash || sectionHashes.artists }, '', nextHash)
    }
  }

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

  function navigateBack(fallbackSection) {
    autoSpotlightBlockedRef.current = true
    if (window.history.state?.previousAppHash) {
      window.history.back()
      return
    }

    navigateTo(fallbackSection)
  }

  function openCreatePlaylist(pendingSongId = null) {
    setPlaylistPickerSong(null)
    setPlaylistEditor({ mode: 'create', initialPlaylist: null, pendingSongId })
  }

  function openEditPlaylist(playlist) {
    const playlistToEdit = playlist?.id ? playlist : activePlaylist
    if (playlistToEdit) setPlaylistEditor({ mode: 'edit', initialPlaylist: playlistToEdit, pendingSongId: null })
  }

  async function savePlaylist(details) {
    if (!playlistEditor) return

    if (playlistEditor.mode === 'create') {
      const playlistId = await createPlaylist(details)
      if (!playlistId) return
      if (playlistEditor.pendingSongId) await addSongToPlaylist(playlistId, playlistEditor.pendingSongId)
      setPlaylistEditor(null)
      navigateToPlaylist(playlistId)
      return
    }

    const updated = await onUpdatePlaylist(playlistEditor.initialPlaylist.id, details)
    if (!updated) return
    setPlaylistEditor(null)
  }

  function togglePlaylistPinned(playlist) {
    const playlistToUpdate = playlist?.id ? playlist : activePlaylist
    if (playlistToUpdate) onUpdatePlaylist(playlistToUpdate.id, { pinned: !playlistToUpdate.pinned })
  }

  async function deletePlaylist(playlist) {
    const deleted = await onDeletePlaylist?.(playlist.id)
    if (!deleted) return false
    setActivePlaylistId(null)
    navigateTo('playlists')
    return true
  }

  const playerVisible = Boolean(selectedSong && !spotlightArtist)

  return (
    <div className={`music-app${sidebarCollapsed ? ' music-app--sidebar-collapsed' : ''}${playerVisible ? ' music-app--player-open' : ''}${playerVisible && playerCollapsed ? ' music-app--player-collapsed' : ''}`} id="music-home">
      <AppHeader
        collapsed={sidebarCollapsed}
        glowArtwork={activeAlbum?.artwork ?? activePlaylist?.artwork ?? selectedSong?.artwork ?? null}
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
        ) : (
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

            {activeSection !== 'home' && activeSection !== 'downloads' && activeSection !== 'radio' && activeSection !== 'playlists' && activeSection !== 'playlist' && activeSection !== 'album' && activeSection !== 'artist' && (
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
                <div className="collection-empty">Aun no tienes musica descargada.</div>
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
        <PlayerDock
          animationNonce={playerAnimationNonce}
          collapsed={playerCollapsed}
          fadeInNonce={playerFadeInNonce}
          isLoading={discoveryLoading}
          onAnalyserChange={setPlayerAnalyser}
          onClose={() => selectSong(null)}
          onNext={() => selectRelativeSong(1)}
          onOpenMiniPlayer={() => openMiniPlayerWindow().catch(() => {})}
          onPlaybackChange={setSelectedSongPlaying}
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
          suppressed={Boolean(spotlightArtist)}
          track={selectedSong}
        />
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
              onSetSongInPlaylist(playlist.id, playlistPickerSong.id, selectedIds.has(playlist.id))
            )))
            if (results.every(Boolean)) setPlaylistPickerSong(null)
          }}
          onClose={() => setPlaylistPickerSong(null)}
          onCreate={() => openCreatePlaylist(playlistPickerSong.id)}
          playing={selectedSongPlaying && selectedSongId === playlistPickerSong.id}
          playlists={resolvedPlaylists}
          song={playlistPickerSong}
        />
      )}
    </div>
  )
}

export default DiscoveryView
