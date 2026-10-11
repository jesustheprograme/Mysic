import { isTauri } from '@tauri-apps/api/core'

const isTauriRuntime = isTauri() || Boolean(window.__TAURI_INTERNALS__)
const desktopApiUrl = import.meta.env.VITE_DESKTOP_API_URL?.trim()
  || 'https://myslc.duckdns.org/api'
const defaultApiUrl = isTauriRuntime
  ? desktopApiUrl
  : import.meta.env.DEV ? `http://${window.location.hostname}:4000/api` : '/api'
const API_URL = (import.meta.env.VITE_API_URL || defaultApiUrl).replace(/\/$/, '')

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request(path, options = {}) {
  let response
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData

  try {
    response = await fetch(`${API_URL}${path}`, {
      credentials: 'include',
      headers: {
        ...(!isFormData && { 'Content-Type': 'application/json' }),
        ...options.headers,
      },
      ...options,
    })
  } catch {
    throw new ApiError('No se pudo conectar con el servidor de Mysic.', 0)
  }

  const data = response.status === 204 ? null : await response.json().catch(() => null)

  if (!response.ok) {
    throw new ApiError(data?.message || data?.detail || 'No se pudo completar la solicitud.', response.status)
  }

  return data
}

export const authApi = {
  getSession: () => request('/auth/me'),
  login: (credentials) => request('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  }),
  register: (account) => request('/auth/register', {
    method: 'POST',
    body: JSON.stringify(account),
  }),
  loginWithGoogle: (credential) => request('/auth/google', {
    method: 'POST',
    body: JSON.stringify({ credential, remember: true }),
  }),
  logout: () => request('/auth/logout', { method: 'POST' }),
}

export const favoritesApi = {
  getAll: async () => {
    const data = await request('/favorites')
    return data.favorites
  },
  set: (type, itemId, liked) => request(
    `/favorites/${encodeURIComponent(type)}/${encodeURIComponent(itemId)}`,
    { method: liked ? 'PUT' : 'DELETE' },
  ),
}

export const playlistsApi = {
  list: async () => {
    const data = await request('/playlists')
    return data.playlists.map(mapPlaylist)
  },
  create: async (playlist) => {
    const data = await request('/playlists', {
      method: 'POST',
      body: JSON.stringify(playlist),
    })
    return mapPlaylist(data.playlist)
  },
  update: async (playlistId, changes) => {
    const data = await request(`/playlists/${encodeURIComponent(playlistId)}`, {
      method: 'PATCH',
      body: JSON.stringify(changes),
    })
    return mapPlaylist(data.playlist)
  },
  remove: (playlistId) => request(`/playlists/${encodeURIComponent(playlistId)}`, {
    method: 'DELETE',
  }),
  uploadArtwork: async (file) => {
    const formData = new FormData()
    formData.append('artwork', file)
    const data = await request('/playlists/artwork', {
      method: 'POST',
      body: formData,
    })
    return data.artwork
  },
}

function mapCatalogAsset(assetPath) {
  if (!assetPath || /^(?:https?:|data:|blob:)/i.test(assetPath)) return assetPath ?? null

  const normalizedPath = assetPath.startsWith('/') ? assetPath : `/${assetPath}`
  if (normalizedPath === '/api' || normalizedPath.startsWith('/api/')) {
    if (!/^https?:\/\//i.test(API_URL)) return normalizedPath
    return new URL(normalizedPath, new URL(API_URL).origin).href
  }

  return `${API_URL}${normalizedPath}`
}

function mapPlaylist(playlist) {
  return {
    ...playlist,
    artwork: mapCatalogAsset(playlist.artwork),
  }
}

function mapCatalogSong(song) {
  return {
    ...song,
    album: song.album ? { ...song.album, artwork: mapCatalogAsset(song.album.artwork) } : null,
    albumMemberships: song.albumMemberships?.map((album) => ({
      ...album,
      artwork: mapCatalogAsset(album.artwork),
    })) ?? [],
    artists: song.artists?.map((artist) => ({
      ...artist,
      image: mapCatalogAsset(artist.image),
      images: artist.images?.map(mapCatalogAsset) ?? [],
    })) ?? [],
    artwork: mapCatalogAsset(song.artwork),
    audioUrl: song.audioPath ? `${API_URL}${song.audioPath}` : null,
  }
}

function mapCatalogArtist(artist) {
  if (!artist) return null

  return {
    ...artist,
    artistId: artist.id,
    title: artist.name,
    artwork: mapCatalogAsset(artist.artwork),
    images: artist.images?.map(mapCatalogAsset) ?? [],
    albums: artist.albums.map((album) => ({ ...album, artwork: mapCatalogAsset(album.artwork) })),
    songs: artist.songs.map(mapCatalogSong),
  }
}

export const catalogApi = {
  listSongs: async ({ limit = 250, page = 1, search = '' } = {}) => {
    const query = new URLSearchParams({ limit: String(limit), page: String(page) })
    if (search.trim()) query.set('search', search.trim())
    const data = await request(`/catalog/songs?${query}`)
    return {
      songs: data.songs.map(mapCatalogSong),
      pagination: data.pagination,
    }
  },
  getArtist: async (artistId) => {
    const data = await request(`/catalog/artists/${encodeURIComponent(artistId)}`)
    return mapCatalogArtist(data.artist)
  },
  getArtistSpotlight: async ({ includeViewed = false } = {}) => {
    const query = includeViewed ? '?includeViewed=true' : ''
    const data = await request(`/catalog/spotlight${query}`)
    return mapCatalogArtist(data.artist)
  },
  markArtistSpotlightViewed: (artistId) => request(
    `/catalog/spotlight/${encodeURIComponent(artistId)}/viewed`,
    { method: 'PUT' },
  ),
  getAlbum: async (albumId) => {
    const data = await request(`/catalog/albums/${encodeURIComponent(albumId)}`)
    return {
      ...data.album,
      artwork: mapCatalogAsset(data.album.artwork),
      songs: data.album.songs.map(mapCatalogSong),
    }
  },
}
