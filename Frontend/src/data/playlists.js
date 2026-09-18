const STORAGE_KEY = 'mysic-playlists'

const legacySampleIds = new Set([
  'quiet-mornings', 'road-trip', 'focus', 'indie-night', 'gym', 'lofi-beats',
])

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
  const songsById = new Map(songs.map((song) => [song.id, song]))

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) return []

    const parsed = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []

    const storedPlaylists = parsed.flatMap((playlist) => {
      const sanitized = legacySampleIds.has(playlist?.id) ? null : sanitizePlaylist(playlist, songsById)
      return sanitized ? [sanitized] : []
    })
    return storedPlaylists
  } catch {
    return []
  }
}

export function savePlaylists(playlists) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(playlists))
}

export function clearPlaylists() {
  window.localStorage.removeItem(STORAGE_KEY)
}
