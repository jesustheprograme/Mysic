import { useSyncExternalStore } from 'react'
import { dbGet, dbPut, STORES } from './appDb.js'
import { isYoutubeLikedList } from './libraryModel.js'

// Índice de tus playlists personales: en qué listas está cada canción (el ✓ "Guardada en") y desde cuándo.
//
// YouTube Music no dice qué playlists son tuyas ni cuándo se añadió una canción. Lo primero se deduce del autor que
// trae cada playlist de la biblioteca ("The adventurer • 46 tracks"): el autor que más se repite es el dueño de la
// cuenta. Lo segundo lo anota Mysic: la fecha en que vio la canción por primera vez en esa lista. Las canciones que ya
// estaban la primera vez que se indexó la lista no tienen fecha (no se inventa).

/** Cada cuánto se vuelve a pedir una lista aunque su número de pistas no haya cambiado. */
export const INDEX_MAX_AGE_MS = 24 * 60 * 60 * 1000
const LIKED = 'liked'

/** Autor de una playlist a partir de su descripción ("Autor • 46 tracks"). Función pura. */
export const authorOf = (playlist) => String(playlist?.description ?? '').split(' • ')[0].trim()

/** Dueño de la cuenta: el autor con más playlists en la biblioteca (al menos 2). Función pura. */
export function pickOwner(playlists) {
  const counts = new Map()
  for (const playlist of playlists ?? []) {
    if (isYoutubeLikedList(playlist)) continue
    const author = authorOf(playlist)
    if (author) counts.set(author, (counts.get(author) ?? 0) + 1)
  }
  let owner = null
  let best = 1
  for (const [author, count] of counts) if (count > best) { owner = author; best = count }
  return owner
}

/** Playlists personales (del dueño), sin la lista de Me gusta. Función pura. */
export const personalPlaylists = (playlists, owner) => (owner ? (playlists ?? []).filter((playlist) => !isYoutubeLikedList(playlist) && authorOf(playlist) === owner) : [])

/** ¿Hay que volver a pedir esta lista? Si nunca se indexó, cambió su número de pistas o es vieja. Función pura. */
export const needsRefresh = (entry, playlist, now = Date.now()) => !entry || entry.count !== (playlist.itemCount ?? 0) || now - entry.indexedAt > INDEX_MAX_AGE_MS

/**
 * Nueva entrada del índice para una lista con sus canciones actuales. Conserva la fecha de lo que ya estaba, pone
 * `now` a lo nuevo y nada (desconocida) a todo si es la primera vez que se indexa. Función pura.
 */
export function indexEntry(previous, playlist, songIds, now = Date.now()) {
  const added = {}
  for (const id of songIds) {
    if (previous?.added?.[id] !== undefined) added[id] = previous.added[id]
    else if (previous && !previous.songIds.includes(id)) added[id] = now
  }
  return {
    added,
    author: playlist.author ?? authorOf(playlist),
    count: playlist.itemCount ?? songIds.length,
    id: playlist.id,
    indexedAt: now,
    songIds: [...new Set(songIds)],
    thumbnail: playlist.thumbnail ?? null,
    title: playlist.title ?? 'Playlist',
  }
}

/** Mapa canción → listas en las que está. Función pura. */
export function membership(entries) {
  const map = new Map()
  for (const entry of Object.values(entries)) {
    if (entry.id === LIKED) continue
    for (const id of entry.songIds) {
      const list = map.get(id)
      if (list) list.push(entry)
      else map.set(id, [entry])
    }
  }
  return map
}

// ---- Estado en memoria (una sola instancia; la vista lo lee con hooks) ----
let userKey = null
let entries = {}
let byPlaylist = new Map()
let bySong = new Map()
const listeners = new Set()
const notify = () => listeners.forEach((listener) => listener())

function commit(next, { persist = true } = {}) {
  entries = next
  byPlaylist = new Map(Object.values(next).map((entry) => [entry.id, entry]))
  bySong = membership(next)
  notify()
  if (persist && userKey) {
    // Las fechas de Me gusta viven con la lista de Me gusta (likedDb), no aquí.
    const saved = { ...next }
    delete saved[LIKED]
    void dbPut(STORES.playlists, userKey, { entries: saved, savedAt: Date.now() })
  }
}

/** Carga el índice guardado de un usuario (al arrancar o al cambiar de cuenta). */
let loading = Promise.resolve()
export function loadPlaylistIndex(key) {
  if (userKey === key) return loading
  userKey = key
  commit({}, { persist: false })
  loading = dbGet(STORES.playlists, key).then((saved) => {
    if (userKey === key && saved?.entries) commit({ ...saved.entries, ...(entries[LIKED] ? { [LIKED]: entries[LIKED] } : {}) }, { persist: false })
  })
  return loading
}

let running = null

/**
 * Pone al día el índice con las playlists de la biblioteca: pide solo las listas personales nuevas, cambiadas o
 * viejas, de una en una y a ritmo tranquilo (trabajo de fondo). Una sola sincronización a la vez.
 */
export function syncPlaylistIndex(playlists, fetchSongs) {
  if (running || !userKey) return running
  const key = userKey
  running = (async () => {
    await loading
    const owner = pickOwner(playlists)
    const personal = personalPlaylists(playlists, owner)
    const keep = new Set([LIKED, ...personal.map((playlist) => playlist.id)])
    let next = Object.fromEntries(Object.entries(entries).filter(([id]) => keep.has(id)))
    for (const playlist of personal) {
      if (userKey !== key) return
      if (!needsRefresh(next[playlist.id], playlist)) continue
      try {
        const songs = await fetchSongs(playlist.id)
        next = { ...next, [playlist.id]: indexEntry(next[playlist.id], playlist, songs.map((song) => song.id)) }
        commit(next)
      } catch {
        // Una lista que falla se reintenta en la próxima sincronización.
      }
      await new Promise((resolve) => setTimeout(resolve, 150))
    }
    if (userKey === key) commit(next)
  })().finally(() => { running = null })
  return running
}

/** Al abrir una playlist personal ya indexada, sus canciones recién cargadas actualizan el índice (sin pedir nada). */
export function notePlaylistContents(playlist, songs) {
  const entry = byPlaylist.get(playlist.id)
  if (!entry || !userKey) return
  const ids = songs.map((song) => song.id)
  if (ids.length === entry.songIds.length && ids.every((id, index) => id === entry.songIds[index])) return
  commit({ ...entries, [playlist.id]: indexEntry(entry, { ...entry, itemCount: ids.length, thumbnail: playlist.thumbnail ?? entry.thumbnail, title: playlist.title ?? entry.title }, ids) })
}

/** Fechas de Me gusta (las calcula la sincronización de Me gusta). */
export function setLikedAdded(added) {
  commit({ ...entries, [LIKED]: { added, id: LIKED, songIds: [] } }, { persist: false })
}

const subscribe = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
const snapshot = () => entries

/** Listas personales en las que está una canción (vacío si ninguna). */
export function useSavedIn(songId) {
  useSyncExternalStore(subscribe, snapshot)
  return bySong.get(songId) ?? NONE
}
const NONE = []

/** Función que da la fecha (ms) en que se vio una canción por primera vez en una lista, o null si no se sabe. */
export function useAddedAt(playlistId) {
  useSyncExternalStore(subscribe, snapshot)
  const entry = playlistId === LIKED ? entries[LIKED] : byPlaylist.get(playlistId)
  return entry ? (songId) => entry.added?.[songId] ?? null : null
}

export const LIKED_INDEX_ID = LIKED
