// Caché de Inicio y Explorar por usuario y alcance de cuenta, en memoria y en disco (persistedCache).
// Permite pintar lo último visto al instante (cache-first) y refrescar por detrás sin borrar nada.
//
// El alcance incluye el usuario de Mysic Y si la cuenta de YouTube está vinculada (Inicio personalizado o
// anónimo): nada personalizado puede aparecer en otro usuario ni tras desvincular. Cambiar de cuenta, vincular
// o desvincular invalida exactamente ese alcance. Una respuesta vacía nunca sustituye a una válida.
import { persistedCache } from '../../lib/persistedCache.js'
import { perfMark } from './perfMarks.js'

export const LANDING_KINDS = ['home', 'explore']
const STALE_AFTER_MS = 30 * 60 * 1000
const MAX_MEMORY_ENTRIES = 12

/** Lista vacía compartida: misma identidad en cada lectura, para no invalidar los useMemo que dependen de ella. */
export const NO_SHELVES = Object.freeze([])

export const isLandingKind = (kind) => LANDING_KINDS.includes(kind)
export const isEmptyLanding = (data) => !(data?.shelves?.length > 0)

/** Alcance de caché: usuario de Mysic (prefijo de almacenamiento) + estado de vinculación. */
export const landingScope = (prefix, account) => `${prefix}|${account?.connected ? 'p' : 'a'}`

export function createLandingCache({ persisted = persistedCache, now = Date.now } = {}) {
  const memory = new Map()
  // Secciones de las páginas extra del Inicio ya vistas en esta ejecución (solo memoria, por alcance). Mientras se
  // vuelve a pedir el Inicio se siguen mostrando, para que lo ya cargado no desaparezca y reaparezca.
  const extras = new Map()
  const keyOf = (scope, kind) => `youtube-landing:${scope}:${kind}`

  function remember(key, entry) {
    memory.delete(key)
    memory.set(key, entry)
    while (memory.size > MAX_MEMORY_ENTRIES) memory.delete(memory.keys().next().value)
  }

  return {
    /** { data, stale } o null. Lee de memoria y, si no está, del disco. */
    get(scope, kind) {
      const key = keyOf(scope, kind)
      let entry = memory.get(key)
      if (!entry) {
        const stored = persisted.read(key)
        if (!stored || isEmptyLanding(stored.data)) {
          perfMark('landing-cache', { kind, result: 'MISS' })
          return null
        }
        entry = stored
        remember(key, entry)
      }
      const stale = now() - entry.savedAt > STALE_AFTER_MS
      perfMark('landing-cache', { kind, result: stale ? 'STALE' : 'HIT' })
      return { data: entry.data, stale }
    },
    /** Guarda sin el token de continuación (caduca en el servidor en minutos) y rechaza respuestas vacías. */
    set(scope, kind, data) {
      if (isEmptyLanding(data)) return false
      const entry = { savedAt: now(), data: { ...data, continuation: null } }
      const key = keyOf(scope, kind)
      remember(key, entry)
      persisted.write(key, entry)
      return true
    },
    /** Secciones de páginas extra del Inicio vistas en este alcance ([] si no hay). */
    getExtras(scope) {
      return extras.get(scope) ?? NO_SHELVES
    },
    /** Guarda las secciones extra del Inicio (ya combinadas); una lista vacía no borra lo anterior. */
    setExtras(scope, shelves) {
      if (!Array.isArray(shelves) || !shelves.length) return false
      extras.delete(scope)
      extras.set(scope, shelves)
      while (extras.size > MAX_MEMORY_ENTRIES) extras.delete(extras.keys().next().value)
      return true
    },
    /** Descarta Inicio y Explorar de un alcance (al vincular, desvincular o cambiar de cuenta). */
    clearScope(scope) {
      extras.delete(scope)
      for (const kind of LANDING_KINDS) {
        const key = keyOf(scope, kind)
        memory.delete(key)
        persisted.remove(key)
      }
    },
  }
}

export const landingCache = createLandingCache()

// Un Inicio ya cargado se conserva al ir a otra sección y volver mientras sea reciente. Los tokens de "más secciones"
// caducan en el servidor a los 5 min (home-extended): pasado este margen conviene pedir un Inicio nuevo.
export const LANDING_FRESH_MS = 4 * 60 * 1000

/**
 * ¿Se puede volver a un Inicio/Explorar sin pedirlo de nuevo? Sí si es la vista actual, tiene contenido real, no hay
 * un error pendiente y se cargó hace menos de `freshMs`. Así las secciones ya cargadas (incluidas las páginas extra
 * del Inicio) y su scroll no se vacían cada vez que se vuelve desde otra pantalla.
 */
export function shouldKeepLanding({ error = '', freshMs = LANDING_FRESH_MS, kind, loadedAt, now = Date.now(), view }) {
  if (!isLandingKind(kind) || view?.kind !== kind || isEmptyLanding(view.data) || error) return false
  return typeof loadedAt === 'number' && now - loadedAt >= 0 && now - loadedAt < freshMs
}

/**
 * Qué vista mostrar: la real si ya tiene contenido; si está vacía (el hook la vacía al navegar o llegó una
 * respuesta vacía) y hay copia guardada, la copia. `source` indica de dónde sale lo que se ve.
 */
export function pickLandingView(view, cached) {
  if (!isLandingKind(view.kind) || !isEmptyLanding(view.data) || !cached) return { view, source: 'live' }
  return { view: { kind: view.kind, data: cached.data }, source: cached.stale ? 'stale' : 'cache' }
}