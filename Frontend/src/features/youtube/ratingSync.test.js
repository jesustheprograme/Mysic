import assert from 'node:assert/strict'
import test from 'node:test'
import { createRatingSync, isUnlinked, isUnsupportedRating, RECENT_MS, reconcileFavorites } from './ratingSync.js'

const httpError = (status, code) => Object.assign(new Error(`HTTP ${status}`), { code, status })

test('push: un cambio aceptado queda como reciente y se reenvía al servidor', async () => {
  const calls = []
  const sync = createRatingSync({ request: async (...args) => { calls.push(args) } })
  assert.equal(await sync.push('song', 'abc', true), 'synced')
  assert.deepEqual(calls, [['song', 'abc', true]])
  assert.equal(sync.recent('song', 'abc'), true)
  assert.equal(sync.recent('album', 'abc'), undefined, 'cada tipo lleva su propio estado')
})

test('push: sin ruta en el servidor o sin cuenta vinculada la marca se queda solo en Mysic (sin error)', async () => {
  const unsupported = createRatingSync({ request: async () => { throw httpError(404) } })
  assert.equal(await unsupported.push('song', 'abc', true), 'local')
  assert.equal(unsupported.recent('song', 'abc'), undefined)
  const unlinked = createRatingSync({ request: async () => { throw httpError(409, 'YOUTUBE_NOT_LINKED') } })
  assert.equal(await unlinked.push('song', 'abc', true), 'local')
  // Un 404 con código es un "no encontrado" de la propia ruta (álbum sin lista de audio): eso sí es un fallo.
  assert.equal(isUnsupportedRating(httpError(404)), true)
  assert.equal(isUnsupportedRating(httpError(404, 'NOT_FOUND')), false)
  assert.equal(isUnlinked(httpError(409)), true)
})

test('push: un fallo pasajero se reintenta una vez; un rechazo no', async () => {
  let attempts = 0
  const waits = []
  const flaky = createRatingSync({ wait: async (ms) => { waits.push(ms) }, request: async () => { attempts += 1; if (attempts === 1) throw httpError(503) } })
  assert.equal(await flaky.push('song', 'abc', true), 'synced')
  assert.equal(attempts, 2)
  assert.equal(waits.length, 1)

  let denied = 0
  const refused = createRatingSync({ request: async () => { denied += 1; throw httpError(403, 'RATING_NOT_ALLOWED') } })
  assert.equal(await refused.push('song', 'abc', true), 'failed')
  assert.equal(denied, 1, 'un 403 no se reintenta')
  assert.equal(refused.recent('song', 'abc'), undefined, 'lo fallido ya no manda sobre YouTube')

  let always = 0
  const down = createRatingSync({ wait: async () => {}, request: async () => { always += 1; throw httpError(502) } })
  assert.equal(await down.push('song', 'abc', true), 'failed')
  assert.equal(always, 2, 'un reintento y se rinde')
})

test('recent: la marca caduca a los dos minutos', async () => {
  let clock = 1_000
  const sync = createRatingSync({ now: () => clock, request: async () => {} })
  await sync.push('album', 'MPREb_1', false)
  assert.equal(sync.recent('album', 'MPREb_1'), false)
  clock += RECENT_MS - 1
  assert.equal(sync.recent('album', 'MPREb_1'), false)
  clock += 2
  assert.equal(sync.recent('album', 'MPREb_1'), undefined)
})

test('reconcile: añade lo nuevo de YouTube y respeta lo que Mysic acaba de quitar', () => {
  const local = new Set(['a'])
  const { add, remove } = reconcileFavorites({ remote: ['a', 'b', 'c'], local, recent: (id) => (id === 'c' ? false : undefined) })
  assert.deepEqual(add, ['b'])
  assert.deepEqual(remove, [])
})

test('reconcile: solo quita lo que YouTube tenía antes y ya no tiene, y solo con el listado completo', () => {
  const local = new Set(['a', 'b', 'solo-mysic'])
  const previous = new Set(['a', 'b'])
  assert.deepEqual(reconcileFavorites({ remote: ['a'], previous, complete: true, local }).remove, ['b'], 'b se quitó en YouTube; solo-mysic no estaba allí y se queda')
  assert.deepEqual(reconcileFavorites({ remote: ['a'], previous, complete: false, local }).remove, [], 'con el listado a medias no se afirma que falte nada')
  assert.deepEqual(reconcileFavorites({ remote: ['a'], previous: null, complete: true, local }).remove, [], 'sin sincronización anterior no se quita nada')
})

test('reconcile: una marca reciente en Mysic gana a lo que dice YouTube', () => {
  const local = new Set(['a', 'b'])
  const result = reconcileFavorites({ remote: [], previous: new Set(['a', 'b']), complete: true, local, recent: (id) => (id === 'a' ? true : undefined) })
  assert.deepEqual(result.remove, ['b'], 'a se acaba de marcar en Mysic y aún no llegó a YouTube')
})
