import { useEffect, useRef, useState } from 'react'
import { songs } from './data/music.js'
import { loadPlaylists, savePlaylists } from './data/playlists.js'
import { createNavidromeClient } from './lib/navidrome.js'
import AuthView from './features/auth/AuthView.jsx'
import useAuth from './features/auth/useAuth.js'
import DiscoveryView from './features/discovery/DiscoveryView.jsx'
import MiniPlayer from './features/mini-player/MiniPlayer.tsx'
import './styles/app.css'
import './styles/home.css'

function mapNavidromeSong(song, index, client) {
  return {
    id: song.id,
    title: song.title || 'Sin título',
    artist: song.artist || 'Artista desconocido',
    plays: song.playCount ? `${song.playCount} reproducciones` : 'Navidrome',
    artwork: songs[index % songs.length]?.artwork ?? null,
    albumId: song.albumId || song.album || `album-${song.id}`,
    durationSeconds: song.duration || 0,
    audioUrl: client.getStreamUrl(song.id),
  }
}

function MainApp() {
  const auth = useAuth()
  const [librarySongs, setLibrarySongs] = useState(songs)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSongId, setSelectedSongId] = useState(null)
  const [likedSongIds, setLikedSongIds] = useState(() => new Set())
  const [playlists, setPlaylists] = useState(() => loadPlaylists(songs))
  const [remoteLibrarySongs, setRemoteLibrarySongs] = useState([])
  const [navidromeError, setNavidromeError] = useState(null)
  const clientRef = useRef(null)

  useEffect(() => {
    const password = import.meta.env.VITE_NAVIDROME_PASSWORD
    if (!password) {
      console.warn('VITE_NAVIDROME_PASSWORD no está configurada; se usarán canciones demo.')
      return undefined
    }

    const client = createNavidromeClient({
      baseUrl: import.meta.env.VITE_NAVIDROME_URL || 'http://155.181.37.222:4533',
      username: import.meta.env.VITE_NAVIDROME_USER || 'RAWR',
      password,
    })
    clientRef.current = client

    let cancelled = false
    client.getRandomSongs({ count: 500 }).then((response) => {
      if (cancelled) return
      const remoteSongs = (response.randomSongs?.song ?? []).map((song, index) => mapNavidromeSong(song, index, client))

      if (remoteSongs.length > 0) {
        setRemoteLibrarySongs(remoteSongs)
        setLibrarySongs(remoteSongs)
        setNavidromeError(null)
      } else {
        setNavidromeError({ kind: 'empty', message: 'Navidrome respondió, pero no devolvió canciones.' })
      }
    }).catch((error) => {
      console.error('No se pudo cargar la biblioteca de Navidrome:', error)
      setNavidromeError(error)
    })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const query = searchQuery.trim()
    if (!query || !clientRef.current) {
      if (!query && remoteLibrarySongs.length > 0) setLibrarySongs(remoteLibrarySongs)
      return undefined
    }

    let cancelled = false
    const timer = setTimeout(() => {
      clientRef.current.searchSongs(query).then((response) => {
        if (cancelled) return
        const remoteSongs = (response.searchResult3?.song ?? []).map((song, index) => mapNavidromeSong(song, index, clientRef.current))
        setLibrarySongs(remoteSongs)
        setNavidromeError(remoteSongs.length ? null : { kind: 'empty', message: 'No se encontraron canciones para esa búsqueda.' })
      }).catch((error) => {
        if (!cancelled) setNavidromeError(error)
      })
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [remoteLibrarySongs, searchQuery])

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
    <>
      {navidromeError && (
        <div role="alert" style={{ background: '#3b1717', color: '#ffd6d6', padding: '10px 16px', textAlign: 'center' }}>
          Navidrome: {navidromeError.message}
        </div>
      )}
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
      songs={librarySongs}
      user={auth.user}
      />
    </>
  )
}

function App() {
  if (window.__MYSIC_MINI_PLAYER__ || window.location.hash === '#/mini-player') return <MiniPlayer />
  return <MainApp />
}

export default App
