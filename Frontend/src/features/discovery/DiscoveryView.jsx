import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'
import AppHeader from '../../components/AppHeader.jsx'
import AppSidebar from '../../components/AppSidebar.jsx'
import PlayerDock from '../../components/PlayerDock.jsx'
import AlbumView from '../collections/AlbumView.jsx'
import ArtistView from '../collections/ArtistView.jsx'
import PlaylistEditorModal from '../playlists/PlaylistEditorModal.jsx'
import PlaylistPickerModal from '../playlists/PlaylistPickerModal.jsx'
import PlaylistView from '../playlists/PlaylistView.jsx'
import MusicImportView from '../music-import/MusicImportView.jsx'
import HomeDiscoveryPrompt from './HomeDiscoveryPrompt.jsx'
import HomeRail from './HomeRail.jsx'
import SectionRoute from './SectionRoute.jsx'
import SongList from './SongList.jsx'
import {
  listenToMiniPlayerCommands,
  publishPlaybackState,
} from '../mini-player/playerBridge.ts'
import { openMiniPlayerWindow } from '../mini-player/openMiniPlayerWindow.tsx'

const sectionHashes = {
  home: '#/inicio',
  explore: '#/explorar',
  'for-you': '#/favoritas',
  recent: '#/historial',
  albums: '#/albumes',
  artists: '#/artistas',
  playlists: '#/playlists',
  downloads: '#/descargas',
  import: '#/importar',
}

const hashSections = Object.fromEntries(
  Object.entries(sectionHashes).map(([section, hash]) => [hash, section]),
)

const albumTitles = {
  afterglow: 'Afterglow',
  'soft-static': 'Soft Static',
  'parallel-lines': 'Parallel Lines',
  'red-thread': 'Red Thread',
  'low-tide': 'Low Tide',
}

function getPlaylistIdFromHash() {
  return window.location.hash.startsWith('#playlist-') ? window.location.hash.slice('#playlist-'.length) : null
}

function getAlbumIdFromHash() {
  return window.location.hash.startsWith('#album-') ? window.location.hash.slice(1) : null
}

function getArtistIdFromHash() {
  return window.location.hash.startsWith('#artist-') ? window.location.hash.slice('#artist-'.length) : null
}

function getSectionFromHash() {
  if (getPlaylistIdFromHash()) return 'playlist'
  if (getAlbumIdFromHash()) return 'album'
  if (getArtistIdFromHash()) return 'artist'
  return hashSections[window.location.hash] ?? 'home'
}

function createAlbumItems(songs) {
  const albums = new Map()

  songs.forEach((song) => {
    if (albums.has(song.albumId)) return

    albums.set(song.albumId, {
      id: `album-${song.albumId}`,
      albumId: song.albumId,
      title: song.albumTitle ?? albumTitles[song.albumId] ?? song.albumId,
      artist: song.artist,
      artistId: song.artistId,
      artwork: song.artwork,
      audioUrl: song.audioUrl,
      year: song.releaseDate ? new Date(song.releaseDate).getUTCFullYear() : null,
    })
  })

  return Array.from(albums.values())
}

function createArtistItems(songs) {
  const artists = new Map()

  songs.forEach((song) => {
    const songArtists = song.artists?.length
      ? song.artists
      : [{ id: song.artistId ?? song.artist, name: song.artist }]

    songArtists.forEach((songArtist) => {
      const artist = artists.get(songArtist.id)

      if (artist) {
        artist.count += 1
        return
      }

      artists.set(songArtist.id, {
        id: `artist-${songArtist.id}`,
        artistId: songArtist.id,
        title: songArtist.name,
        meta: '1 cancion',
        artwork: songArtist.image ?? song.artwork,
        images: songArtist.images ?? [],
        count: 1,
      })
    })
  })

  return Array.from(artists.values()).map(({ count, ...artist }) => ({
    ...artist,
    meta: `${count} canciones`,
  }))
}

function getFollowingSongs(songs, selectedSongId, count = 10) {
  if (!songs.length || !selectedSongId) return []
  const selectedIndex = songs.findIndex((song) => song.id === selectedSongId)
  if (selectedIndex < 0) return []

  return Array.from({ length: Math.min(count, Math.max(0, songs.length - 1)) }, (_, index) => (
    songs[(selectedIndex + index + 1) % songs.length]
  ))
}

function shuffleSongs(songs) {
  const shuffledSongs = [...songs]

  for (let index = shuffledSongs.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    const currentSong = shuffledSongs[index]
    shuffledSongs[index] = shuffledSongs[randomIndex]
    shuffledSongs[randomIndex] = currentSong
  }

  return shuffledSongs
}

function DiscoveryView({
  addSongToPlaylist,
  createPlaylist,
  likedAlbumIds,
  likedArtistIds,
  likedSongIds,
  onImportNav,
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
  selectedSongId,
  songs,
  user,
}) {
  const [activeSection, setActiveSection] = useState(getSectionFromHash)
  const [activeAlbumId, setActiveAlbumId] = useState(getAlbumIdFromHash)
  const [activeArtistId, setActiveArtistId] = useState(getArtistIdFromHash)
  const [activePlaylistId, setActivePlaylistId] = useState(getPlaylistIdFromHash)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [preview, setPreview] = useState(null)
  const [discoveryLoading, setDiscoveryLoading] = useState(false)
  const [discoveryMix, setDiscoveryMix] = useState([])
  const [selectedSongContext, setSelectedSongContext] = useState(null)
  const [selectedSongPlaying, setSelectedSongPlaying] = useState(false)
  const [playerAnimationNonce, setPlayerAnimationNonce] = useState(0)
  const [playbackToggleNonce, setPlaybackToggleNonce] = useState(0)
  const [playlistEditor, setPlaylistEditor] = useState(null)
  const [playlistPickerSong, setPlaylistPickerSong] = useState(null)
  const playbackStateRef = useRef({ currentTime: 0, duration: 0, isPlaying: false, volume: 75 })
  const discoveryLoadingTimerRef = useRef(null)
  const previewAudioRef = useRef(null)
  const previewAudioUnlockedRef = useRef(false)
  const previewItemIdRef = useRef(null)
  const previewTimerRef = useRef(null)
  const selectedSong = selectedSongContext?.id === selectedSongId
    ? selectedSongContext
    : songs.find((song) => song.id === selectedSongId) ?? null
  const playbackSongs = discoveryMix.length ? discoveryMix : songs
  const nextSongs = getFollowingSongs(playbackSongs, selectedSongId)
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase()
  const filteredSongs = normalizedQuery
    ? songs.filter((song) =>
        [song.title, song.artist].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)),
      )
    : songs
  const previewFallbackUrl = songs.find((song) => song.audioUrl)?.audioUrl

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
  const playlistsWithArtwork = playlists.map((playlist) => {
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
  const activeArtist = allArtistItems.find((artist) => artist.artistId === activeArtistId) ?? null

  useEffect(() => {
    function syncSectionFromHash() {
      setActiveSection(getSectionFromHash)
      setActiveAlbumId(getAlbumIdFromHash)
      setActiveArtistId(getArtistIdFromHash)
      setActivePlaylistId(getPlaylistIdFromHash)
    }

    window.addEventListener('hashchange', syncSectionFromHash)
    window.addEventListener('popstate', syncSectionFromHash)

    return () => {
      window.removeEventListener('hashchange', syncSectionFromHash)
      window.removeEventListener('popstate', syncSectionFromHash)
    }
  }, [])

  useEffect(() => () => clearTimeout(discoveryLoadingTimerRef.current), [])

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
    preserveDiscoveryMix = false,
  } = {}) {
    clearTimeout(discoveryLoadingTimerRef.current)
    setDiscoveryLoading(false)
    if (contextSongs) setDiscoveryMix(contextSongs)
    else if (!preserveDiscoveryMix) setDiscoveryMix([])
    setSelectedSongContext(contextSong?.id === songId ? contextSong : null)
    stopPreview()
    setSelectedSongPlaying(false)
    if (songId !== null && animatePlayer) setPlayerAnimationNonce((nonce) => nonce + 1)
    onSongSelect(songId)
  }

  function startWeeklyDiscovery() {
    const weeklyMix = shuffleSongs(songs)
    const firstSong = weeklyMix[0]
    if (!firstSong) return

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
    const nextHash = sectionHashes[section]
    if (!nextHash) return
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
    setActiveSection('artist')
    setActiveArtistId(artistId)
    setActiveAlbumId(null)
    setActivePlaylistId(null)
    if (window.location.hash !== nextHash) {
      window.history.pushState({ previousAppHash: window.location.hash || sectionHashes.artists }, '', nextHash)
    }
  }

  function navigateBack(fallbackSection) {
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

  return (
    <div className={`music-app${sidebarCollapsed ? ' music-app--sidebar-collapsed' : ''}${selectedSong ? ' music-app--player-open' : ''}`} id="music-home">
      <AppHeader
        collapsed={sidebarCollapsed}
        glowArtwork={activeAlbum?.artwork ?? activePlaylist?.artwork ?? selectedSong?.artwork ?? null}
        onHome={() => navigateTo('home')}
        onLogout={onLogout}
        onSearchChange={onSearchChange}
        onSidebarToggle={() => setSidebarCollapsed((collapsed) => !collapsed)}
        searchQuery={searchQuery}
        user={user}
      />
      <AppSidebar
        activePlaylistId={activePlaylistId}
        activeSection={activeSection}
        collapsed={sidebarCollapsed}
        onCreatePlaylist={() => openCreatePlaylist()}
        onEditPlaylist={openEditPlaylist}
        onImportNav={onImportNav}
        onNavigate={navigateTo}
        onOpenPlaylist={navigateToPlaylist}
        onTogglePlaylistPinned={togglePlaylistPinned}
        playlists={orderedPlaylists}
      />

      <div className="music-app__content">
        {activeSection === 'import' ? (
          <MusicImportView />
        ) : (
        <main className="music-app__main">
          <div className="music-workspace" key={`${activeSection}-${activePlaylistId ?? activeAlbumId ?? activeArtistId ?? ''}`}>
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
                  key={normalizedQuery}
                  likedSongIds={likedSongIds}
                  onAddToPlaylist={setPlaylistPickerSong}
                  onAlbumSelect={(albumId) => navigateToAlbum(`album-${albumId}`)}
                  onArtistSelect={navigateToArtist}
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
                  <span>{String(playlists.length).padStart(2, '0')}</span>
                </div>
                <HomeRail items={orderedPlaylists} onSelect={navigateToPlaylist} selectedId={activePlaylistId} title="Tus playlists" />
              </div>
            )}

            {activeSection === 'playlist' && activePlaylist && (
              <PlaylistView
                likedSongIds={likedSongIds}
                onAddToPlaylist={setPlaylistPickerSong}
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
                  <span>00</span>
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

      {selectedSong && (
        <PlayerDock
          animationNonce={playerAnimationNonce}
          isLoading={discoveryLoading}
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
          playbackToggleNonce={playbackToggleNonce}
          queue={nextSongs}
          track={selectedSong}
        />
      )}

      {playlistEditor && (
        <PlaylistEditorModal
          initialPlaylist={playlistEditor.initialPlaylist}
          mode={playlistEditor.mode}
          onClose={() => setPlaylistEditor(null)}
          onSave={savePlaylist}
          playlists={playlists}
          songs={songs}
        />
      )}

      {playlistPickerSong && (
        <PlaylistPickerModal
          onClose={() => setPlaylistPickerSong(null)}
          onCreate={() => openCreatePlaylist(playlistPickerSong.id)}
          onManage={() => {
            setPlaylistPickerSong(null)
            navigateTo('playlists')
          }}
          onToggle={(playlistId, included) => onSetSongInPlaylist(playlistId, playlistPickerSong.id, included)}
          playlists={playlists}
          song={playlistPickerSong}
        />
      )}
    </div>
  )
}

export default DiscoveryView
