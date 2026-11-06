// Inicio de YouTube Music con más secciones.
//
// La ruta generada (src/youtube/routes/browse.mjs) pide la primera página del inicio y UNA sola
// continuación, así que llegan unas 6-8 secciones; YouTube entrega 15-20 al seguir pidiendo páginas
// (así lo hace limusic). Este módulo sigue las continuaciones con un tope y tiempo máximo por página,
// reutilizando los mapeadores generados sin modificarlos. La ruta se monta antes que la generada.
import { asyncRoute, requireYoutube } from './youtube/utils/http.mjs'
import { getYoutubeForUser } from './youtube/youtube/accountLink.mjs'
import { enrichShelfAlbums, mapShelf, mergeHomeShelves } from './youtube/youtube/browse.mjs'
import { getYoutube } from './youtube/youtube/client.mjs'
import { plainText } from './youtube/youtube/mappers.mjs'

export const MAX_CONTINUATIONS = 5
const PAGE_TIMEOUT_MS = 8000
// Buscar el álbum de cada canción suelta cuesta una petición por canción; solo se hace en las primeras secciones.
const ENRICH_FIRST_SHELVES = 4

const mapSections = (sections) => (sections || []).map(mapShelf).filter(Boolean)

function withTimeout(promise, ms) {
  let timer
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('tiempo de espera agotado')), ms) })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/** Sigue las continuaciones del inicio hasta `maxContinuations`; un fallo o un tiempo agotado detiene el recorrido sin perder lo ya cargado. */
export async function loadExtendedHome(youtube, { enrich = enrichShelfAlbums, maxContinuations = MAX_CONTINUATIONS, pageTimeoutMs = PAGE_TIMEOUT_MS } = {}) {
  const home = await youtube.music.getHomeFeed()
  let shelves = mapSections(home.sections)

  let page = home
  for (let followed = 0; followed < maxContinuations && page?.has_continuation; followed += 1) {
    try {
      page = await withTimeout(page.getContinuation(), pageTimeoutMs)
      shelves = mergeHomeShelves(shelves, mapSections(page.sections))
    } catch (error) {
      console.warn(`No se pudo ampliar el Inicio de YouTube Music: ${error.message}`)
      break
    }
  }

  await enrich(shelves.slice(0, ENRICH_FIRST_SHELVES), youtube)
  return {
    personalized: Boolean(youtube.session?.cookie),
    filters: (home.filters || []).map(plainText).filter(Boolean),
    shelves,
  }
}

/** Manejador de GET /api/youtube/home con el recorrido ampliado. */
export function createExtendedHomeHandler() {
  return [
    requireYoutube,
    asyncRoute(async (req, res) => {
      res.setHeader('Cache-Control', 'private, no-store')
      const youtube = await getYoutubeForUser(req.mysicUser) ?? getYoutube()
      res.json(await loadExtendedHome(youtube))
    }, 'No se pudo cargar tu inicio de YouTube Music'),
  ]
}
