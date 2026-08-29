import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'
import AppHeader from '../../components/AppHeader.jsx'
import AppSidebar from '../../components/AppSidebar.jsx'
import PlayerDock from '../../components/PlayerDock.jsx'
import AlbumView from '../collections/AlbumView.jsx'
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

const sectionHashes = {
  home: '#inicio',
  explore: '#explorar',
  'for-you': '#favoritas',
  recent: '#historial',
  albums: '#albumes',
  artists: '#artistas',
  playlists: '#playlists',
  downloads: '#descargas',
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

function getSectionFromHash() {
  if (getPlaylistIdFromHash()) return 'playlist'
  if (getAlbumIdFromHash()) return 'album'
  return hashSections[window.location.hash] ?? 'home'
}

function createAlbumItems(songs) {
  const albums = new Map()

  songs.forEach((song) => {
    if (albums.has(song.albumId)) return

    albums.set(song.albumId, {
      id: `album-${song.albumId}`,
      albumId: song.albumId,
      title: albumTitles[song.albumId] ?? song.albumId,
      artist: song.artist,
      artwork: song.artwork,
      audioUrl: song.audioUrl,
      year: 2024,
    })
  })

  return Array.from(albums.values())
}

function createArtistItems(songs) {
  const artists = new Map()

  songs.forEach((song) => {
    const artist = artists.get(song.artist)

    if (artist) {
      artist.count += 1
      return
    }

    artists.set(song.artist, {
      id: `artist-${song.artist}`,
      title: song.artist,
      meta: '1 cancion',
      artwork: song.artwork,
      count: 1,
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
  likedSongIds,
  onLogout,
  onReorderPlaylist,
  onSearchChange,
  onSongSelect,
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
  const [activePlaylistId, setActivePlaylistId] = useState(getPlaylistIdFromHash)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [preview, setPreview] = useState(null)
  const [discoveryLoading, setDiscoveryLoading] = useState(false)
  const [discoveryMix, setDiscoveryMix] = useState([])
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
  const selectedSong = songs.find((song) => song.id === selectedSongId) ?? null
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
  const orderedPlaylists = playlists
    .toSorted((first, second) => Number(second.pinned) - Number(first.pinned))
    .map((playlist) => ({ ...playlist, meta: `${playlist.songIds.length} canciones` }))
  const activePlaylist = playlists.find((playlist) => playlist.id === activePlaylistId) ?? null
  const activeAlbum = allAlbumItems.find((album) => album.id === activeAlbumId) ?? null
  useEffect(() => {
    function syncSectionFromHash() {
      setActiveSection(getSectionFromHash())
      setActiveAlbumId(getAlbumIdFromHash())
      setActivePlaylistId(getPlaylistIdFromHash())
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
    setSelectedSongPlaying(false)
    onSongSelect(playbackSongs[nextIndex].id)
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

  function selectSong(songId, { animatePlayer = true, preserveDiscoveryMix = false } = {}) {
    clearTimeout(discoveryLoadingTimerRef.current)
    setDiscoveryLoading(false)
    if (!preserveDiscoveryMix) setDiscoveryMix([])
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
    setDiscoveryLoading(true)
    setSelectedSongPlaying(false)
    setPlayerAnimationNonce((nonce) => nonce + 1)
    onSongSelect(firstSong.id)

    discoveryLoadingTimerRef.current = setTimeout(() => {
      setDiscoveryLoading(false)
    }, 1900)
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
    if (command.type === 'select') selectSong(command.songId, { animatePlayer: false })
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
    const track = songs.find((song) => song.id === selectedSongId) ?? null
    publishPlaybackState({
      ...playbackState,
      queue: getFollowingSongs(playbackSongs, selectedSongId),
      track,
      updatedAt: Date.now(),
    }).catch(() => {})
  }, [playbackSongs, selectedSongId, songs])

  useEffect(() => {
    if (selectedSong) {
      const playbackState = playbackStateRef.current
      publishPlaybackState({
        ...playbackState,
        currentTime: 0,
        duration: selectedSong.durationSeconds ?? playbackState.duration,
        isPlaying: false,
        queue: getFollowingSongs(songs, selectedSong.id),
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
  }, [selectedSong, songs])

  function navigateTo(section) {
    const nextHash = sectionHashes[section]
    if (!nextHash) return
    setActiveSection(section)
    setActiveAlbumId(null)
    setActivePlaylistId(null)
    if (window.location.hash !== nextHash) {
      window.history.pushState({ previousAppHash: window.location.hash || sectionHashes.home }, '', nextHash)
    }
  }

  function navigateToPlaylist(playlistId) {
    const nextHash = `#playlist-${playlistId}`
    setActiveSection('playlist')
    setActiveAlbumId(null)
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
    if (window.location.hash !== nextHash) {
      window.history.pushState({ previousAppHash: window.location.hash || sectionHashes.albums }, '', nextHash)
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

  function savePlaylist(details) {
    if (!playlistEditor) return

    if (playlistEditor.mode === 'create') {
      const playlistId = createPlaylist(details)
      if (playlistEditor.pendingSongId) addSongToPlaylist(playlistId, playlistEditor.pendingSongId)
      setPlaylistEditor(null)
      navigateToPlaylist(playlistId)
      return
    }

    onUpdatePlaylist(playlistEditor.initialPlaylist.id, details)
    setPlaylistEditor(null)
  }

  function togglePlaylistPinned(playlist) {
    const playlistToUpdate = playlist?.id ? playlist : activePlaylist
    if (playlistToUpdate) onUpdatePlaylist(playlistToUpdate.id, { pinned: !playlistToUpdate.pinned })
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
        onNavigate={navigateTo}
        onOpenPlaylist={navigateToPlaylist}
        onTogglePlaylistPinned={togglePlaylistPinned}
        playlists={orderedPlaylists}
      />

      <div className="music-app__content">
        <main className="music-app__main">
          <div className="music-workspace" key={`${activeSection}-${activePlaylistId ?? activeAlbumId ?? ''}`}>
            {activeSection === 'home' && (
              <div className="home-page">
                <HomeDiscoveryPrompt
                  disabled={!songs.length}
                  loading={discoveryLoading}
                  onDiscover={startWeeklyDiscovery}
                />

                <HomeRail items={orderedPlaylists} onSelect={navigateToPlaylist} selectedId={activePlaylistId} title="Playlists destacadas" />

                <SongList
                  key={normalizedQuery}
                  likedSongIds={likedSongIds}
                  onAddToPlaylist={setPlaylistPickerSong}
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

            {activeSection !== 'home' && activeSection !== 'downloads' && activeSection !== 'radio' && activeSection !== 'playlists' && activeSection !== 'playlist' && activeSection !== 'album' && (
              <SectionRoute
                albumItems={albumItems}
                artistItems={artistItems}
                likedSongIds={likedSongIds}
                newReleaseSongs={newReleaseSongs}
                onAddToPlaylist={setPlaylistPickerSong}
                onAlbumSelect={navigateToAlbum}
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
                likedSongIds={likedSongIds}
                onAddToPlaylist={setPlaylistPickerSong}
                onBack={() => navigateBack('albums')}
                onPlaybackToggle={() => setPlaybackToggleNonce((nonce) => nonce + 1)}
                onSongSelect={selectSong}
                onToggleFavorite={onToggleFavorite}
                selectedSongId={selectedSongId}
                selectedSongPlaying={selectedSongPlaying}
                songs={songs}
              />
            )}

            {activeSection === 'album' && !activeAlbum && (
              <div className="collection-empty" role="status">No encontramos este álbum.</div>
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
          onQueueSelect={(songId) => selectSong(songId, { animatePlayer: false, preserveDiscoveryMix: true })}
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
          onAdd={(playlistId) => addSongToPlaylist(playlistId, playlistPickerSong.id)}
          onClose={() => setPlaylistPickerSong(null)}
          onCreate={() => openCreatePlaylist(playlistPickerSong.id)}
          onManage={() => {
            setPlaylistPickerSong(null)
            navigateTo('playlists')
          }}
          playlists={playlists}
          song={playlistPickerSong}
        />
      )}
    </div>
  )
}

export default DiscoveryView
