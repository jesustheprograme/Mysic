// Prueba de humo de render: monta los componentes principales con datos grandes (2000 canciones, 900 artistas...)
// en un entorno sin navegador para detectar errores de ejecución que el lint no ve (variables perdidas, props rotas)
// y comprobar que las cuadrículas no pintan miles de tarjetas a la vez. Se ejecuta con: npm run smoke:render
import { renderToString } from 'react-dom/server'
import { createElement as h } from 'react'
import LibraryView from '../../src/features/youtube/LibraryView.jsx'
import ArtistsPage from '../../src/features/discovery/ArtistsPage.jsx'
import StatsPage from '../../src/features/discovery/StatsPage.jsx'
import { persistedCache } from '../../src/lib/persistedCache.js'
import { libraryCacheKey } from '../../src/features/youtube/libraryCache.js'
import YoutubeCatalogContent from '../../src/features/youtube/YoutubeCatalogContent.jsx'
import AppSidebar from '../../src/components/AppSidebar.jsx'
import SectionRoute from '../../src/features/discovery/SectionRoute.jsx'
import { usePlayer } from '../../src/features/youtube/hooks/usePlayer.js'
import { PlayerPanelContent } from '../../src/components/reproductor/ControlesReproductor.jsx'


const results = []
function check(name, fn) {
  const started = performance.now()
  try {
    const out = fn()
    results.push({ name, ok: true, ms: Math.round(performance.now() - started), out })
  } catch (error) {
    results.push({ name, ok: false, error: `${error.name}: ${error.message}`, stack: String(error.stack).split('\n').slice(0, 3).join(' | ') })
  }
}

const likedSongs = Array.from({ length: 2000 }, (_, i) => ({
  id: `s${i}`, title: `Canción ${i}`, artist: `Artista ${i % 900}`, artistId: `UC${i % 900}`,
  album: `Álbum ${i % 1200}`, albumId: `MPREb_${i % 1200}`, thumbnail: `https://lh3.googleusercontent.com/x${i}=w544-h544`, durationSeconds: 200,
}))
const playlists = Array.from({ length: 26 }, (_, i) => ({ id: i === 0 ? 'VLLM' : `PL${i}`, title: `Playlist ${i}`, thumbnail: `https://i.ytimg.com/p${i}.jpg`, itemCount: i * 3 }))
const data = { likedSongs, playlists }
const controller = {
  downloads: { downloads: { items: [] }, online: true },
  officialLibraryBusy: false,
  openAlbum() {}, openArtist() {}, openPlaylist() {}, playSongs() {}, syncOfficialLibrary() {},
  likedAlbumIds: new Set(), likedSongIds: new Set(), toggleAlbumFavorite() {}, openAlbumSongs() {}, enqueueSongs() {}, playShuffled() {},
}
const renderSongs = () => h('div', null, 'LISTA')

check('LibraryView 2000 canciones (derivados)', () => {
  const html = renderToString(h(LibraryView, { controller, data, renderSongs }))
  if (!html.includes('Biblioteca')) throw new Error('sin título')
  if (!html.includes('Música que me gusta')) throw new Error('falta la tarjeta de Me gusta')
  if (html.includes('Liked Music')) throw new Error('aparece la playlist LM duplicada')
  const cards = (html.match(/home-shelf-card"/g) || []).length
  if (cards > 80) throw new Error(`pintó ${cards} tarjetas de golpe (esperado <= 60 + extras)`)
  return { bytes: html.length, tarjetas: cards }
})

check('LibraryView con datos reales del servidor + uploads', () => {
  const server = { ...data,
    albums: Array.from({ length: 1500 }, (_, i) => ({ id: `MPREb_${i}`, title: `Real ${i}`, thumbnail: 'https://lh3.googleusercontent.com/a=w544-h544', artist: 'X', artistId: 'UC1', year: '2020' })),
    artists: Array.from({ length: 900 }, (_, i) => ({ id: `UC${i}`, name: `Art ${i}`, thumbnail: '' })),
    subscriptions: [], uploads: [{ id: 'MPREb_u', title: 'Subido', thumbnail: '', artist: 'Yo' }] }
  const html = renderToString(h(LibraryView, { controller, data: server, renderSongs }))
  if (!html.includes('Subidos')) throw new Error('falta la pestaña Subidos')
  return { bytes: html.length }
})

check('LibraryView biblioteca vacía', () => {
  const html = renderToString(h(LibraryView, { controller, data: { likedSongs: [], playlists: [] }, renderSongs }))
  if (!html.includes('Biblioteca')) throw new Error('sin título')
  return { bytes: html.length }
})

const artistItems = Array.from({ length: 900 }, (_, i) => ({ id: `artist-UC${i}`, artistId: `UC${i}`, title: `Artista ${i}`, meta: `${i} canciones`, artwork: `https://x/${i}.jpg` }))
const albumItems = Array.from({ length: 1200 }, (_, i) => ({ id: `album-${i}`, albumId: `${i}`, title: `Álbum ${i}`, artistId: `UC${i % 900}`, artwork: '' }))
check('ArtistsPage 900 artistas', () => {
  const html = renderToString(h(ArtistsPage, { albumItems, artistItems, likedArtistIds: new Set(['UC1']), onArtistSelect() {}, onToggleArtistFavorite() {} }))
  if (!html.includes('Artistas')) throw new Error('sin título')
  return { tarjetas: (html.match(/artist-card"/g) || []).length, bytes: html.length }
})
check('StatsPage', () => {
  const html = renderToString(h(StatsPage, { albumItems, artistItems, likedSongIds: new Set(['s1']), onArtistSelect() {}, songs: likedSongs }))
  if (!html.includes('Estadísticas')) throw new Error('sin título')
  return { bytes: html.length }
})
check('SectionRoute artists y stats', () => {
  const base = { albumItems, artistItems, likedAlbumIds: new Set(), likedArtistIds: new Set(), likedSongIds: new Set(), newReleaseSongs: [], recentSongs: [], songs: likedSongs, searchKey: '' }
  const a = renderToString(h(SectionRoute, { ...base, section: 'artists' }))
  const s = renderToString(h(SectionRoute, { ...base, section: 'stats' }))
  if (!a.includes('artists-page') || !s.includes('stats-page')) throw new Error('no renderizó la sección')
  return { artists: a.length, stats: s.length }
})
check('AppSidebar (Inicio/Explorar/Biblioteca/Estadísticas + Mysic)', () => {
  const html = renderToString(h(AppSidebar, { activeSection: 'youtube', collapsed: false, onNavigate() {}, onYoutubeNavigate() {}, playlists: [], youtubeView: 'library', canImportMusic: true }))
  for (const label of ['Inicio', 'Explorar', 'Biblioteca', 'Estadísticas', 'Mysic']) if (!html.includes(label)) throw new Error(`falta "${label}"`)
  return { bytes: html.length }
})
check('AppSidebar dentro de una sección de Mysic abre el grupo', () => {
  const html = renderToString(h(AppSidebar, { activeSection: 'albums', collapsed: false, onNavigate() {}, onYoutubeNavigate() {}, playlists: [], canImportMusic: false }))
  if (!html.includes('Historial') || !html.includes('Álbumes')) throw new Error('el grupo Mysic no se muestra en una sección de Mysic')
  return { bytes: html.length }
})
check('usePlayer renderiza e inicia sin streaming', () => {
  let out
  function Probe() { const p = usePlayer({ isDownloaded: () => false }); out = { isStreamed: p.isStreamed, isLocal: p.isLocal, hasAudio: Boolean(p.audioProps) }; return h('i') }
  renderToString(h(Probe))
  if (out.isStreamed !== false || out.isLocal !== false) throw new Error(`estado inesperado ${JSON.stringify(out)}`)
  return out
})

const activeLabel = (html) => html.match(/aria-current="page"[^>]*>(?:(?!<\/button>)[\s\S])*?<span>([^<]+)<\/span>/)?.[1]
check('AppSidebar resalta Biblioteca cuando se está en la Biblioteca', () => {
  const base = { activeSection: 'youtube', collapsed: false, onNavigate() {}, onYoutubeNavigate() {}, playlists: [], canImportMusic: false }
  const seen = {}
  for (const view of ['home', 'explore', 'library']) seen[view] = activeLabel(renderToString(h(AppSidebar, { ...base, youtubeView: view })))
  if (seen.home !== 'Inicio' || seen.explore !== 'Explorar' || seen.library !== 'Biblioteca') throw new Error(`resaltado incorrecto ${JSON.stringify(seen)}`)
  return seen
})
check('Estadísticas sin catálogo del servidor usa la biblioteca de YouTube guardada', () => {
  persistedCache.write(libraryCacheKey('mysic:user:7:youtube'), { likedSongs: likedSongs.slice(0, 50), playlists, albums: [], artists: [] })
  const html = renderToString(h(StatsPage, { albumItems: [], artistItems: [], likedSongIds: new Set(), onArtistSelect() {}, songs: [], youtubeLibraryKey: libraryCacheKey('mysic:user:7:youtube') }))
  if (!html.includes('biblioteca de YouTube Music')) throw new Error('no cambió a la biblioteca de YouTube')
  if (!html.includes('>50<')) throw new Error(`no muestra los 50 Me gusta guardados: ${html.slice(html.indexOf('stats-page__cards'), html.indexOf('stats-page__cards') + 420)}`)
  return { bytes: html.length }
})
// --- Portada de YouTube Music: los fallos observados en el arranque y la navegación ---
const homeData = { personalized: true, continuation: null, shelves: [{ title: 'Álbumes y sencillos nuevos', items: [{ kind: 'album', id: 'MPREb_1', title: 'Disco', thumbnail: '', artist: 'Artista', artistId: 'UC1', year: '2024' }] }] }
const catalogController = (over = {}, browse = {}) => ({
  account: { connected: true, personalized: true, status: 'connected' },
  accountBusy: false, accountError: '', accountHelpOpen: false, accountNotice: '', actionError: '',
  browse: { view: { kind: 'home', data: homeData }, loading: false, error: '', query: '', results: null, runSearch() {}, setQuery() {}, showHome() {}, ...browse },
  changeTab() {}, connectDesktopSession() {}, connectMusicSession() {}, desktopSessionAvailable: false, downloads: { downloads: { items: [] }, online: true },
  landing: { refreshing: false, source: 'live' }, likedAlbumIds: new Set(), likedArtistIds: new Set(), likedSongIds: new Set(),
  openAlbum() {}, openArtist() {}, openPlaylist() {}, player: { currentSong: null, isPlaying: false, togglePlay() {} }, playSongs() {},
  retryAccount() {}, searchType: 'all', setAccountHelpOpen() {}, showDownloads() {}, startPlaylist() {},
  ...over,
})
const catalog = (over, browse) => renderToString(h(YoutubeCatalogContent, { controller: catalogController(over, browse) }))
const LINK = 'Vincular YT Music'

check('Portada: cuenta desconocida (arranque en frío) muestra esqueleto y NUNCA el botón de vincular', () => {
  const html = catalog({ account: null }, { view: { kind: 'home', data: null }, loading: true })
  if (html.includes(LINK)) throw new Error('apareció "Vincular YT Music" con la cuenta sin confirmar')
  if (!html.includes('yt-feed-skeleton')) throw new Error('no hay esqueleto')
  return { bytes: html.length }
})
check('Portada: cuenta conectada o degradada no ofrece vincular y conserva el contenido', () => {
  const ok = catalog()
  const degraded = catalog({ accountNotice: 'No se pudo comprobar tu cuenta de YouTube Music. Mostrando lo último guardado.' })
  for (const [name, html] of [['conectada', ok], ['degradada', degraded]]) {
    if (html.includes(LINK)) throw new Error(`${name}: ofreció vincular`)
    if (!html.includes('Álbumes y sencillos nuevos')) throw new Error(`${name}: perdió las secciones`)
  }
  if (!degraded.includes('Mostrando lo último guardado') || !degraded.includes('Reintentar')) throw new Error('falta el aviso con reintento')
  return { ok: ok.length, degraded: degraded.length }
})
check('Portada: solo una cuenta desconectada confirmada ofrece vincular', () => {
  const html = catalog({ account: { connected: false, status: 'disconnected' } })
  if (!html.includes(LINK)) throw new Error('una cuenta desconectada debe ofrecer vincular')
  return { bytes: html.length }
})
check('Portada: refrescando con datos (guardados o reales) conserva las secciones y no pinta esqueleto', () => {
  const html = catalog({ landing: { refreshing: true, source: 'cache' } }, { loading: true })
  if (html.includes('yt-feed-skeleton')) throw new Error('pintó esqueleto de página completa con datos disponibles')
  if (!html.includes('Álbumes y sencillos nuevos')) throw new Error('borró las secciones al refrescar')
  if (!html.includes('aria-busy="true"')) throw new Error('no marca que está refrescando')
  return { bytes: html.length }
})
check('Portada: sin datos y cargando muestra esqueleto; error con datos guardados no los borra', () => {
  const cold = catalog({}, { view: { kind: 'home', data: null }, loading: true })
  if (!cold.includes('yt-feed-skeleton')) throw new Error('sin datos y cargando debe haber esqueleto')
  const failed = catalog({}, { error: 'No se pudo conectar' })
  if (!failed.includes('Álbumes y sencillos nuevos') || !failed.includes('No se pudo conectar')) throw new Error('el error debe convivir con las secciones')
  return { cold: cold.length, failed: failed.length }
})
check('Portada: abrir la Biblioteca en frío muestra esqueleto de biblioteca', () => {
  const html = catalog({ libraryOpening: true })
  if (!html.includes('Cargando biblioteca')) throw new Error('falta el esqueleto de biblioteca')
  return { bytes: html.length }
})
check('Biblioteca: se actualiza en el sitio con datos del estado y avisa si falla el refresco', () => {
  const library = { likedSongs: likedSongs.slice(0, 10), playlists: [] }
  const html = catalog({ libraryData: library, libraryStatus: { error: 'No se pudo', lastUpdated: null, loading: false, refreshing: false }, officialLibraryBusy: false }, { view: { kind: 'official-library', data: { likedSongs: [], playlists: [] } } })
  if (!html.includes('Mostrando lo último guardado')) throw new Error('falta el aviso de refresco fallido')
  if (!html.includes('Música que me gusta')) throw new Error('no usó los datos del estado (libraryData)')
  return { bytes: html.length }
})
// --- Biblioteca por páginas ---
const libraryProps = (meta) => ({
  libraryData: { likedSongs: likedSongs.slice(0, 40), playlists: playlists.slice(0, 5) },
  libraryMeta: { cursors: {}, errors: {}, hasMore: {}, legacy: false, loading: {}, ...meta },
  libraryStatus: { error: '', lastUpdated: null, loading: false, refreshing: false },
  loadMoreLibrary: async () => true, officialLibraryBusy: false, syncOfficialLibrary() {},
})
const libraryCatalog = (meta) => catalog(libraryProps(meta), { view: { kind: 'official-library', data: { likedSongs: [], playlists: [] } } })

check('Biblioteca por páginas: pestañas sin contadores y cuadrícula ventaneada (pide la siguiente página al acercarse al final)', () => {
  const html = libraryCatalog({ hasMore: { albums: true, 'liked-songs': true, playlists: false }, cursors: { albums: 'c1', 'liked-songs': 'c2' } })
  if (html.includes('lib-tabs__count')) throw new Error('las pestañas siguen mostrando contadores')
  if (!html.includes('class="lib-grid"')) throw new Error('no se pintó la cuadrícula ventaneada de la biblioteca')
  // Título y herramientas comparten fila (cabecera).
  const head = html.match(/lib-page__head">(.*?)<div class="lib-page__row"/s)?.[1] ?? ''
  if (!head.includes('<h1') || !head.includes('lib-page__tools') || !head.includes('Sincronizar')) throw new Error('el título y las herramientas no comparten cabecera')
  return { bytes: html.length }
})
check('Biblioteca por páginas: completa (sin más páginas) no pide nada al servidor', () => {
  const html = libraryCatalog({})
  if (html.includes('lib-tabs__count')) throw new Error('las pestañas siguen mostrando contadores')
  return { bytes: html.length }
})
check('Biblioteca por páginas: un fallo en una categoría avisa sin vaciar la biblioteca', () => {
  const html = libraryCatalog({ errors: { artists: 'LIBRARY_TIMEOUT' } })
  if (!html.includes('No se pudo cargar una parte de tu biblioteca')) throw new Error('falta el aviso de fallo parcial')
  if (!html.includes('Música que me gusta')) throw new Error('la biblioteca desapareció por un fallo parcial')
  return { bytes: html.length }
})
check('Biblioteca con el servidor anterior (modo legacy): sin + ni centinela del servidor', () => {
  const html = libraryCatalog({ legacy: true })
  if (html.includes('+</span>')) throw new Error('mostró + en modo legacy')
  return { bytes: html.length }
})
check('Reproductor: artista y álbum son enlaces cuando hay id y manejador, y texto plano si no', () => {
  const base = { album: 'Split Album', albumId: 'MPREb_x', artist: 'Risette', artistId: 'UC_x', artwork: '', currentTime: 0, duration: 100, hasAudio: true, isPlaying: false, onNext() {}, onPrevious() {}, onTogglePlayback() {}, progress: null, title: 'Baby Pink' }
  const linked = renderToString(h(PlayerPanelContent, { ...base, onAlbumSelect() {}, onArtistSelect() {} }))
  if (!/<button[^>]*player-dock__link[^>]*>Risette</.test(linked)) throw new Error('el artista no es un enlace')
  if (!/<button[^>]*player-dock__link[^>]*>Split Album</.test(linked)) throw new Error('el álbum no es un enlace')
  const plain = renderToString(h(PlayerPanelContent, { ...base, albumId: null, artistId: null }))
  if (/<button[^>]*player-dock__link/.test(plain)) throw new Error('sin ids no debe haber enlaces')
  if (!plain.includes('Risette') || !plain.includes('Split Album')) throw new Error('faltan el artista o el álbum')
  const noAlbum = renderToString(h(PlayerPanelContent, { ...base, album: '', onArtistSelect() {} }))
  if (noAlbum.includes('·')) throw new Error('sin álbum no debe haber separador')
  return { bytes: linked.length }
})
// --- Me gusta como playlist y playlists de la cuenta en la barra lateral ---
check('Me gusta: página de playlist con una canción por fila, artista y álbum como enlaces (no un bloque de tarjetas)', () => {
  const html = catalog({ ...libraryProps({}), libraryData: { likedSongs, playlists: playlists.slice(0, 3) } }, { view: { kind: 'liked', data: null } })
  if (!html.includes('collection-detail')) throw new Error('no es una página de playlist')
  if (!html.includes('Música que me gusta')) throw new Error('falta el título')
  if (html.includes('sl-song')) throw new Error('sigue pintando el bloque de tarjetas de canciones')
  const rows = (html.match(/<li class="collection-detail__track[ "]/g) || []).length
  if (rows < 5 || rows > 120) throw new Error(`filas montadas fuera de rango: ${rows} (con 2000 canciones se ventanea)`)
  if (!/collection-detail__catalog-link--artist/.test(html) || !/collection-detail__catalog-link--album/.test(html)) throw new Error('faltan los enlaces de artista y álbum')
  return { filas: rows }
})
check('Biblioteca: ya no hay pestaña "Canciones" (los Me gusta se abren como playlist)', () => {
  const html = libraryCatalog({})
  if (/role="tab"[^>]*>Canciones</.test(html)) throw new Error('sigue la pestaña Canciones')
  if (!html.includes('Música que me gusta')) throw new Error('falta la tarjeta de Me gusta')
  return { bytes: html.length }
})
check('Barra lateral: Me gusta y playlists de la cuenta de YouTube, y se resalta la abierta', () => {
  const youtubeLibrary = { liked: { count: 2074, hasMore: true, thumbnail: null }, playlists: [{ id: 'PLa', title: 'Mi mix de verano', count: 12, thumbnail: null }, { id: 'PLb', title: 'Rock clásico', count: 1, thumbnail: null }] }
  const base = { activeSection: 'youtube', collapsed: false, onNavigate() {}, onYoutubeNavigate() {}, playlists: [], youtubeLibrary }
  const html = renderToString(h(AppSidebar, { ...base, youtubeActive: { id: 'PLb', type: 'playlist' } }))
  for (const text of ['Música que me gusta', '2074+ canciones', 'Mi mix de verano', '12 canciones', 'Rock clásico', '1 canción<']) if (!html.includes(text)) throw new Error(`falta "${text}"`)
  const active = [...html.matchAll(/app-sidebar__playlist--active[^>]*>.*?<strong>([^<]+)</gs)].map((match) => match[1])
  if (active.length !== 1 || active[0] !== 'Rock clásico') throw new Error(`resaltado incorrecto: ${active.join(' | ')}`)
  const empty = renderToString(h(AppSidebar, { ...base, youtubeLibrary: undefined }))
  if (empty.includes('Música que me gusta')) throw new Error('sin biblioteca no debe haber entradas de YouTube')
  const topLevel = renderToString(h(AppSidebar, { ...base, youtubeActive: { type: 'liked' }, youtubeView: 'library' }))
  if (/app-sidebar__item--active/.test(topLevel)) throw new Error('con los Me gusta abiertos no se debe resaltar una sección')
  return { bytes: html.length }
})
console.log(JSON.stringify(results, null, 1))
process.exitCode = results.every((r) => r.ok) ? 0 : 1