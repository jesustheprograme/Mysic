import { readStorage, writeStorage } from '../../../lib/storage.js'

// v2: al cambiar la sección por defecto a YouTube Music se descarta la ruta guardada
// anteriormente (casi siempre '#/inicio'); si no, los usuarios actuales seguirían aterrizando en Mysic.
const ROUTE_STORAGE_KEY = 'mysic:last-route:v2'

/** Sección que se abre al entrar sin una ruta válida. */
export const DEFAULT_SECTION = 'youtube'

export const sectionHashes = {
  home: '#/inicio',
  explore: '#/explorar',
  'for-you': '#/favoritas',
  recent: '#/historial',
  albums: '#/albumes',
  artists: '#/artistas',
  playlists: '#/playlists',
  downloads: '#/descargas',
  youtube: '#/youtube',
  import: '#/importar',
  stats: '#/estadisticas',
}

const hashSections = Object.fromEntries(
  Object.entries(sectionHashes).map(([section, hash]) => [hash, section]),
)

function isKnownRoute(hash) {
  if (typeof hash !== 'string') return false
  return Boolean(
    hashSections[hash]
    || /^#(?:playlist|album|artist)-.+/.test(hash),
  )
}

export function rememberRouteHash(hash = window.location.hash) {
  if (isKnownRoute(hash)) writeStorage(ROUTE_STORAGE_KEY, hash)
}

export function restoreLastRoute() {
  if (isKnownRoute(window.location.hash)) {
    rememberRouteHash()
    return
  }

  const defaultHash = sectionHashes[DEFAULT_SECTION]
  const savedHash = readStorage(ROUTE_STORAGE_KEY, defaultHash)
  const nextHash = isKnownRoute(savedHash) ? savedHash : defaultHash
  window.history.replaceState(window.history.state, '', nextHash)
}

const albumTitles = {
  afterglow: 'Afterglow',
  'soft-static': 'Soft Static',
  'parallel-lines': 'Parallel Lines',
  'red-thread': 'Red Thread',
  'low-tide': 'Low Tide',
}

export function getPlaylistIdFromHash() {
  return window.location.hash.startsWith('#playlist-') ? window.location.hash.slice('#playlist-'.length) : null
}

export function getAlbumIdFromHash() {
  return window.location.hash.startsWith('#album-') ? window.location.hash.slice(1) : null
}

export function getArtistIdFromHash() {
  return window.location.hash.startsWith('#artist-') ? window.location.hash.slice('#artist-'.length) : null
}

export function getSectionFromHash() {
  if (getPlaylistIdFromHash()) return 'playlist'
  if (getAlbumIdFromHash()) return 'album'
  if (getArtistIdFromHash()) return 'artist'
  return hashSections[window.location.hash] ?? DEFAULT_SECTION
}

export function createAlbumItems(songs) {
  const albums = new Map()

  songs.forEach((song) => {
    if (albums.has(song.albumId)) return

    albums.set(song.albumId, {
      id: `album-${song.albumId}`,
      albumId: song.albumId,
      title: song.albumTitle ?? albumTitles[song.albumId] ?? song.albumId,
      artist: song.artist,
      artistId: song.artistId,
      artistArtwork: song.artists?.find((artist) => artist.id === song.artistId)?.image
        ?? song.artists?.[0]?.image
        ?? song.artwork,
      artwork: song.artwork,
      audioUrl: song.audioUrl,
      releaseType: song.album?.releaseType ?? song.albumMemberships?.[0]?.releaseType ?? 'album',
      year: song.releaseDate ? new Date(song.releaseDate).getUTCFullYear() : null,
    })
  })

  return Array.from(albums.values())
}

export function createArtistItems(songs) {
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

export function getFollowingSongs(songs, selectedSongId, count = 10) {
  if (!songs.length || !selectedSongId) return []
  const selectedIndex = songs.findIndex((song) => song.id === selectedSongId)
  if (selectedIndex < 0) return []

  return Array.from({ length: Math.min(count, Math.max(0, songs.length - 1)) }, (_, index) => (
    songs[(selectedIndex + index + 1) % songs.length]
  ))
}

export function getPlaybackQueue(songs, selectedSongId) {
  if (!selectedSongId || !songs.some((song) => song.id === selectedSongId)) return []
  return songs
}

export function getPlaybackTrackKey(song) {
  if (!song?.id) return ''
  return `${song.source === 'youtube' ? 'youtube' : 'local'}:${song.id}`
}

export function getRelativePlaybackSong(songs, currentSong, offset) {
  if (!songs.length || !currentSong || !offset) return null
  const currentKey = getPlaybackTrackKey(currentSong)
  const currentIndex = songs.findIndex((song) => getPlaybackTrackKey(song) === currentKey)
  if (currentIndex < 0) return null
  const nextIndex = (currentIndex + offset + songs.length) % songs.length
  return songs[nextIndex]
}

export function resolvePlaybackSongs(catalogSongs, contextSongs, restoredSongs, selectedSongId) {
  if (contextSongs.length) return contextSongs
  if (restoredSongs.some((song) => song.id === selectedSongId)) return restoredSongs
  return catalogSongs
}

export function shuffleSongs(songs) {
  const shuffledSongs = [...songs]

  for (let index = shuffledSongs.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    const currentSong = shuffledSongs[index]
    shuffledSongs[index] = shuffledSongs[randomIndex]
    shuffledSongs[randomIndex] = currentSong
  }

  return shuffledSongs
}
