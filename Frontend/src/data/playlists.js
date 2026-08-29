const STORAGE_KEY = 'mysic-playlists'

const defaultPlaylistSeeds = [
  {
    id: 'quiet-mornings',
    title: 'Ma\u00f1anas tranquilas',
    description: 'Una selecci\u00f3n para empezar el d\u00eda con calma.',
    songCount: 12,
    artworkIndex: 0,
    pinned: true,
  },
  {
    id: 'road-trip',
    title: 'Viaje por carretera',
    description: 'Canciones para acompa\u00f1ar el camino.',
    songCount: 18,
    artworkIndex: 2,
    pinned: false,
  },
  {
    id: 'focus',
    title: 'Enfoque',
    description: 'Ritmos suaves para concentrarte.',
    songCount: 24,
    artworkIndex: 3,
    pinned: false,
  },
  {
    id: 'indie-night',
    title: 'Noche indie',
    description: 'Una mezcla para escuchar sin prisa.',
    songCount: 16,
    artworkIndex: 5,
    pinned: false,
  },
  {
    id: 'gym',
    title: 'Gym',
    description: 'Ritmo para mantenerte en movimiento.',
    songCount: 20,
    artworkIndex: 1,
    pinned: false,
  },
  {
    id: 'lofi-beats',
    title: 'Lo-fi beats',
    description: 'Texturas suaves para bajar el ritmo.',
    songCount: 14,
    artworkIndex: 4,
    pinned: false,
  },
]

function getSongIds(songs, start, count) {
  return songs.slice(start, start + count).map((song) => song.id)
}

export function createDefaultPlaylists(songs) {
  return defaultPlaylistSeeds.map((seed) => ({
    ...seed,
    artwork: songs[seed.artworkIndex]?.artwork ?? null,
    songIds: getSongIds(songs, seed.artworkIndex * 8, seed.songCount),
  }))
}

function sanitizePlaylist(playlist, songsById) {
  if (!playlist || typeof playlist.id !== 'string' || typeof playlist.title !== 'string') return null

  const songIds = Array.isArray(playlist.songIds)
    ? playlist.songIds.filter((songId) => songsById.has(songId))
    : []

  return {
    id: playlist.id,
    title: playlist.title.trim() || 'Playlist sin t\u00edtulo',
    description: typeof playlist.description === 'string' ? playlist.description : '',
    artwork: typeof playlist.artwork === 'string' ? playlist.artwork : null,
    pinned: Boolean(playlist.pinned),
    songIds,
  }
}

export function loadPlaylists(songs) {
  const fallback = createDefaultPlaylists(songs)
  const songsById = new Map(songs.map((song) => [song.id, song]))

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) return fallback

    const parsed = JSON.parse(stored)
    if (!Array.isArray(parsed)) return fallback

    const storedPlaylists = parsed.flatMap((playlist) => {
      const sanitized = sanitizePlaylist(playlist, songsById)
      return sanitized ? [sanitized] : []
    })
    const storedIds = new Set(storedPlaylists.map((playlist) => playlist.id))
    return [...storedPlaylists, ...fallback.filter((playlist) => !storedIds.has(playlist.id))]
  } catch {
    return fallback
  }
}

export function savePlaylists(playlists) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(playlists))
}
