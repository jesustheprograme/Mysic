import { setItemSafe } from '../../lib/storage.js'

// Historial local de reproducciones: alimenta "En repetición". Funciones puras + un envoltorio de almacenamiento.
const STORAGE_KEY = 'mysic:play-history:v1'
const MAX_ENTRIES = 600
const DEDUPE_MS = 30_000
const DAY_MS = 86_400_000

const compact = (song) => ({
  id: song.id,
  title: song.title,
  artist: song.artist,
  artistId: song.artistId,
  album: song.album ?? song.albumTitle,
  albumId: song.albumId,
  thumbnail: song.thumbnail ?? song.artwork,
  durationSeconds: song.durationSeconds,
  source: song.source ?? 'youtube',
})

/** Añade una reproducción (ignora la misma canción repetida en menos de 30 s) y recorta a las más recientes. */
export function recordPlay(entries, song, now = Date.now()) {
  if (!song?.id) return entries
  const last = entries.at(-1)
  if (last && last.id === song.id && now - last.at < DEDUPE_MS) return entries
  const next = [...entries, { id: song.id, at: now, song: compact(song) }]
  return next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next
}

/** Canciones más escuchadas en la ventana, de más a menos. Una sola reproducción no es "repetición" (minPlays 2). */
export function topPlays(entries, { limit = 50, minPlays = 2, now = Date.now(), windowDays = 30 } = {}) {
  const since = now - windowDays * DAY_MS
  const stats = new Map()
  for (const entry of entries) {
    if (entry.at < since) continue
    const stat = stats.get(entry.id) ?? { count: 0, last: 0, song: entry.song }
    stat.count += 1
    stat.last = Math.max(stat.last, entry.at)
    stat.song = entry.song
    stats.set(entry.id, stat)
  }
  return [...stats.values()]
    .filter((stat) => stat.count >= minPlays)
    .sort((a, b) => b.count - a.count || b.last - a.last)
    .slice(0, limit)
    .map((stat) => stat.song)
}

let owner = null

/** Usuario dueño del historial: cada cuenta tiene el suyo. El historial global antiguo no se sabe de quién es y se descarta. */
export function setPlayHistoryOwner(id) {
  const next = id ? String(id) : null
  if (next === owner) return
  owner = next
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Sin almacenamiento: nada que limpiar.
  }
}

/** Usuario actual del historial (null sin sesión): lo comparten las últimas escuchas. */
export const playHistoryOwner = () => owner

const storageKey = () => `${STORAGE_KEY}:${owner}`

function read() {
  if (!owner) return []
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey()) ?? '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** Guarda una reproducción en el almacenamiento del navegador (un fallo de cuota no rompe la app). */
export function recordPlayInStorage(song) {
  if (!owner) return
  try {
    const current = read()
    const next = recordPlay(current, song)
    if (next !== current) setItemSafe(storageKey(), JSON.stringify(next))
  } catch {
    // Sin almacenamiento disponible: simplemente no hay historial.
  }
}

export const readTopPlays = (options) => topPlays(read(), options)

/** Historial antiguo completo (para importarlo una vez a Estadísticas). */
export const readPlayHistory = () => read()