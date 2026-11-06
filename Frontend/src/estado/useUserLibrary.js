import { useCallback, useEffect, useRef, useState } from 'react'
import { clearPlaylists, hasStoredPlaylists, loadPlaylists } from '../data/playlists.js'
import { favoritesApi, playlistsApi } from '../lib/api.js'
import { persistedCache } from '../lib/persistedCache.js'
import { readStorage, writeStorage } from '../lib/storage.js'
import { playlistHasTrack, setPlaylistTrack } from '../features/playlists/playlistTracks.js'

export default function useUserLibrary({ libraryLoading, librarySongs, user }) {
  const [selectedSongId, setSelectedSongIdState] = useState(null)
  const [selectedSongRestored, setSelectedSongRestored] = useState(false)
  const [likedSongIds, setLikedSongIds] = useState(() => new Set())
  const [likedAlbumIds, setLikedAlbumIds] = useState(() => new Set())
  const [likedArtistIds, setLikedArtistIds] = useState(() => new Set())
  const [favoritesLoading, setFavoritesLoading] = useState(true)
  const [favoritesError, setFavoritesError] = useState('')
  const [playlists, setPlaylists] = useState([])
  const [playlistsLoading, setPlaylistsLoading] = useState(true)
  const [playlistsError, setPlaylistsError] = useState('')
  const userStorageId = user?.id ?? user?.email ?? user?.username ?? null
  const selectedSongStorageKey = userStorageId ? `mysic:user:${userStorageId}:selected-song` : null
  const favoritesCacheKey = userStorageId ? `favorites:${userStorageId}` : null
  const playlistsCacheKey = userStorageId ? `playlists:${userStorageId}` : null
  const [pendingLocalMigration, setPendingLocalMigration] = useState(false)
  const migrationRunningRef = useRef(false)
  // Clave de la cuenta a la que pertenecen los datos en memoria. Es estado (no ref) a propósito:
  // el efecto de persistencia debe ver el valor del render anterior al cambio de cuenta, para que
  // los favoritos o playlists del usuario previo nunca se guarden en la caché del nuevo.
  const [favoritesOwner, setFavoritesOwner] = useState(null)
  const [playlistsOwner, setPlaylistsOwner] = useState(null)

  useEffect(() => {
    const savedSongId = selectedSongStorageKey ? readStorage(selectedSongStorageKey, null) : null
    setSelectedSongIdState(savedSongId)
    setSelectedSongRestored(Boolean(savedSongId))
  }, [selectedSongStorageKey])

  const setSelectedSongId = useCallback((songId) => {
    setSelectedSongRestored(false)
    setSelectedSongIdState(songId)
    if (selectedSongStorageKey) writeStorage(selectedSongStorageKey, songId)
  }, [selectedSongStorageKey])

  useEffect(() => {
    let cancelled = false

    if (!user) {
      setLikedSongIds(new Set())
      setLikedAlbumIds(new Set())
      setLikedArtistIds(new Set())
      setFavoritesLoading(false)
      return undefined
    }

    // Stale-while-revalidate: si hay copia local se pintan los corazones al instante
    // y se revalidan contra el servidor en segundo plano.
    const cached = favoritesCacheKey ? persistedCache.read(favoritesCacheKey) : null
    setFavoritesOwner(favoritesCacheKey)
    setLikedSongIds(new Set(cached?.songs ?? []))
    setLikedAlbumIds(new Set(cached?.albums ?? []))
    setLikedArtistIds(new Set(cached?.artists ?? []))
    setFavoritesLoading(!cached)

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

    return () => { cancelled = true }
  }, [user, favoritesCacheKey])

  useEffect(() => {
    // Solo se persiste lo que ya validó el servidor o una acción del usuario, nunca el estado inicial vacío.
    if (!favoritesCacheKey || favoritesLoading || favoritesOwner !== favoritesCacheKey) return
    persistedCache.write(favoritesCacheKey, {
      songs: [...likedSongIds],
      albums: [...likedAlbumIds],
      artists: [...likedArtistIds],
    })
  }, [favoritesCacheKey, favoritesLoading, favoritesOwner, likedAlbumIds, likedArtistIds, likedSongIds])

  useEffect(() => {
    let cancelled = false

    if (!user) {
      setPlaylists([])
      setPlaylistsLoading(false)
      setPendingLocalMigration(false)
      return undefined
    }

    // Se piden en cuanto hay sesión, en paralelo con el catálogo (antes esperaban a que el
    // catálogo terminara y se volvían a pedir cada vez que cambiaba `librarySongs`).
    const cached = playlistsCacheKey ? persistedCache.read(playlistsCacheKey) : null
    setPlaylistsOwner(playlistsCacheKey)
    setPlaylists(cached ?? [])
    setPlaylistsLoading(!cached)

    playlistsApi.list()
      .then((storedPlaylists) => {
        if (cancelled) return
        setPlaylists(storedPlaylists)
        setPlaylistsError('')
        // Solo la migración de playlists antiguas guardadas en este navegador necesita el catálogo.
        if (!storedPlaylists.length && hasStoredPlaylists()) setPendingLocalMigration(true)
        else clearPlaylists()
      })
      .catch((error) => {
        if (!cancelled) setPlaylistsError(error.message || 'No se pudieron cargar tus playlists.')
      })
      .finally(() => {
        if (!cancelled) setPlaylistsLoading(false)
      })

    return () => { cancelled = true }
  }, [user, playlistsCacheKey])

  useEffect(() => {
    if (!pendingLocalMigration || libraryLoading || migrationRunningRef.current) return undefined

    let cancelled = false
    migrationRunningRef.current = true
    async function migrateLocalPlaylists() {
      try {
        const localPlaylists = loadPlaylists(librarySongs)
        const created = localPlaylists.length
          ? await Promise.all(localPlaylists.map(({ id: _id, ...playlist }) => playlistsApi.create(playlist)))
          : []
        clearPlaylists()
        if (!cancelled) {
          if (created.length) setPlaylists(created)
          setPendingLocalMigration(false)
        }
      } catch (error) {
        if (!cancelled) setPlaylistsError(error.message || 'No se pudieron migrar tus playlists locales.')
      } finally {
        migrationRunningRef.current = false
      }
    }

    void migrateLocalPlaylists()
    return () => { cancelled = true }
  }, [libraryLoading, librarySongs, pendingLocalMigration])

  useEffect(() => {
    if (!playlistsCacheKey || playlistsLoading || playlistsOwner !== playlistsCacheKey) return
    persistedCache.write(playlistsCacheKey, playlists)
  }, [playlists, playlistsCacheKey, playlistsLoading, playlistsOwner])

  function replacePlaylist(savedPlaylist) {
    setPlaylists((current) => current.map((playlist) => playlist.id === savedPlaylist.id ? savedPlaylist : playlist))
  }

  async function createPlaylist(details) {
    try {
      const playlist = await playlistsApi.create({
        title: details.title.trim() || 'Playlist sin título',
        description: details.description.trim(),
        artwork: details.artwork ?? librarySongs[0]?.artwork ?? null,
        artworkPublicId: details.artworkPublicId ?? null,
        pinned: Boolean(details.pinned),
        songIds: [],
        externalSongs: [],
        tracks: [],
      })
      setPlaylists((current) => [playlist, ...current])
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
      setPlaylists((current) => current.filter((playlist) => playlist.id !== playlistId))
      setPlaylistsError('')
      return true
    } catch (error) {
      setPlaylistsError(error.message || 'No se pudo eliminar la playlist.')
      return false
    }
  }

  function setTrackInPlaylist(playlistId, song, included) {
    const playlist = playlists.find((item) => item.id === playlistId)
    if (!playlist) return false
    if (playlistHasTrack(playlist, song) === included) return true
    const tracks = setPlaylistTrack(playlist, song, included)
    return updatePlaylist(playlistId, { tracks })
  }

  async function reorderPlaylist(playlistId, tracks) {
    const previous = playlists.find((playlist) => playlist.id === playlistId)
    if (!previous) return false
    setPlaylists((current) => current.map((playlist) => playlist.id === playlistId ? { ...playlist, tracks } : playlist))

    try {
      replacePlaylist(await playlistsApi.update(playlistId, { tracks }))
      setPlaylistsError('')
      return true
    } catch (error) {
      setPlaylists((current) => current.map((playlist) => (
        playlist.id === playlistId && playlist.tracks === tracks ? previous : playlist
      )))
      setPlaylistsError(error.message || 'No se pudo actualizar la playlist.')
      return false
    }
  }

  async function setFavorite(type, itemId, liked) {
    const setIds = { song: setLikedSongIds, album: setLikedAlbumIds, artist: setLikedArtistIds }[type]
    if (!setIds) return

    const updateIds = (current, shouldInclude) => {
      const next = new Set(current)
      if (shouldInclude) next.add(itemId)
      else next.delete(itemId)
      return next
    }
    setIds((current) => updateIds(current, liked))
    setFavoritesError('')

    try {
      await favoritesApi.set(type, itemId, liked)
    } catch (error) {
      setIds((current) => updateIds(current, !liked))
      setFavoritesError(error.message || 'No se pudo actualizar el favorito.')
    }
  }

  return {
    createPlaylist,
    deletePlaylist,
    favoritesError,
    favoritesLoading,
    likedAlbumIds,
    likedArtistIds,
    likedSongIds,
    playlists,
    playlistsError,
    playlistsLoading,
    reorderPlaylist,
    selectedSongId,
    selectedSongRestored,
    setTrackInPlaylist,
    setFavorite,
    setSelectedSongId,
    updatePlaylist,
  }
}
