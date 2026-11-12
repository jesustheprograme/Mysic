// Inicio de YouTube Music, progresivo (como limusic: primera página rápida y el resto bajo demanda).
//
// GET /api/youtube/home        primera página útil ya mapeada + `continuation` (token opaco) si hay más.
//                              No espera a las continuaciones ni a buscar los álbumes de las canciones.
// GET /api/youtube/home/more   `?token=` -> siguiente página y un token nuevo. Idempotente por token.
//
// La página de youtubei.js (con su continuación) no se puede serializar, así que se guarda en memoria con un
// token por usuario: TTL y límite acotados, y solo su dueño puede usarlo. Se reutilizan los mapeadores generados
// sin modificarlos. Las rutas se montan antes que las generadas (ver server.js).
import { randomBytes } from 'node:crypto'
import { asyncRoute, requireYoutube } from './youtube/utils/http.mjs'
import { getYoutubeForUser, hasStoredBrowserAuth } from './youtube/youtube/accountLink.mjs'
import { enrichShelfAlbums, mapShelf } from './youtube/youtube/browse.mjs'
import { getYoutube } from './youtube/youtube/client.mjs'
import { plainText } from './youtube/youtube/mappers.mjs'

export const FIRST_PAGE_TIMEOUT_MS = 15_000
export const MORE_PAGE_TIMEOUT_MS = 8_000
export const SESSION_TTL_MS = 5 * 60 * 1000
export const MAX_SESSIONS = 200
// Buscar el álbum de cada canción suelta cuesta una petición por canción: solo en las primeras secciones y después de responder.
const ENRICH_FIRST_SHELVES = 4

const mapSections = (sections) => (sections || []).map(mapShelf).filter(Boolean)

export function withTimeout(promise, ms, code, message) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error(message), { code })), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/** Páginas pendientes de seguir, por usuario y token. Acotado en tiempo y en cantidad. */
export function createHomeSessions({ ttlMs = SESSION_TTL_MS, max = MAX_SESSIONS, now = Date.now } = {}) {
  const sessions = new Map()

  function prune() {
    const current = now()
    for (const [token, entry] of sessions) if (entry.expiresAt <= current) sessions.delete(token)
    while (sessions.size > max) sessions.delete(sessions.keys().next().value)
  }

  return {
    /** Guarda la página y devuelve su token, o null si no tiene continuación. */
    create(userId, page) {
      if (!page?.has_continuation) return null
      const token = randomBytes(18).toString('base64url')
      sessions.set(token, { userId: String(userId), page, expiresAt: now() + ttlMs, result: null })
      prune()
      return token
    },
    /** Solo el dueño puede usar un token vigente. */
    take(userId, token) {
      const entry = sessions.get(token)
      if (!entry || entry.expiresAt <= now() || entry.userId !== String(userId)) return null
      return entry
    },
    /** Descarta todos los tokens de un usuario (al vincular, desvincular o cambiar de cuenta). */
    clearUser(userId) {
      for (const [token, entry] of sessions) if (entry.userId === String(userId)) sessions.delete(token)
    },
    get size() { return sessions.size },
  }
}

/** Una sola carga por clave a la vez: las peticiones idénticas simultáneas comparten el resultado. */
export function createInflight() {
  const pending = new Map()
  return (key, load) => {
    const running = pending.get(key)
    if (running) return running
    const promise = Promise.resolve().then(load).finally(() => pending.delete(key))
    pending.set(key, promise)
    return promise
  }
}

const defaultSchedule = (task) => setImmediate(() => { Promise.resolve().then(task).catch((error) => console.warn(`No se pudo completar el Inicio en segundo plano: ${error.message}`)) })

/**
 * Primera página del Inicio. Responde en cuanto llega; las continuaciones quedan tras un token y el
 * enriquecimiento de álbumes se hace después, mutando las mismas secciones (la copia en caché ya lo incluye).
 */
export async function loadHomeFirstPage(youtube, { enrich = enrichShelfAlbums, schedule = defaultSchedule, sessions, timeoutMs = FIRST_PAGE_TIMEOUT_MS, userId = 'anon' } = {}) {
  const home = await withTimeout(youtube.music.getHomeFeed(), timeoutMs, 'HOME_TIMEOUT', 'YouTube Music tardó demasiado en responder.')
  const shelves = mapSections(home.sections)
  schedule(() => enrich(shelves.slice(0, ENRICH_FIRST_SHELVES), youtube))
  return {
    personalized: Boolean(youtube.session?.cookie),
    filters: (home.filters || []).map(plainText).filter(Boolean),
    shelves,
    continuation: sessions ? sessions.create(userId, home) : null,
  }
}

/** Siguiente página del Inicio. Repetir el mismo token devuelve el mismo resultado sin volver a pedirlo a YouTube. */
export function loadHomeMore(entry, { sessions, timeoutMs = MORE_PAGE_TIMEOUT_MS } = {}) {
  if (!entry.result) {
    entry.result = (async () => {
      const page = await withTimeout(entry.page.getContinuation(), timeoutMs, 'HOME_TIMEOUT', 'YouTube Music tardó demasiado en responder.')
      return { shelves: mapSections(page.sections), continuation: sessions.create(entry.userId, page) }
    })().catch((error) => {
      entry.result = null // un fallo permite reintentar con el mismo token
      throw error
    })
  }
  return entry.result
}

const userIdOf = (req) => req.mysicUser?._id?.toString() ?? 'anon'
const unavailable = (res) => res.status(503).json({
  code: 'YOUTUBE_SESSION_UNAVAILABLE',
  error: 'No se pudo conectar con YouTube Music ahora. Tu sesión sigue guardada; reintenta en unos segundos.',
})

/** GET /api/youtube/home (primera página). */
export function createExtendedHomeHandler({ sessions = defaultSessions, inflight = defaultInflight } = {}) {
  return [
    requireYoutube,
    asyncRoute(async (req, res) => {
      res.setHeader('Cache-Control', 'private, no-store')
      const youtube = await getYoutubeForUser(req.mysicUser)
      // Con una sesión guardada pero sin poder crear el cliente (red caída) no se sirve un Inicio anónimo como si fuera el suyo.
      if (!youtube && await hasStoredBrowserAuth(req.mysicUser)) return unavailable(res)
      const userId = userIdOf(req)
      try {
        res.json(await inflight(`${userId}:home`, () => loadHomeFirstPage(youtube ?? getYoutube(), { sessions, userId })))
      } catch (error) {
        if (error.code === 'HOME_TIMEOUT') return res.status(504).json({ code: error.code, error: error.message })
        throw error
      }
    }, 'No se pudo cargar tu inicio de YouTube Music'),
  ]
}

/** GET /api/youtube/home/more?token= (siguientes páginas). */
export function createHomeMoreHandler({ sessions = defaultSessions } = {}) {
  return [
    requireYoutube,
    asyncRoute(async (req, res) => {
      res.setHeader('Cache-Control', 'private, no-store')
      const entry = sessions.take(userIdOf(req), String(req.query.token ?? ''))
      if (!entry) return res.status(410).json({ code: 'CONTINUATION_EXPIRED', error: 'Esta página del Inicio ya no está disponible. Vuelve a cargar el Inicio.' })
      try {
        res.json(await loadHomeMore(entry, { sessions }))
      } catch (error) {
        const status = error.code === 'HOME_TIMEOUT' ? 504 : 502
        res.status(status).json({ code: error.code ?? 'HOME_MORE_FAILED', error: 'No se pudieron cargar más secciones del Inicio.' })
      }
    }, 'No se pudo cargar más del inicio de YouTube Music'),
  ]
}

const defaultSessions = createHomeSessions()
const defaultInflight = createInflight()

/** Invalida las páginas pendientes del Inicio de un usuario. */
export function invalidateHomeSessions(userId) {
  if (userId != null) defaultSessions.clearUser(userId)
}