import { useSyncExternalStore } from 'react'
import { setItemSafe } from '../../lib/storage.js'
import { planPin } from './quickAccessModel.js'

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
// Lo que el inicio muestra ahora mismo (lo publica QuickAccess en cada cálculo): al fijar, lo que ya se ve se queda.
let visible = []
export const setVisibleShortcuts = (entries) => { visible = entries }

/**
 * Fija un acceso sin reemplazar ninguno de los que se ven (ver planPin): devuelve false si ya hay 10 y no cabe.
 * Fijar algo que se había quitado con la "x" lo devuelve a la lista.
 */
export function pinShortcut(entry) {
  const plan = planPin({ entry, pinned, visible })
  if (!plan.ok) return false
  if (hidden.includes(shortcutKey(entry.kind, entry.id))) commitHidden(hidden.filter((key) => key !== shortcutKey(entry.kind, entry.id)))
  if (plan.pinned !== pinned) commit(plan.pinned)
  setManaged()
  return true
}
export const unpinShortcut = (kind, id) => commit(pinned.filter((entry) => !(entry.kind === kind && entry.id === id)))

/** Los automáticos que se ven ahora, como fijados (en su orden), sin `except`. */
const visibleAutos = (except) => visible
  .filter((item) => item.kind !== 'special' && !item.pinned && shortcutKey(item.kind, item.id) !== except)
  .map(({ id, kind, subtitle, thumbnail, title }) => ({ id, kind, subtitle, thumbnail, title }))

// La "x": quita el acceso (fijado o automático) y evita que vuelva a salir solo; volver a fijarlo lo recupera.
// La primera vez que se personaliza, los demás accesos que se veían pasan a ser de la lista del usuario: así el hueco
// que deja la "x" queda libre para fijar otro, en vez de ocuparlo al instante otra playlist automática.
export function dismissShortcut(kind, id) {
  const key = shortcutKey(kind, id)
  const kept = pinned.filter((entry) => !(entry.kind === kind && entry.id === id))
  commit(managed ? kept : [...kept, ...visibleAutos(key)])
  commitHidden([...hidden, key])
  setManaged()
}

// ¿Ya personalizó el usuario sus accesos? Desde entonces lo automático no rellena huecos (ver buildQuickAccess).
const MANAGED_KEY = 'mysic:quick-access-managed:v1'
let managed = (() => {
  try {
    return window.localStorage.getItem(MANAGED_KEY) === '1'
  } catch {
    return false
  }
})()
function setManaged() {
  if (managed) return
  managed = true
  try {
    setItemSafe(MANAGED_KEY, '1', window.localStorage)
  } catch {
    // Sin almacenamiento: vale durante la sesión.
  }
  notify()
}
/** ¿Lista de accesos personalizada por el usuario? */
export const useShortcutsManaged = () => useSyncExternalStore(subscribe, () => managed)

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
