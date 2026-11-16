import { setItemSafe } from '../../lib/storage.js'
import { shelfKey } from './homeLayout.js'
import { playHistoryOwner } from './playHistory.js'

// Últimas escuchas para "Volver a escuchar": canciones sueltas, álbumes y playlists, lo más reciente primero.
// Una canción que suena como parte de un álbum o playlist cuenta para esa colección, no como canción suelta
// (si no, reproducir un álbum llenaría el bloque con sus doce canciones).
const STORAGE_KEY = 'mysic:recent-listens:v1'
export const RECENT_LIMIT = 60
const KINDS = new Set(['song', 'album', 'playlist'])
const FIELDS = ['id', 'title', 'artist', 'artistId', 'album', 'albumId', 'thumbnail', 'subtitle']

export const recentKey = (entry) => `${entry.kind}:${entry.id}`

/** Entrada compacta con la forma de los elementos de las secciones del Inicio ({ kind, id, title, thumbnail, ... }). */
export function compactRecent(kind, entry) {
  if (!KINDS.has(kind) || !entry?.id) return null
  const source = { ...entry, album: entry.album ?? entry.albumTitle, thumbnail: entry.thumbnail ?? entry.artwork, title: entry.title ?? entry.name }
  if (!source.title) return null
  const compact = { kind }
  for (const field of FIELDS) if (source[field] != null && source[field] !== '') compact[field] = source[field]
  return compact
}

/** Pone `item` al principio (si ya estaba, lo sube) y recorta la lista. Función pura. */
export function addRecent(entries, item, now = Date.now()) {
  if (!item) return entries
  const key = recentKey(item)
  return [{ ...item, at: now }, ...entries.filter((entry) => recentKey(entry) !== key)].slice(0, RECENT_LIMIT)
}

/** Lista válida a partir de cualquier cosa guardada. Función pura. */
export function sanitizeRecents(raw) {
  if (!Array.isArray(raw)) return []
  const seen = new Set()
  return raw
    .filter((entry) => entry && KINDS.has(entry.kind) && typeof entry.id === 'string' && entry.id && typeof entry.title === 'string' && entry.title)
    .filter((entry) => !seen.has(recentKey(entry)) && seen.add(recentKey(entry)))
    .slice(0, RECENT_LIMIT)
}

/**
 * Bloque "Volver a escuchar": primero tus escuchas en este equipo y, para completar, lo que propone YouTube Music.
 * Solo canciones, álbumes y playlists, sin repetir y sin lo que ya está en Accesos directos (`exclude`: claves tipo:id).
 */
export function mergeListenAgain(local, remote = [], { exclude = [], limit = 30 } = {}) {
  const seen = new Set(exclude)
  const out = []
  for (const entry of [...local, ...remote]) {
    if (out.length >= limit) break
    if (!entry || !KINDS.has(entry.kind) || !entry.id) continue
    const key = recentKey(entry)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(entry)
  }
  return out
}

/**
 * Secciones del Inicio con "Volver a escuchar" construido desde tus escuchas (y completado con lo de YouTube Music).
 * Si YouTube no envió ese bloque pero hay escuchas, se añade al principio. Sin escuchas devuelve la misma lista.
 */
export function withListenAgain(shelves, local, exclude = []) {
  if (!shelves || !local.length) return shelves
  const index = shelves.findIndex((shelf) => shelfKey(shelf.title) === 'volver a escuchar')
  const items = mergeListenAgain(local, index >= 0 ? shelves[index].items : [], { exclude })
  if (!items.length) return shelves
  if (index < 0) return [{ items, title: 'Listen again' }, ...shelves]
  return shelves.map((shelf, position) => (position === index ? { ...shelf, items } : shelf))
}

const storageKey = () => `${STORAGE_KEY}:${playHistoryOwner()}`

function read() {
  if (!playHistoryOwner()) return []
  try {
    return sanitizeRecents(JSON.parse(localStorage.getItem(storageKey()) ?? '[]'))
  } catch {
    return []
  }
}

function save(entries) {
  if (!playHistoryOwner()) return
  try {
    setItemSafe(storageKey(), JSON.stringify(entries))
  } catch {
    // Sin almacenamiento: no hay historial.
  }
}

// Colección que está sonando: sus canciones no se anotan sueltas.
let context = null

/** Se empezó a reproducir un álbum o playlist (`songs`: sus canciones). */
export function noteCollectionPlay(kind, entry, songs = []) {
  const item = compactRecent(kind, entry)
  if (!item) return
  context = { ids: new Set(songs.map((song) => song.id)), item }
  save(addRecent(read(), item))
}

/** Empezó a sonar una canción: cuenta para la colección en curso o, si es suelta, se anota ella. */
export function noteSongPlay(song) {
  if (!song?.id) return
  if (context?.ids.has(song.id)) {
    save(addRecent(read(), context.item))
    return
  }
  context = null
  save(addRecent(read(), compactRecent('song', song)))
}

/** Últimas escuchas guardadas (lo más reciente primero), ya sin la marca de tiempo. */
export const readRecentListens = () => read().map(({ at: _at, ...entry }) => entry)
