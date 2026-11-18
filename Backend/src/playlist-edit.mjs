// Guardar canciones en las playlists de YouTube Music del usuario (con su sesión vinculada).
//
// GET    /api/youtube/playlist/targets/:videoId      playlists que el usuario puede editar y si ya tienen la canción:
//                                                    { playlists: [{ id, title, contains, privacy }] }
// POST   /api/youtube/playlist/:id/videos  {videoId} añade la canción (sin duplicarla si ya estaba)
// DELETE /api/youtube/playlist/:id/videos/:videoId   la quita
//
// Usa lo mismo que el diálogo "Guardar en playlist" de YouTube Music: /playlist/get_add_to_playlist devuelve solo las
// playlists propias (no las guardadas de otros) con `containsSelectedVideos`, y /browse/edit_playlist las modifica.
// Fuera del código generado de src/youtube (que se regenera).
import { asyncRoute, requireYoutube, VIDEO_ID_RE } from './youtube/utils/http.mjs'
import { getYoutubeForUser, hasStoredBrowserAuth } from './youtube/youtube/accountLink.mjs'

export const PLAYLIST_ID_RE = /^[A-Za-z0-9_-]{2,64}$/
const EDIT_TIMEOUT_MS = 12_000

const textOf = (value) => value?.simpleText ?? value?.runs?.map((run) => run.text).join('') ?? ''
/** Las URLs de YouTube Music llevan el id de la playlist con prefijo VL; la API de edición lo quiere sin él. */
export const barePlaylistId = (id) => String(id).replace(/^VL(?=PL|OLAK|RD|LL)/, '')

/** Playlists del diálogo de YouTube (`playlistAddToOptionRenderer`, estén donde estén en la respuesta). */
export function parseAddToPlaylist(data) {
  const playlists = []
  const seen = new Set()
  const walk = (node, depth = 0) => {
    if (!node || typeof node !== 'object' || depth > 40) return
    if (Array.isArray(node)) {
      for (const child of node) walk(child, depth + 1)
      return
    }
    const option = node.playlistAddToOptionRenderer
    if (option?.playlistId && !seen.has(option.playlistId)) {
      seen.add(option.playlistId)
      playlists.push({
        id: option.playlistId,
        title: textOf(option.title) || 'Playlist sin título',
        contains: option.containsSelectedVideos === 'ALL',
        privacy: option.privacy ?? null,
      })
    }
    for (const key in node) if (key !== 'playlistAddToOptionRenderer') walk(node[key], depth + 1)
  }
  walk(data)
  return playlists
}

/** Cuerpo de /browse/edit_playlist para añadir (sin duplicar) o quitar una canción. */
export function editPayload(playlistId, videoId, add) {
  return {
    playlistId: barePlaylistId(playlistId),
    actions: [add
      ? { action: 'ACTION_ADD_VIDEO', addedVideoId: videoId, dedupeOption: 'DEDUPE_OPTION_SKIP' }
      : { action: 'ACTION_REMOVE_VIDEO_BY_VIDEO_ID', removedVideoId: videoId }],
  }
}

export const editSucceeded = (data) => data?.status === 'STATUS_SUCCEEDED'

const withTimeout = (promise, ms) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('YouTube Music tardó demasiado.'), { code: 'TIMEOUT' })), ms).unref?.()),
])

async function execute(youtube, endpoint, payload) {
  const response = await withTimeout(youtube.actions.execute(endpoint, { ...payload, client: 'YTMUSIC' }), EDIT_TIMEOUT_MS)
  if (response?.success === false) throw Object.assign(new Error(`YouTube Music respondió HTTP ${response.status_code}`), { status: response.status_code })
  return response?.data ?? response
}

/** Rutas con dependencias inyectables (pruebas). `clientFor(req)` → cliente con sesión, o null. */
export function createPlaylistEditRoutes({ clientFor = (req) => getYoutubeForUser(req.mysicUser), hasAuth = (req) => hasStoredBrowserAuth(req.mysicUser), ready = requireYoutube } = {}) {
  const client = async (req, res) => {
    const youtube = await clientFor(req)
    if (youtube) return youtube
    if (await hasAuth(req)) {
      res.status(503).json({ code: 'YOUTUBE_SESSION_UNAVAILABLE', error: 'No se pudo conectar con YouTube Music ahora. Reintenta en unos segundos.' })
    } else {
      res.status(409).json({ code: 'YOUTUBE_NOT_LINKED', error: 'Vincula tu cuenta de YouTube Music para guardar en tus playlists.' })
    }
    return null
  }
  const failed = (res, error) => {
    // 400/403/404 de YouTube: la playlist no es tuya o ya no existe.
    const denied = [400, 403, 404].includes(error.status)
    return res.status(denied ? 403 : error.code === 'TIMEOUT' ? 504 : 502).json({
      code: denied ? 'PLAYLIST_NOT_EDITABLE' : 'YOUTUBE_EDIT_FAILED',
      error: denied ? 'No puedes modificar esa playlist.' : 'YouTube Music no pudo guardar el cambio. Reintenta en unos segundos.',
    })
  }
  const edit = (add) => [
    ready,
    asyncRoute(async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      const playlistId = String(req.params.id || '')
      const videoId = String((add ? req.body?.videoId : req.params.videoId) || '')
      if (!PLAYLIST_ID_RE.test(playlistId) || !VIDEO_ID_RE.test(videoId)) return res.status(400).json({ code: 'BAD_REQUEST', error: 'Playlist o canción no válida.' })
      const youtube = await client(req, res)
      if (!youtube) return undefined
      try {
        const data = await execute(youtube, '/browse/edit_playlist', editPayload(playlistId, videoId, add))
        if (!editSucceeded(data)) return failed(res, { status: 403 })
        return res.json({ ok: true, playlistId, videoId, contains: add })
      } catch (error) {
        console.warn(`No se pudo ${add ? 'añadir a' : 'quitar de'} una playlist de YouTube Music: ${error.message}`)
        return failed(res, error)
      }
    }, 'No se pudo modificar la playlist'),
  ]

  return {
    targets: [
      ready,
      asyncRoute(async (req, res) => {
        res.setHeader('Cache-Control', 'private, no-store')
        const { videoId } = req.params
        if (!VIDEO_ID_RE.test(String(videoId || ''))) return res.status(400).json({ code: 'BAD_REQUEST', error: 'Canción no válida.' })
        const youtube = await client(req, res)
        if (!youtube) return undefined
        try {
          const data = await execute(youtube, '/playlist/get_add_to_playlist', { videoIds: [videoId], excludeWatchLater: true })
          return res.json({ playlists: parseAddToPlaylist(data) })
        } catch (error) {
          console.warn(`No se pudieron listar las playlists de YouTube Music: ${error.message}`)
          return res.status(error.code === 'TIMEOUT' ? 504 : 502).json({ code: 'YOUTUBE_TARGETS_FAILED', error: 'No se pudieron cargar tus playlists de YouTube Music.' })
        }
      }, 'No se pudieron cargar tus playlists'),
    ],
    add: edit(true),
    remove: edit(false),
  }
}
