// Preferencias de letra por canción: fuente fijada ("solo para esta canción") y desfase. Un único almacén en memoria
// que avisa a sus suscriptores (el controlador y la vista extensa ven siempre lo mismo) y se guarda en disco con una
// pausa (el desfase se pulsa varias veces seguidas). Tope de entradas: el localStorage de Mysic ya va justo.
import { readStorage, writeStorage } from '../../../lib/storage.js'

const KEY = 'mysic:lyrics:prefs'
const MAX_ENTRIES = 400
const SAVE_DELAY_MS = 400
export const OFFSET_STEP = 0.25
export const OFFSET_LIMIT = 15
const DEFAULT = Object.freeze({ source: null, offset: 0 })

let memory = null
let saveTimer = 0
const listeners = new Set()
const snapshots = new Map()
const load = () => (memory ??= readStorage(KEY, {}) ?? {})

export const clampOffset = (value) => Math.max(-OFFSET_LIMIT, Math.min(OFFSET_LIMIT, Math.round((Number(value) || 0) / OFFSET_STEP) * OFFSET_STEP))

/** { source, offset } de una canción. Mismo objeto mientras no cambie (vale para useSyncExternalStore). */
export function readSongPrefs(key) {
  if (!key) return DEFAULT
  if (!snapshots.has(key)) {
    const entry = load()[key]
    snapshots.set(key, entry ? Object.freeze({ source: entry.source ?? null, offset: clampOffset(entry.offset ?? 0) }) : DEFAULT)
  }
  return snapshots.get(key)
}

export function subscribeSongPrefs(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Cambia las preferencias de una canción (o las borra si vuelven a lo predeterminado). La más reciente va al final. */
export function writeSongPrefs(key, patch) {
  if (!key) return
  const current = readSongPrefs(key)
  const next = { source: 'source' in patch ? patch.source ?? null : current.source, offset: clampOffset('offset' in patch ? patch.offset : current.offset) }
  const all = { ...load() }
  delete all[key]
  const entry = {}
  if (next.source) entry.source = next.source
  if (next.offset) entry.offset = next.offset
  if (Object.keys(entry).length) all[key] = entry
  const keys = Object.keys(all)
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) { delete all[old]; snapshots.delete(old) }
  memory = all
  snapshots.set(key, Object.keys(entry).length ? Object.freeze(next) : DEFAULT)
  listeners.forEach((listener) => listener())
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => writeStorage(KEY, memory), SAVE_DELAY_MS)
}
