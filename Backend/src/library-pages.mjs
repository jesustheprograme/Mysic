// Biblioteca de YouTube Music por páginas (mismo patrón que el Inicio progresivo).
//
// GET /api/youtube/library/overview          primera página de las seis categorías, en paralelo y acotadas en tiempo.
//                                            Un fallo en una categoría no tumba las demás (errors lo indica).
// GET /api/youtube/library/:kind[?cursor=]   primera página de una categoría, o la siguiente con el cursor.
//
//   kind: playlists | liked-songs | albums | artists | subscriptions | uploads
//   respuesta de página: { items, continuation, hasMore }  (continuation es un cursor opaco o null)
//
// Los cursores viven en memoria con TTL y límite, son del usuario que los pidió y repetir uno devuelve el
// mismo resultado sin volver a consultar a YouTube. /api/youtube/library (todo junto) sigue existiendo.
import { randomBytes } from 'node:crypto'
import { createInflight, withTimeout } from './home-extended.mjs'
import { asyncRoute, requireYoutube } from './youtube/utils/http.mjs'
import { getYoutubeForUser, hasStoredBrowserAuth } from './youtube/youtube/accountLink.mjs'
import { libraryPlaylistsPage, likedSongsPage } from './youtube/youtube/browse.mjs'
import { continuationToken, LIBRARY_BROWSE_IDS, parseLibraryPage } from './youtube/youtube/library.mjs'

export const PAGE_TIMEOUT_MS = 12_000
export const OVERVIEW_TIMEOUT_MS = 10_000
export const CURSOR_TTL_MS = 5 * 60 * 1000
export const MAX_CURSORS = 400

// Categoría de la URL -> campo de la respuesta y cómo pedir una página. `state` es lo que `next` devolvió antes.
function extendedPage(field, kind) {
  return async (youtube, state) => {
    const payload = state ? { continuation: state.token, client: 'YTMUSIC' } : { browseId: LIBRARY_BROWSE_IDS[field], client: 'YTMUSIC' }
    const page = await youtube.actions.execute('/browse', payload)
    if (page?.success === false) throw new Error(`YouTube Music respondió HTTP ${page.status_code ?? 'desconocido'}`)
    const items = parseLibraryPage(page, kind)
    const token = continuationToken(page)
    const seen = state?.seen ?? new Set()
    // Una página vacía o un token repetido cortan la cadena (YouTube puede devolver el mismo token en bucle).
    return { items, next: items.length && token && !seen.has(token) ? { token, seen: new Set([...seen, token]) } : null }
  }
}

export const LIBRARY_SECTIONS = {
  playlists: { field: 'playlists', page: libraryPlaylistsPage },
  'liked-songs': { field: 'likedSongs', page: likedSongsPage },
  albums: { field: 'albums', page: extendedPage('albums', 'album') },
  artists: { field: 'artists', page: extendedPage('artists', 'artist') },
  subscriptions: { field: 'subscriptions', page: extendedPage('subscriptions', 'artist') },
  uploads: { field: 'uploads', page: extendedPage('uploads', 'upload') },
}
export const isLibraryKind = (kind) => Object.hasOwn(LIBRARY_SECTIONS, kind)

/** Cursores pendientes por usuario y categoría. Acotado en tiempo y cantidad; solo su dueño puede usarlos. */
export function createLibraryCursors({ ttlMs = CURSOR_TTL_MS, max = MAX_CURSORS, now = Date.now } = {}) {
  const cursors = new Map()
  const versions = new Map()
  const prune = () => {
    const current = now()
    for (const [token, entry] of cursors) if (entry.expiresAt <= current) cursors.delete(token)
    while (cursors.size > max) cursors.delete(cursors.keys().next().value)
  }
  return {
    put(userId, kind, state, version = versions.get(String(userId)) ?? 'initial') {
      if (!state) return null
      const token = randomBytes(18).toString('base64url')
      cursors.set(token, { userId: String(userId), kind, state, version, expiresAt: now() + ttlMs, result: null })
      prune()
      return token
    },
    take(userId, kind, token, version = versions.get(String(userId)) ?? 'initial') {
      const entry = cursors.get(token)
      return entry && entry.expiresAt > now() && entry.userId === String(userId) && entry.kind === kind && entry.version === version ? entry : null
    },
    clearUser(userId) {
      const key = String(userId)
      for (const [token, entry] of cursors) if (entry.userId === key) cursors.delete(token)
      // También invalida páginas que ya estaban en vuelo y podrían crear un cursor después del borrado.
      versions.set(key, randomBytes(12).toString('base64url'))
    },
    version(userId) { return versions.get(String(userId)) ?? 'initial' },
    get size() { return cursors.size },
  }
}

const expired = () => Object.assign(new Error('Este cursor de la biblioteca ya no está disponible.'), { code: 'CURSOR_EXPIRED' })

/** Primera página (sin cursor) o siguiente (con cursor) de una categoría. */
export async function loadLibraryPage(kind, youtube, { cursor, cursors, timeoutMs = PAGE_TIMEOUT_MS, userId = 'anon', version = cursors.version?.(userId) ?? 'initial' } = {}) {
  const section = LIBRARY_SECTIONS[kind]
  const toResponse = ({ items, next }) => {
    const continuation = cursors.put(userId, kind, next, version)
    return { items, continuation, hasMore: Boolean(continuation) }
  }
  const fetchPage = (state) => withTimeout(section.page(youtube, state), timeoutMs, 'LIBRARY_TIMEOUT', 'YouTube Music tardó demasiado en responder.')

  if (!cursor) return toResponse(await fetchPage(null))

  const entry = cursors.take(userId, kind, cursor, version)
  if (!entry) throw expired()
  if (!entry.result) {
    entry.result = fetchPage(entry.state).then(toResponse).catch((error) => {
      entry.result = null // un fallo permite reintentar con el mismo cursor
      throw error
    })
  }
  return entry.result
}

/** Primera página de todas las categorías a la vez. Falla solo si fallan todas. */
export async function loadLibraryOverview(youtube, { cursors, timeoutMs = OVERVIEW_TIMEOUT_MS, userId = 'anon', version = cursors.version?.(userId) ?? 'initial' } = {}) {
  const kinds = Object.keys(LIBRARY_SECTIONS)
  const settled = await Promise.allSettled(kinds.map((kind) => loadLibraryPage(kind, youtube, { cursors, timeoutMs, userId, version })))
  const sections = {}
  const errors = []
  settled.forEach((result, index) => {
    const kind = kinds[index]
    const field = LIBRARY_SECTIONS[kind].field
    if (result.status === 'fulfilled') {
      sections[field] = result.value
      return
    }
    errors.push(kind)
    sections[field] = { items: [], continuation: null, hasMore: false, error: result.reason?.code ?? 'LIBRARY_PAGE_FAILED' }
    console.warn(`No se pudo cargar ${kind} de la biblioteca de YouTube Music: ${result.reason?.message || result.reason}`)
  })
  if (errors.length === kinds.length) {
    throw Object.assign(new Error('YouTube Music no entregó ninguna parte de tu biblioteca.'), { code: settled[0].reason?.code ?? 'LIBRARY_PAGE_FAILED' })
  }
  return { sections, errors }
}

const userIdOf = (req) => req.mysicUser?._id?.toString() ?? 'anon'
const unavailable = (res) => res.status(503).json({
  code: 'YOUTUBE_SESSION_UNAVAILABLE',
  error: 'No se pudo conectar con YouTube Music ahora. Tu sesión sigue guardada; reintenta en unos segundos.',
})

// Sin sesión no hay biblioteca (409); con sesión guardada pero sin poder crear el cliente es transitorio (503).
async function clientOr(res, req) {
  const youtube = await getYoutubeForUser(req.mysicUser)
  if (youtube) return youtube
  if (await hasStoredBrowserAuth(req.mysicUser)) unavailable(res)
  else res.status(409).json({ error: 'Conecta una sesión de YouTube Music antes de sincronizar tu biblioteca.' })
  return null
}

const failure = (res, error) => {
  const status = error.code === 'CURSOR_EXPIRED' ? 410 : error.code === 'LIBRARY_TIMEOUT' ? 504 : 502
  const message = error.code === 'CURSOR_EXPIRED' ? error.message : 'No se pudo cargar esta parte de tu biblioteca de YouTube Music.'
  return res.status(status).json({ code: error.code ?? 'LIBRARY_PAGE_FAILED', error: message })
}

/** GET /api/youtube/library/overview */
export function createLibraryOverviewHandler({ cursors = defaultCursors, inflight = defaultInflight } = {}) {
  return [
    requireYoutube,
    asyncRoute(async (req, res) => {
      res.setHeader('Cache-Control', 'private, no-store')
      const youtube = await clientOr(res, req)
      if (!youtube) return undefined
      const userId = userIdOf(req)
      const version = cursors.version?.(userId) ?? 'initial'
      try {
        return res.json(await inflight(`${userId}:${version}:library-overview`, () => loadLibraryOverview(youtube, { cursors, userId, version })))
      } catch (error) {
        return failure(res, error)
      }
    }, 'No se pudo cargar tu biblioteca de YouTube Music'),
  ]
}

/** GET /api/youtube/library/:kind[?cursor=] */
export function createLibrarySectionHandler({ cursors = defaultCursors, inflight = defaultInflight } = {}) {
  return [
    requireYoutube,
    asyncRoute(async (req, res) => {
      res.setHeader('Cache-Control', 'private, no-store')
      const { kind } = req.params
      if (!isLibraryKind(kind)) return res.status(400).json({ code: 'UNKNOWN_SECTION', error: 'Categoría de biblioteca no válida.' })
      const youtube = await clientOr(res, req)
      if (!youtube) return undefined
      const userId = userIdOf(req)
      const version = cursors.version?.(userId) ?? 'initial'
      const cursor = typeof req.query.cursor === 'string' && req.query.cursor ? req.query.cursor : undefined
      try {
        return res.json(await inflight(`${userId}:${version}:library:${kind}:${cursor ?? 'first'}`, () => loadLibraryPage(kind, youtube, { cursor, cursors, userId, version })))
      } catch (error) {
        return failure(res, error)
      }
    }, 'No se pudo cargar tu biblioteca de YouTube Music'),
  ]
}

const defaultCursors = createLibraryCursors()
const defaultInflight = createInflight()

/** Descarta los cursores de un usuario (al vincular, desvincular o cambiar de cuenta). */
export function invalidateLibraryPages(userId) {
  if (userId != null) defaultCursors.clearUser(userId)
}
