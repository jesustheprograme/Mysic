import { useSyncExternalStore } from 'react'
import { setItemSafe } from '../../lib/storage.js'

// Accesos directos que el usuario fija a mano desde el menú de una canción, álbum, playlist o artista.
const STORAGE_KEY = 'mysic:quick-access:v1'
export const PINNED_LIMIT = 24
const KINDS = new Set(['album', 'artist', 'playlist', 'song'])

/** Normaliza lo guardado: solo entradas válidas, sin duplicados, con tope. Función pura. */
export function sanitizePinned(raw) {
  if (!Array.isArray(raw)) return []
  const seen = new Set()
  return raw
    .filter((entry) => entry && KINDS.has(entry.kind) && typeof entry.id === 'string' && entry.id && typeof entry.title === 'string' && entry.title)
    .filter((entry) => !seen.has(`${entry.kind}:${entry.id}`) && seen.add(`${entry.kind}:${entry.id}`))
    .slice(0, PINNED_LIMIT)
    .map(({ id, kind, subtitle, thumbnail, title }) => ({ id, kind, subtitle: subtitle ?? '', thumbnail: thumbnail ?? null, title }))
}

/** Acceso directo a partir del elemento de una tarjeta o canción (misma forma que los de la biblioteca). */
export function shortcutOf(kind, entry) {
  const subtitle = { album: entry.artist ?? 'Álbum', artist: 'Artista', playlist: 'Playlist', song: entry.artist ?? 'Canción' }[kind]
  return { id: entry.id, kind, subtitle, thumbnail: entry.thumbnail ?? entry.artwork ?? null, title: entry.title ?? entry.name ?? '' }
}

// Accesos automáticos (En repetición, Me gusta, playlists y álbumes recientes) que el usuario quitó con la "x".
const HIDDEN_KEY = 'mysic:quick-access-hidden:v1'
const HIDDEN_LIMIT = 200
export const shortcutKey = (kind, id) => `${kind}:${id}`

/** Normaliza la lista de ocultos: solo textos, sin repetir y con tope. Función pura. */
export function sanitizeHidden(raw) {
  return Array.isArray(raw) ? [...new Set(raw.filter((key) => typeof key === 'string' && key))].slice(-HIDDEN_LIMIT) : []
}

const readJson = (key) => {
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? '[]')
  } catch {
    return []
  }
}
const writeJson = (key, value) => {
  try {
    setItemSafe(key, JSON.stringify(value), window.localStorage)
  } catch {
    // Sin almacenamiento: el cambio vale durante la sesión.
  }
}

// Orden elegido arrastrando las tarjetas (claves tipo:id); lo que no está aquí conserva su orden natural detrás.
const ORDER_KEY = 'mysic:quick-access-order:v1'

let pinned = sanitizePinned(readJson(STORAGE_KEY))
let hidden = sanitizeHidden(readJson(HIDDEN_KEY))
let order = sanitizeHidden(readJson(ORDER_KEY))
const listeners = new Set()
const notify = () => listeners.forEach((listener) => listener())

function commit(next) {
  pinned = sanitizePinned(next)
  writeJson(STORAGE_KEY, pinned)
  notify()
}
function commitHidden(next) {
  hidden = sanitizeHidden(next)
  writeJson(HIDDEN_KEY, hidden)
  notify()
}

export const isPinned = (kind, id) => pinned.some((entry) => entry.kind === kind && entry.id === id)
// Fijar algo que se había quitado lo devuelve a la lista.
export const pinShortcut = (entry) => {
  if (hidden.includes(shortcutKey(entry.kind, entry.id))) commitHidden(hidden.filter((key) => key !== shortcutKey(entry.kind, entry.id)))
  if (!isPinned(entry.kind, entry.id)) commit([...pinned, entry])
}
export const unpinShortcut = (kind, id) => commit(pinned.filter((entry) => !(entry.kind === kind && entry.id === id)))
// La "x": quita el acceso (fijado o automático) y evita que vuelva a salir solo; volver a fijarlo lo recupera.
export function dismissShortcut(kind, id) {
  if (isPinned(kind, id)) commit(pinned.filter((entry) => !(entry.kind === kind && entry.id === id)))
  commitHidden([...hidden, shortcutKey(kind, id)])
}

const subscribe = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Lista de accesos fijados (se actualiza sola al añadir o quitar desde cualquier menú). */
export const usePinnedShortcuts = () => useSyncExternalStore(subscribe, () => pinned)
/** Guarda el orden en que quedaron las tarjetas tras arrastrar una. */
export function setShortcutOrder(keys) {
  order = sanitizeHidden(keys)
  writeJson(ORDER_KEY, order)
  notify()
}
/** Orden elegido por el usuario (claves tipo:id). */
export const useShortcutOrder = () => useSyncExternalStore(subscribe, () => order)
/** Claves (tipo:id) de los accesos automáticos quitados con la "x". */
export const useHiddenShortcuts = () => useSyncExternalStore(subscribe, () => hidden)
