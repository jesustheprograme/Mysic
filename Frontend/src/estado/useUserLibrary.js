import { useEffect, useState } from 'react'
import { clearPlaylists, loadPlaylists } from '../data/playlists.js'
import { favoritesApi, playlistsApi } from '../lib/api.js'
import { playlistHasTrack, setPlaylistTrack } from '../features/playlists/playlistTracks.js'

export default function useUserLibrary({ libraryLoading, librarySongs, user }) {
  const [selectedSongId, setSelectedSongId] = useState(null)
  const [likedSongIds, setLikedSongIds] = useState(() => new Set())
  const [likedAlbumIds, setLikedAlbumIds] = useState(() => new Set())
  const [likedArtistIds, setLikedArtistIds] = useState(() => new Set())
  const [favoritesLoading, setFavoritesLoading] = useState(true)
  const [favoritesError, setFavoritesError] = useState('')
  const [playlists, setPlaylists] = useState([])
  const [playlistsLoading, setPlaylistsLoading] = useState(true)
  const [playlistsError, setPlaylistsError] = useState('')

  useEffect(() => {
    let cancelled = false

    if (!user) {
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

    return () => { cancelled = true }
  }, [user])

  useEffect(() => {
    let cancelled = false

    if (!user) {
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
            storedPlaylists = await Promise.all(localPlaylists.map(({ id: _id, ...playlist }) => playlistsApi.create(playlist)))
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

    void loadUserPlaylists()
    return () => { cancelled = true }
  }, [libraryLoading, librarySongs, user])

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
    setTrackInPlaylist,
    setFavorite,
    setSelectedSongId,
    updatePlaylist,
  }
}
