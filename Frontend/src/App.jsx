import { useEffect, useState } from 'react'
import { songs } from './data/music.js'
import { loadPlaylists, savePlaylists } from './data/playlists.js'
import AuthView from './features/auth/AuthView.jsx'
import useAuth from './features/auth/useAuth.js'
import DiscoveryView from './features/discovery/DiscoveryView.jsx'
import MiniPlayer from './features/mini-player/MiniPlayer.tsx'
import './styles/app.css'
import './styles/home.css'

function MainApp() {
  const auth = useAuth()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSongId, setSelectedSongId] = useState(null)
  const [likedSongIds, setLikedSongIds] = useState(() => new Set())
  const [playlists, setPlaylists] = useState(() => loadPlaylists(songs))

  useEffect(() => {
    savePlaylists(playlists)
  }, [playlists])

  function createPlaylist(details) {
    const playlist = {
      id: `playlist-${Date.now()}`,
      title: details.title.trim() || 'Playlist sin t\u00edtulo',
      description: details.description.trim(),
      artwork: details.artwork ?? songs[0]?.artwork ?? null,
      pinned: Boolean(details.pinned),
      songIds: [],
    }

    setPlaylists((currentPlaylists) => [playlist, ...currentPlaylists])
    return playlist.id
  }

  function updatePlaylist(playlistId, changes) {
    setPlaylists((currentPlaylists) => currentPlaylists.map((playlist) => (
      playlist.id === playlistId ? { ...playlist, ...changes } : playlist
    )))
  }

  function addSongToPlaylist(playlistId, songId) {
    setPlaylists((currentPlaylists) => currentPlaylists.map((playlist) => {
      if (playlist.id !== playlistId || playlist.songIds.includes(songId)) return playlist
      return { ...playlist, songIds: [...playlist.songIds, songId] }
    }))
  }

  function reorderPlaylist(playlistId, songIds) {
    setPlaylists((currentPlaylists) => currentPlaylists.map((playlist) => (
      playlist.id === playlistId ? { ...playlist, songIds } : playlist
    )))
  }

  function toggleFavorite(songId) {
    setLikedSongIds((currentIds) => {
      const nextIds = new Set(currentIds)
      if (nextIds.has(songId)) nextIds.delete(songId)
      else nextIds.add(songId)
      return nextIds
    })
  }

  if (auth.isLoading) {
    return (
      <main className="session-loading" aria-label="Cargando sesion">
        <span className="session-loading__disc" aria-hidden="true" />
      </main>
    )
  }

  if (!auth.user) {
    return (
      <AuthView
        authError={auth.error}
        clearError={auth.clearError}
        isSubmitting={auth.isSubmitting}
        onGoogleLogin={auth.loginWithGoogle}
        onLogin={auth.login}
        onRegister={auth.register}
      />
    )
  }

  return (
    <DiscoveryView
      onLogout={auth.logout}
      onSearchChange={setSearchQuery}
      onSongSelect={setSelectedSongId}
      addSongToPlaylist={addSongToPlaylist}
      createPlaylist={createPlaylist}
      likedSongIds={likedSongIds}
      onToggleFavorite={toggleFavorite}
      onUpdatePlaylist={updatePlaylist}
      onReorderPlaylist={reorderPlaylist}
      playlists={playlists}
      searchQuery={searchQuery}
      selectedSongId={selectedSongId}
      songs={songs}
      user={auth.user}
    />
  )
}

function App() {
  if (window.__MYSIC_MINI_PLAYER__ || window.location.hash === '#/mini-player') return <MiniPlayer />
  return <MainApp />
}

export default App
