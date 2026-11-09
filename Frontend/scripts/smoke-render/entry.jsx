// Prueba de humo de render: monta los componentes principales con datos grandes (2000 canciones, 900 artistas...)
// en un entorno sin navegador para detectar errores de ejecución que el lint no ve (variables perdidas, props rotas)
// y comprobar que las cuadrículas no pintan miles de tarjetas a la vez. Se ejecuta con: npm run smoke:render
import { renderToString } from 'react-dom/server'
import { createElement as h } from 'react'
import LibraryView from '../../src/features/youtube/LibraryView.jsx'
import ArtistsPage from '../../src/features/discovery/ArtistsPage.jsx'
import StatsPage from '../../src/features/discovery/StatsPage.jsx'
import AppSidebar from '../../src/components/AppSidebar.jsx'
import SectionRoute from '../../src/features/discovery/SectionRoute.jsx'
import { usePlayer } from '../../src/features/youtube/hooks/usePlayer.js'

// Entorno mínimo de navegador para el render del servidor.
const store = new Map()
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) }
globalThis.window = globalThis.window ?? { localStorage: globalThis.localStorage, addEventListener() {}, removeEventListener() {}, location: { origin: 'http://localhost' } }

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

console.log(JSON.stringify(results, null, 1))
process.exitCode = results.every((r) => r.ok) ? 0 : 1