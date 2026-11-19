// Reenviar a YouTube Music lo que el usuario marca en Mysic: "Me gusta" de canciones, álbumes guardados en la
// biblioteca y artistas seguidos (con su sesión vinculada). Así lo marcado en Mysic aparece en YouTube Music.
//
// PUT    /api/youtube/library/rating/song/:videoId     da Me gusta        (/like/like con target.videoId)
// DELETE /api/youtube/library/rating/song/:videoId     lo quita           (/like/removelike)
// PUT    /api/youtube/library/rating/album/:albumId    guarda el álbum    (/like/like con target.playlistId = OLAK5uy…)
// DELETE /api/youtube/library/rating/album/:albumId    lo quita de la biblioteca
// PUT    /api/youtube/library/rating/artist/:artistId  sigue al artista   (/subscription/subscribe)
// DELETE /api/youtube/library/rating/artist/:artistId  deja de seguirlo   (/subscription/unsubscribe)
//
// Es el mismo mecanismo que usa YouTube Music en la web (y ytmusicapi): rate_song, rate_playlist con el id de la lista
// de audio del álbum, y subscribe_artists con el canal. Fuera del código generado de src/youtube (que se regenera).
import { asyncRoute, requireYoutube, VIDEO_ID_RE } from './youtube/utils/http.mjs'
import { getYoutubeForUser, hasStoredBrowserAuth } from './youtube/youtube/accountLink.mjs'

const TIMEOUT_MS = 12_000
const BROWSE_ID = /^[A-Za-z0-9_-]{5,64}$/
const AUDIO_PLAYLIST = /[?&]list=((?:OLAK5uy|PL|RDAMPL)[A-Za-z0-9_-]+)/

const withTimeout = (promise, ms) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('YouTube Music tardó demasiado.'), { code: 'TIMEOUT' })), ms).unref?.()),
])

async function execute(youtube, endpoint, payload) {
  const response = await withTimeout(youtube.actions.execute(endpoint, { ...payload, client: 'YTMUSIC' }), TIMEOUT_MS)
  if (response?.success === false) throw Object.assign(new Error(`YouTube Music respondió HTTP ${response.status_code}`), { status: response.status_code })
  return response?.data ?? response
}

/** Cargas de cada acción. Puras: se prueban sin red. */
export const likePayload = (videoId) => ({ target: { videoId } })
export const playlistLikePayload = (playlistId) => ({ target: { playlistId } })
export const subscribePayload = (channelId) => ({ channelIds: [channelId] })

/** Id de la lista de audio (OLAK5uy…) de un álbum, a partir de su página (`url` de la microformat). */
export function audioPlaylistIdOf(album) {
  const fromUrl = AUDIO_PLAYLIST.exec(String(album?.url ?? ''))?.[1]
  return fromUrl ?? album?.header?.audio_playlist_id ?? album?.audio_playlist_id ?? null
}

/** Canal que sigue el botón "Suscribirse" de la página de un artista (puede no ser el id de navegación). */
export const channelIdOf = (artist) => artist?.header?.subscription_button?.channel_id ?? null

/** Rutas con dependencias inyectables (pruebas). `clientFor(req)` → cliente con sesión, o null. */
export function createLibraryRatingRoutes({ clientFor = (req) => getYoutubeForUser(req.mysicUser), hasAuth = (req) => hasStoredBrowserAuth(req.mysicUser), ready = requireYoutube } = {}) {
  const client = async (req, res) => {
    const youtube = await clientFor(req)
    if (youtube) return youtube
    if (await hasAuth(req)) {
      res.status(503).json({ code: 'YOUTUBE_SESSION_UNAVAILABLE', error: 'No se pudo conectar con YouTube Music ahora. Reintenta en unos segundos.' })
    } else {
      res.status(409).json({ code: 'YOUTUBE_NOT_LINKED', error: 'Vincula tu cuenta de YouTube Music para sincronizar tus favoritos.' })
    }
    return null
  }
  const failed = (res, error) => {
    const denied = [400, 401, 403, 404].includes(error.status)
    return res.status(denied ? 403 : error.code === 'TIMEOUT' ? 504 : 502).json({
      code: denied ? 'RATING_NOT_ALLOWED' : 'YOUTUBE_RATING_FAILED',
      error: denied ? 'YouTube Music no permitió ese cambio.' : 'YouTube Music no pudo guardar el cambio. Reintenta en unos segundos.',
    })
  }
  const route = (idPattern, badMessage, apply) => (on) => [
    ready,
    asyncRoute(async (req, res) => {
      res.setHeader('Cache-Control', 'no-store')
      const id = String(req.params.id || '')
      if (!idPattern.test(id)) return res.status(400).json({ code: 'BAD_REQUEST', error: badMessage })
      const youtube = await client(req, res)
      if (!youtube) return undefined
      try {
        await apply(youtube, id, on)
        return res.json({ ok: true, id, on })
      } catch (error) {
        console.warn(`No se pudo ${on ? 'marcar' : 'desmarcar'} en YouTube Music: ${error.message}`)
        if (error.code === 'NOT_FOUND') return res.status(404).json({ code: 'NOT_FOUND', error: 'No se encontró en YouTube Music.' })
        return failed(res, error)
      }
    }, 'No se pudo sincronizar el favorito'),
  ]

  const song = route(VIDEO_ID_RE, 'Canción no válida.', (youtube, id, on) => execute(youtube, on ? '/like/like' : '/like/removelike', likePayload(id)))
  const album = route(BROWSE_ID, 'Álbum no válido.', async (youtube, id, on) => {
    const playlistId = audioPlaylistIdOf(await withTimeout(youtube.music.getAlbum(id), TIMEOUT_MS))
    if (!playlistId) throw Object.assign(new Error('el álbum no tiene lista de audio'), { code: 'NOT_FOUND' })
    return execute(youtube, on ? '/like/like' : '/like/removelike', playlistLikePayload(playlistId))
  })
  const artist = route(BROWSE_ID, 'Artista no válido.', async (youtube, id, on) => {
    const channelId = channelIdOf(await withTimeout(youtube.music.getArtist(id), TIMEOUT_MS)) ?? (id.startsWith('UC') ? id : null)
    if (!channelId) throw Object.assign(new Error('el artista no tiene canal'), { code: 'NOT_FOUND' })
    return execute(youtube, on ? '/subscription/subscribe' : '/subscription/unsubscribe', subscribePayload(channelId))
  })

  return {
    albumOff: album(false),
    albumOn: album(true),
    artistOff: artist(false),
    artistOn: artist(true),
    songOff: song(false),
    songOn: song(true),
  }
}
