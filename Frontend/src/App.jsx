import { useCallback, useEffect, useState } from 'react'
import { songs } from './data/music.js'
import { clearPlaylists, loadPlaylists } from './data/playlists.js'
import { catalogApi, favoritesApi, playlistsApi } from './lib/api.js'
import AuthView from './features/auth/AuthView.jsx'
import useAuth from './features/auth/useAuth.js'
import DiscoveryView from './features/discovery/DiscoveryView.jsx'
import NewArtistSpotlightDemo from './features/discovery/NewArtistSpotlightDemo.jsx'
import MiniPlayer from './features/mini-player/MiniPlayer.tsx'
import './styles/app.css'
import './styles/home.css'

function MainApp() {
  const auth = useAuth()
  const [librarySongs, setLibrarySongs] = useState([])
  const [libraryLoading, setLibraryLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSongId, setSelectedSongId] = useState(null)
  const [likedSongIds, setLikedSongIds] = useState(() => new Set())
  const [likedAlbumIds, setLikedAlbumIds] = useState(() => new Set())
  const [likedArtistIds, setLikedArtistIds] = useState(() => new Set())
  const [favoritesLoading, setFavoritesLoading] = useState(true)
  const [favoritesError, setFavoritesError] = useState('')
  const [playlists, setPlaylists] = useState([])
  const [playlistsLoading, setPlaylistsLoading] = useState(true)
  const [playlistsError, setPlaylistsError] = useState('')
  const [navidromeError, setNavidromeError] = useState(null)

  const refreshLibrary = useCallback(async () => {
    const catalogSongs = await catalogApi.listSongs()
    const songsWithArtwork = catalogSongs.map((song, index) => ({
      ...song,
      artwork: song.artwork ?? songs[index % songs.length]?.artwork ?? null,
    }))
    setLibrarySongs(songsWithArtwork)
    setNavidromeError(catalogSongs.length
      ? null
      : { kind: 'empty', message: 'El catálogo PostgreSQL todavía no contiene canciones.' })
    return songsWithArtwork
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadLibrary() {
      try {
        const catalogSongs = await refreshLibrary()
        if (cancelled) return
        if (catalogSongs.length > 0) {
          setLibraryLoading(false)
          return
        }
      } catch (error) {
        console.warn('El catálogo PostgreSQL todavía no está disponible:', error)
      }

      if (!cancelled) {
        setLibrarySongs([])
        setNavidromeError({ kind: 'empty', message: 'El catálogo PostgreSQL todavía no contiene canciones.' })
      }

      if (!cancelled) setLibraryLoading(false)
    }

    loadLibrary()

    return () => {
      cancelled = true
    }
  }, [refreshLibrary])

  useEffect(() => {
    let cancelled = false

    if (!auth.user) {
      setLikedSongIds(new Set())
      setLikedAlbumIds(new Set())
      setLikedArtistIds(new Set())
      setFavoritesLoading(false)
      return undefined
    }

    setFavoritesLoading(true)
    favoritesApi.getAll()
      .then((favorites) => {
        if (cancelled) return
        setLikedSongIds(new Set(favorites.songs ?? []))
        setLikedAlbumIds(new Set(favorites.albums ?? []))
        setLikedArtistIds(new Set(favorites.artists ?? []))
        setFavoritesError('')
      })
      .catch((error) => {
        if (!cancelled) setFavoritesError(error.message || 'No se pudieron cargar tus favoritos.')
      })
      .finally(() => {
        if (!cancelled) setFavoritesLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [auth.user])

  useEffect(() => {
    let cancelled = false

    if (!auth.user) {
      setPlaylists([])
      setPlaylistsLoading(false)
      return undefined
    }
    if (libraryLoading) {
      setPlaylistsLoading(true)
      return undefined
    }

    setPlaylistsLoading(true)
    async function loadUserPlaylists() {
      try {
        let storedPlaylists = await playlistsApi.list()
        if (!storedPlaylists.length) {
          const localPlaylists = loadPlaylists(librarySongs)
          if (localPlaylists.length) {
            storedPlaylists = await Promise.all(localPlaylists.map(({ id: _id, ...playlist }) => (
              playlistsApi.create(playlist)
            )))
          }
        }
        clearPlaylists()
        if (!cancelled) {
          setPlaylists(storedPlaylists)
          setPlaylistsError('')
        }
      } catch (error) {
        if (!cancelled) setPlaylistsError(error.message || 'No se pudieron cargar tus playlists.')
      } finally {
        if (!cancelled) setPlaylistsLoading(false)
      }
    }

    loadUserPlaylists()
    return () => {
      cancelled = true
    }
  }, [auth.user, libraryLoading])

  function replacePlaylist(savedPlaylist) {
    setPlaylists((currentPlaylists) => currentPlaylists.map((playlist) => (
      playlist.id === savedPlaylist.id ? savedPlaylist : playlist
    )))
  }

  async function createPlaylist(details) {
    try {
      const playlist = await playlistsApi.create({
        title: details.title.trim() || 'Playlist sin t\u00edtulo',
        description: details.description.trim(),
        artwork: details.artwork ?? librarySongs[0]?.artwork ?? null,
        artworkPublicId: details.artworkPublicId ?? null,
        pinned: Boolean(details.pinned),
        songIds: [],
      })
      setPlaylists((currentPlaylists) => [playlist, ...currentPlaylists])
      setPlaylistsError('')
      return playlist.id
    } catch (error) {
      setPlaylistsError(error.message || 'No se pudo crear la playlist.')
      return null
    }
  }

  async function updatePlaylist(playlistId, changes) {
    try {
      const playlist = await playlistsApi.update(playlistId, changes)
      replacePlaylist(playlist)
      setPlaylistsError('')
      return true
    } catch (error) {
      setPlaylistsError(error.message || 'No se pudo actualizar la playlist.')
      return false
    }
  }

  async function deletePlaylist(playlistId) {
    try {
      await playlistsApi.remove(playlistId)
      setPlaylists((currentPlaylists) => currentPlaylists.filter((playlist) => playlist.id !== playlistId))
      setPlaylistsError('')
      return true
    } catch (error) {
      setPlaylistsError(error.message || 'No se pudo eliminar la playlist.')
      return false
    }
  }

  async function setSongInPlaylist(playlistId, songId, included) {
    const playlist = playlists.find((item) => item.id === playlistId)
    if (!playlist) return false
    const alreadyIncluded = playlist.songIds.includes(songId)
    if (included === alreadyIncluded) return true
    const songIds = included
      ? [...playlist.songIds, songId]
      : playlist.songIds.filter((currentSongId) => currentSongId !== songId)
    return updatePlaylist(playlistId, { songIds })
  }

  function addSongToPlaylist(playlistId, songId) {
    const playlist = playlists.find((item) => item.id === playlistId)
    if (playlist?.songIds.includes(songId)) return true
    return updatePlaylist(playlistId, {
      songIds: playlist ? [...playlist.songIds, songId] : [songId],
    })
  }

  function reorderPlaylist(playlistId, songIds) {
    return updatePlaylist(playlistId, { songIds })
  }

  async function setFavorite(type, itemId, liked) {
    const setters = {
      song: setLikedSongIds,
      album: setLikedAlbumIds,
      artist: setLikedArtistIds,
    }
    const setIds = setters[type]
    if (!setIds) return

    setIds((currentIds) => {
      const nextIds = new Set(currentIds)
      if (liked) nextIds.add(itemId)
      else nextIds.delete(itemId)
      return nextIds
    })
    setFavoritesError('')

    try {
      await favoritesApi.set(type, itemId, liked)
    } catch (error) {
      setIds((currentIds) => {
        const nextIds = new Set(currentIds)
        if (liked) nextIds.delete(itemId)
        else nextIds.add(itemId)
        return nextIds
      })
      setFavoritesError(error.message || 'No se pudo actualizar el favorito.')
    }
  }

  if (auth.isLoading || libraryLoading || (auth.user && (favoritesLoading || playlistsLoading))) {
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
          Catálogo: {navidromeError.message}
        </div>
      )}
      {favoritesError && (
        <div role="alert" style={{ background: '#3b1717', color: '#ffd6d6', padding: '10px 16px', textAlign: 'center' }}>
          Favoritos: {favoritesError}
        </div>
      )}
      {playlistsError && (
        <div role="alert" style={{ background: '#3b1717', color: '#ffd6d6', padding: '10px 16px', textAlign: 'center' }}>
          Playlists: {playlistsError}
        </div>
      )}
      <DiscoveryView
      onLogout={auth.logout}
      onCatalogRefresh={refreshLibrary}
      onDeletePlaylist={deletePlaylist}
      onImportNav={() => { window.location.hash = '#/importar' }}
      onSearchChange={setSearchQuery}
      onSongSelect={setSelectedSongId}
      addSongToPlaylist={addSongToPlaylist}
      createPlaylist={createPlaylist}
      likedSongIds={likedSongIds}
      likedAlbumIds={likedAlbumIds}
      likedArtistIds={likedArtistIds}
      onToggleAlbumFavorite={(albumId, liked) => setFavorite('album', albumId, liked)}
      onToggleArtistFavorite={(artistId, liked) => setFavorite('artist', artistId, liked)}
      onToggleFavorite={(songId, liked) => setFavorite('song', songId, liked)}
      onUpdatePlaylist={updatePlaylist}
      onReorderPlaylist={reorderPlaylist}
      onSetSongInPlaylist={setSongInPlaylist}
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
  if (window.location.hash === '#/demo/nuevo-artista') return <NewArtistSpotlightDemo />
  return <MainApp />
}

export default App
