import { translateShelfTitle } from './shelfTitles.js'

// Configuración del inicio de YouTube Music: tamaño de las tarjetas, secciones visibles y su orden.
// Todo es lógica pura (sin React ni almacenamiento) para poder probarla.

/** Anchos de tarjeta: el "medio" es el tamaño actual; el pequeño cabe ~1/5 más y el grande ~1/4 menos. */
export const CARD_SIZES = {
  small: { label: 'Pequeño', css: 'clamp(104px, 7.4vw, 124px)' },
  medium: { label: 'Mediano', css: 'clamp(124px, 9vw, 148px)' },
  large: { label: 'Grande', css: 'clamp(152px, 11.5vw, 184px)' },
}

export const DEFAULT_LAYOUT = Object.freeze({ cardSize: 'medium', hidden: [], order: [] })

// Orden por defecto de las secciones conocidas: primero lo personal y de uso diario (retomar lo que
// escuchabas y atajos), luego descubrimiento a partir del gusto, después la comunidad y las novedades,
// y al final lo más genérico (tendencias, videos). Las secciones que YouTube añada y no estén aquí
// van detrás de las conocidas, en el orden en que llegan.
const DEFAULT_ORDER = [
  'volver a escuchar',
  'selección rápida',
  'mixes para ti',
  'tu descubrimiento diario',
  'álbumes para ti',
  'favoritos olvidados',
  'de tu biblioteca',
  'de la comunidad',
  'recomendado para ti',
  'lo nuevo y lo que más te gusta',
  'novedades',
  'nuevos lanzamientos',
  'playlists destacadas',
  'playlists destacadas para ti',
  'canciones en tendencia',
  'canciones en tendencia para ti',
  'tendencias',
  'videos musicales para ti',
  'escuchas largas',
]

const rankOf = new Map(DEFAULT_ORDER.map((key, index) => [key, index]))

/** Clave estable de una sección: el título ya traducido y en minúsculas (igual en inglés o español). */
export function shelfKey(title) {
  return String(translateShelfTitle(title) ?? '').trim().toLocaleLowerCase()
}

const unique = (values) => [...new Set(values.filter((value) => typeof value === 'string' && value))]

/** Devuelve una configuración válida a partir de cualquier cosa guardada (JSON corrupto incluido). */
export function sanitizeLayout(raw) {
  const value = raw && typeof raw === 'object' ? raw : {}
  return {
    cardSize: Object.hasOwn(CARD_SIZES, value.cardSize) ? value.cardSize : DEFAULT_LAYOUT.cardSize,
    hidden: Array.isArray(value.hidden) ? unique(value.hidden) : [],
    order: Array.isArray(value.order) ? unique(value.order) : [],
  }
}

/** Claves en el orden final: lo que el usuario ordenó, luego las conocidas por prioridad, luego el resto. */
export function resolveOrder(keys, layout) {
  const present = unique(keys)
  const saved = layout.order.filter((key) => present.includes(key))
  const savedSet = new Set(saved)
  const rest = present
    .filter((key) => !savedSet.has(key))
    .map((key, index) => ({ index, key, rank: rankOf.get(key) ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.key)
  return [...saved, ...rest]
}

/**
 * Aplica la configuración a las secciones recibidas.
 * `visible` son las que se pintan (en orden); `sections` son todas, para el panel de edición.
 */
export function applyHomeLayout(shelves, layout) {
  const byKey = new Map()
  for (const shelf of shelves ?? []) {
    const key = shelfKey(shelf.title)
    if (key && !byKey.has(key)) byKey.set(key, shelf)
  }
  const hidden = new Set(layout.hidden)
  const sections = resolveOrder([...byKey.keys()], layout).map((key) => ({
    hidden: hidden.has(key),
    key,
    shelf: byKey.get(key),
    title: translateShelfTitle(byKey.get(key).title),
  }))
  return { sections, visible: sections.filter((section) => !section.hidden).map((section) => section.shelf) }
}

/** Fija el orden completo actual de las secciones (al soltar una tras arrastrarla). */
export function withOrder(layout, orderedKeys) {
  return { ...layout, order: unique(orderedKeys) }
}

export function toggleHidden(layout, key) {
  const hidden = layout.hidden.includes(key) ? layout.hidden.filter((entry) => entry !== key) : [...layout.hidden, key]
  return { ...layout, hidden }
}

export function setAllHidden(layout, keys, hidden) {
  return { ...layout, hidden: hidden ? unique(keys) : [] }
}

export function moveKey(keys, key, offset) {
  const from = keys.indexOf(key)
  const to = from + offset
  if (from < 0 || to < 0 || to >= keys.length) return keys
  const next = [...keys]
  next.splice(from, 1)
  next.splice(to, 0, key)
  return next
}
