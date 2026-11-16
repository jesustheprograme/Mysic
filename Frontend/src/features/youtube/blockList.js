import { useSyncExternalStore } from 'react'
import { setItemSafe } from '../../lib/storage.js'

// Lo que el usuario no quiere ver ni oír: artistas bloqueados y canciones marcadas "No me gusta". Vive en este equipo
// (el servidor no tiene estas acciones): se usa para filtrar las secciones del Inicio y las radios automáticas.
const STORAGE_KEY = 'mysic:blocklist:v1'
const LIMIT = 500

/** Normaliza lo guardado (JSON dañado incluido). Función pura. */
export function sanitizeBlockList(raw) {
  const value = raw && typeof raw === 'object' ? raw : {}
  const seen = new Set()
  const artists = (Array.isArray(value.artists) ? value.artists : [])
    .filter((artist) => artist && typeof artist.id === 'string' && artist.id && !seen.has(artist.id) && seen.add(artist.id))
    .map((artist) => ({ id: artist.id, name: typeof artist.name === 'string' ? artist.name : '' }))
    .slice(-LIMIT)
  const songs = [...new Set((Array.isArray(value.songs) ? value.songs : []).filter((id) => typeof id === 'string' && id))].slice(-LIMIT)
  return { artists, songs }
}

const toView = (list) => ({ artistIds: new Set(list.artists.map((artist) => artist.id)), artists: list.artists, songIds: new Set(list.songs) })

/** ¿Este elemento (canción, álbum, playlist o artista) queda fuera por la lista? `view` es lo que da useBlockList. */
export function isBlockedItem(item, view) {
  if (!item) return false
  if (item.kind === 'artist') return view.artistIds.has(item.id)
  if (item.kind === 'song' && view.songIds.has(item.id)) return true
  return Boolean(item.artistId) && view.artistIds.has(item.artistId)
}

/** Secciones sin lo bloqueado; una sección que se queda vacía desaparece. Sin nada bloqueado devuelve la misma lista. */
export function filterShelves(shelves, view) {
  if (!shelves || (!view.artistIds.size && !view.songIds.size)) return shelves
  let changed = false
  const next = []
  for (const shelf of shelves) {
    const items = shelf.items.filter((item) => !isBlockedItem(item, view))
    if (items.length === shelf.items.length) next.push(shelf)
    else {
      changed = true
      if (items.length) next.push({ ...shelf, items })
    }
  }
  return changed ? next : shelves
}

function readStored() {
  try {
    return sanitizeBlockList(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null'))
  } catch {
    return sanitizeBlockList(null)
  }
}

let list = readStored()
let view = toView(list)
const listeners = new Set()

function commit(next) {
  list = sanitizeBlockList(next)
  view = toView(list)
  try {
    setItemSafe(STORAGE_KEY, JSON.stringify(list), window.localStorage)
  } catch {
    // Sin almacenamiento: vale durante la sesión.
  }
  listeners.forEach((listener) => listener())
}

export const isArtistBlocked = (id) => view.artistIds.has(id)
export const isSongDisliked = (id) => view.songIds.has(id)

/** Bloquea o desbloquea un artista; devuelve si quedó bloqueado. */
export function toggleArtistBlock(id, name = '') {
  const blocked = view.artistIds.has(id)
  commit({ ...list, artists: blocked ? list.artists.filter((artist) => artist.id !== id) : [...list.artists, { id, name }] })
  return !blocked
}

/** Marca o desmarca "No me gusta" en una canción; devuelve si quedó marcada. */
export function toggleSongDislike(id) {
  const disliked = view.songIds.has(id)
  commit({ ...list, songs: disliked ? list.songs.filter((song) => song !== id) : [...list.songs, id] })
  return !disliked
}

/** Canciones permitidas (para radios y reproducción automática). */
export const allowedSongs = (songs) => ((view.artistIds.size || view.songIds.size) ? songs.filter((song) => !isBlockedItem({ ...song, kind: 'song' }, view)) : songs)

const subscribe = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Lista actual como conjuntos: { artistIds, songIds, artists }. Cambia de identidad solo cuando cambia la lista. */
export const useBlockList = () => useSyncExternalStore(subscribe, () => view)
