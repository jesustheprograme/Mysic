import assert from 'node:assert/strict'
import test from 'node:test'
import { createPersistedCache } from '../../lib/persistedCache.js'
import { createLandingCache, isEmptyLanding, LANDING_FRESH_MS, landingScope, pickLandingView, shouldKeepLanding } from './landingCache.js'

const homeView = { kind: 'home', data: { shelves: [{ title: 'A' }] } }
const keep = (patch) => shouldKeepLanding({ kind: 'home', loadedAt: 1_000, now: 1_000 + 60_000, view: homeView, ...patch })

test('las secciones extra del Inicio se recuerdan por alcance, no se pisan con vacío y clearScope las borra', () => {
  const cache = createLandingCache({ persisted: createPersistedCache({ storage: new Map() }) })
  assert.deepEqual(cache.getExtras('u1|p'), [])
  assert.equal(cache.setExtras('u1|p', [{ title: 'A', items: [] }, { title: 'B', items: [] }]), true)
  assert.equal(cache.setExtras('u1|p', []), false)
  assert.deepEqual(cache.getExtras('u1|p').map((shelf) => shelf.title), ['A', 'B'])
  assert.deepEqual(cache.getExtras('u2|p'), []) // otro usuario no ve las de este
  cache.clearScope('u1|p')
  assert.deepEqual(cache.getExtras('u1|p'), [])
})

test('shouldKeepLanding: un Inicio reciente y con contenido se conserva al volver (sin pedirlo de nuevo)', () => {
  assert.equal(keep(), true)
  assert.equal(keep({ kind: 'explore', view: { kind: 'explore', data: { shelves: [{}] } } }), true)
})

test('shouldKeepLanding: caduca pasado el margen, y justo en el margen ya no se conserva', () => {
  assert.equal(keep({ now: 1_000 + LANDING_FRESH_MS - 1 }), true)
  assert.equal(keep({ now: 1_000 + LANDING_FRESH_MS }), false)
})

test('shouldKeepLanding: no se conserva si la vista no es esa, está vacía, hay error o no se sabe cuándo se cargó', () => {
  assert.equal(keep({ view: { kind: 'album', data: { id: 'x' } } }), false)
  assert.equal(keep({ view: { kind: 'home', data: { shelves: [] } } }), false)
  assert.equal(keep({ view: { kind: 'home', data: null } }), false)
  assert.equal(keep({ error: 'No se pudo cargar' }), false)
  assert.equal(keep({ loadedAt: undefined }), false)
  assert.equal(keep({ now: 500 }), false) // reloj hacia atrás
  assert.equal(keep({ kind: 'recommendations', view: { kind: 'recommendations', data: { shelves: [{}] } } }), false)
})

const home = (...titles) => ({ personalized: true, shelves: titles.map((title) => ({ title, items: [{ id: `${title}-1`, kind: 'song' }] })), continuation: 'token-vencido' })
function makeStorage() {
  const map = new Map()
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: (k) => map.delete(k), map }
}
function setup(now = () => 1_000) {
  const storage = makeStorage()
  const persisted = createPersistedCache({ storage, now })
  return { cache: createLandingCache({ persisted, now }), storage, persisted, now }
}

test('el alcance separa usuarios y estado de vinculación', () => {
  assert.notEqual(landingScope('mysic:user:1:youtube', { connected: true }), landingScope('mysic:user:2:youtube', { connected: true }))
  assert.notEqual(landingScope('mysic:user:1:youtube', { connected: true }), landingScope('mysic:user:1:youtube', { connected: false }))
  assert.equal(landingScope('p', null), 'p|a')
})

test('guarda y recupera por alcance y vista, sin el token de continuación', () => {
  const { cache } = setup()
  assert.equal(cache.set('u1|p', 'home', home('A', 'B')), true)
  const hit = cache.get('u1|p', 'home')
  assert.deepEqual(hit.data.shelves.map((shelf) => shelf.title), ['A', 'B'])
  assert.equal(hit.data.continuation, null)
  assert.equal(hit.stale, false)
  assert.equal(cache.get('u1|p', 'explore'), null, 'otra vista')
  assert.equal(cache.get('u2|p', 'home'), null, 'otro usuario')
  assert.equal(cache.get('u1|a', 'home'), null, 'otro estado de cuenta')
})

test('sobrevive a un reinicio (lee del disco) y marca lo viejo como stale', () => {
  let current = 1_000
  const { cache, storage } = setup(() => current)
  cache.set('u1|p', 'home', home('A'))
  const reloaded = createLandingCache({ persisted: createPersistedCache({ storage, now: () => current }), now: () => current })
  assert.equal(reloaded.get('u1|p', 'home').stale, false)
  current += 31 * 60 * 1000
  assert.equal(reloaded.get('u1|p', 'home').stale, true, 'sigue sirviendo, pero marcado como viejo')
})

test('una respuesta vacía nunca sustituye a una válida', () => {
  const { cache } = setup()
  cache.set('u1|p', 'home', home('A'))
  assert.equal(cache.set('u1|p', 'home', { shelves: [] }), false)
  assert.equal(cache.set('u1|p', 'home', null), false)
  assert.deepEqual(cache.get('u1|p', 'home').data.shelves.map((shelf) => shelf.title), ['A'])
  assert.equal(isEmptyLanding({ shelves: [] }), true)
})

test('clearScope invalida exactamente ese alcance, en memoria y en disco', () => {
  const { cache, storage } = setup()
  cache.set('u1|p', 'home', home('A'))
  cache.set('u1|p', 'explore', home('E'))
  cache.set('u2|p', 'home', home('Z'))
  cache.clearScope('u1|p')
  assert.equal(cache.get('u1|p', 'home'), null)
  assert.equal(cache.get('u1|p', 'explore'), null)
  assert.ok(cache.get('u2|p', 'home'), 'el resto queda intacto')
  assert.ok([...storage.map.keys()].every((key) => !key.includes('u1|p')), 'nada quedó en el disco')
})

test('pickLandingView: la copia cubre una vista vacía y nunca tapa una con contenido', () => {
  const cached = { data: home('Guardado'), stale: false }
  const empty = { kind: 'home', data: null }
  const shown = pickLandingView(empty, cached)
  assert.equal(shown.source, 'cache')
  assert.equal(shown.view.data.shelves[0].title, 'Guardado')
  assert.equal(pickLandingView({ kind: 'home', data: { shelves: [] } }, cached).source, 'cache', 'una respuesta vacía inesperada no pisa lo válido')
  assert.equal(pickLandingView({ kind: 'home', data: home('Vivo') }, cached).source, 'live')
  assert.equal(pickLandingView(empty, { ...cached, stale: true }).source, 'stale')
  assert.equal(pickLandingView(empty, null).source, 'live', 'sin copia, lo que haya')
  assert.equal(pickLandingView({ kind: 'artist', data: null }, cached).source, 'live', 'solo Inicio y Explorar')
})